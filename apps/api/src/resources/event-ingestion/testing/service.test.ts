import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import { InMemorySiteScopePort } from '@cimi/guard'
import { InMemoryLifecycleLock, InMemoryLifecycleOperationStatusReader } from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import { CollectionPolicyService } from '../../collection-policy/service.ts'
import { createPolicyLayers } from '../../collection-policy/fixture.ts'
import type { CollectionPolicyRepository } from '../../collection-policy/repository.ts'
import type { RetentionPolicyRepository } from '../../retention-policy/repository.ts'
import type { SiteRepository } from '../../site/repository.ts'
import { EventIngestionService } from '../service.ts'
import type { AcceptanceRepository } from '../repository.ts'
import type { IdentitySessionResolver, IngestionProtection } from '../service.ts'
import { AcceptanceCoalescer } from '../coalescer.ts'
import { ORPCError } from '@orpc/server'

const now = new Date('2026-09-05T00:00:00.000Z')

function createFixture(
  options: {
    protection?: IngestionProtection
    identitySession?: IdentitySessionResolver
    coalescer?: AcceptanceCoalescer
  } = {},
) {
  const siteRepository = mock<SiteRepository>()
  siteRepository.findByIngestionIdentifier.mockResolvedValue(site())

  const policyRepository = mock<CollectionPolicyRepository>()
  policyRepository.loadLayers.mockResolvedValue(createPolicyLayers())
  const policy = new CollectionPolicyService({
    repository: policyRepository,
    lock: new InMemoryLifecycleLock(),
    scope: {
      siteScope: new InMemorySiteScopePort([{ siteId: 'ste_1', organizationId: 'org_1' }]),
      membership: new InMemorySiteScopePort(),
    },
    lifecycle: new InMemoryLifecycleOperationStatusReader(),
    clock: () => now,
  })

  const retentionRepository = mock<RetentionPolicyRepository>()
  retentionRepository.findResolved.mockResolvedValue({
    installationId: 'ins_1',
    installationDefault: schema.DEFAULT_RETENTION_POLICY,
    siteOverride: null,
    effectivePolicy: schema.DEFAULT_RETENTION_POLICY,
    cleanup: {
      pending: false,
      derived: { status: 'not_applicable', startedAt: null, completedAt: null, errorCode: null },
      backup: { status: 'not_applicable', startedAt: null, completedAt: null, errorCode: null },
    },
    updatedAt: now.toISOString(),
  })

  const acceptanceRepository = mock<AcceptanceRepository>()
  acceptanceRepository.findByEventId.mockResolvedValue(undefined)
  acceptanceRepository.lastReplaySequence.mockResolvedValue(0)
  acceptanceRepository.append.mockResolvedValue()

  const service = new EventIngestionService({
    siteRepository,
    collectionPolicy: policy,
    retention: retentionRepository,
    acceptance: acceptanceRepository,
    clock: () => now,
    ...(options.protection === undefined ? {} : { protection: options.protection }),
    ...(options.identitySession === undefined ? {} : { identitySession: options.identitySession }),
    ...(options.coalescer === undefined ? {} : { coalescer: options.coalescer }),
  })

  return { service, siteRepository, policyRepository, acceptanceRepository }
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'event-1',
    ingestionIdentifier: 'ing-1',
    kind: 'custom_event' as const,
    name: 'checkout_completed',
    ...overrides,
  }
}

function site(): SiteRepository.SiteRecord {
  return {
    id: 'ste_1',
    organizationId: 'org_1',
    name: 'Production',
    hostname: 'example.com',
    ingestionIdentifier: 'ing-1',
    reportingTimezone: 'UTC',
    weekStartsOn: 'monday',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    status: 'active',
    deleteRequestedAt: null,
    deletedAt: null,
    recoveryDeadline: null,
    purgeAt: null,
    purgedAt: null,
    currentOperationId: null,
    cleanupStatus: 'not-required',
    cleanupUpdatedAt: null,
    cleanupError: null,
  }
}

describe('EventIngestionService', () => {
  it('waits for the acceptance flush before returning accepted', async () => {
    const { service, acceptanceRepository } = createFixture()
    const resultPromise = service.collectEvent(event())

    await service.flush()

    await expect(resultPromise).resolves.toEqual({
      status: 'accepted',
      eventId: 'event-1',
      receiptTime: now.toISOString(),
    })
    expect(acceptanceRepository.append).toHaveBeenCalledTimes(1)
    await service.stop()
  })

  it('returns the durable duplicate and rejects changed payloads', async () => {
    const { service, acceptanceRepository } = createFixture()
    const stored = new Map<string, { receiptTime: string; payloadFingerprint: string }>()
    acceptanceRepository.findByEventId.mockImplementation(async (_siteId, eventId) =>
      stored.get(eventId),
    )
    acceptanceRepository.append.mockImplementation(async (candidates) => {
      for (const candidate of candidates) {
        stored.set(candidate.event.eventId, {
          receiptTime: candidate.receiptTime,
          payloadFingerprint: candidate.payloadFingerprint,
        })
      }
    })

    const first = service.collectEvent(event())
    await service.flush()
    await expect(first).resolves.toMatchObject({ status: 'accepted' })

    await expect(service.collectEvent(event())).resolves.toEqual({
      status: 'duplicate',
      eventId: 'event-1',
      receiptTime: now.toISOString(),
    })
    await expect(service.collectEvent(event({ name: 'different_meaning' }))).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await service.stop()
  })

  it('returns independent batch outcomes in input order', async () => {
    const { service, policyRepository, acceptanceRepository } = createFixture()
    const policy = schema.DEFAULT_COLLECTION_POLICY
    policyRepository.loadLayers.mockResolvedValue(
      createPolicyLayers({
        ...policy,
        exclusions: { ...policy.exclusions, paths: ['/private'] },
      }),
    )

    const resultPromise = service.collectEvents({
      ingestionIdentifier: 'ing-1',
      events: [
        event(),
        { eventId: 'bad', kind: 'unknown' },
        {
          eventId: 'refused',
          ingestionIdentifier: 'ing-1',
          kind: 'page_view',
          pagePath: '/private/account',
        },
      ],
    })
    await service.flush()

    await expect(resultPromise).resolves.toEqual({
      results: [
        { status: 'accepted', eventId: 'event-1', receiptTime: now.toISOString() },
        { status: 'itemError', eventId: 'bad', code: 'BAD_REQUEST' },
        { status: 'rejected', eventId: 'refused', reason: 'policy' },
      ],
    })
    expect(acceptanceRepository.append).toHaveBeenCalledTimes(1)
    await service.stop()
  })

  it('waits for one in-flight reservation when a batch repeats an Event ID', async () => {
    const { service, acceptanceRepository } = createFixture()

    const resultPromise = service.collectEvents({
      ingestionIdentifier: 'ing-1',
      events: [event(), event()],
    })
    await service.flush()

    await expect(resultPromise).resolves.toEqual({
      results: [
        { status: 'accepted', eventId: 'event-1', receiptTime: now.toISOString() },
        { status: 'duplicate', eventId: 'event-1', receiptTime: now.toISOString() },
      ],
    })
    expect(acceptanceRepository.append).toHaveBeenCalledTimes(1)
    await service.stop()
  })

  it('releases reservations after a failed flush so the Event ID can be retried', async () => {
    const { service, acceptanceRepository } = createFixture()
    acceptanceRepository.append.mockRejectedValueOnce(new Error('sqlite unavailable'))

    const failed = service.collectEvent(event())
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(service.flush()).rejects.toThrow('sqlite unavailable')
    await expect(failed).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

    const retry = service.collectEvent(event())
    await service.flush()
    await expect(retry).resolves.toMatchObject({ status: 'accepted', eventId: 'event-1' })
    await service.stop()
  })

  it('returns a generic forbidden error for a singular policy refusal', async () => {
    const { service, policyRepository, acceptanceRepository } = createFixture()
    const policy = schema.DEFAULT_COLLECTION_POLICY
    policyRepository.loadLayers.mockResolvedValue(
      createPolicyLayers({
        ...policy,
        exclusions: { ...policy.exclusions, paths: ['/private'] },
      }),
    )

    await expect(
      service.collectEvent({
        eventId: 'private-page',
        ingestionIdentifier: 'ing-1',
        kind: 'page_view',
        pagePath: '/private/account',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(acceptanceRepository.append).not.toHaveBeenCalled()
    await service.stop()
  })

  it('maps acceptance lookup failures to service unavailable', async () => {
    const { service, acceptanceRepository } = createFixture()
    acceptanceRepository.findByEventId.mockRejectedValueOnce(new Error('sqlite unavailable'))

    await expect(service.collectEvent(event())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
    await service.stop()
  })

  it('sanitizes outbound destinations before persistence', async () => {
    const { service, acceptanceRepository } = createFixture()
    acceptanceRepository.append.mockImplementation(async (candidates) => {
      expect(candidates[0]?.event).toMatchObject({
        kind: 'outbound',
        destination: 'https://example.com/checkout',
      })
    })

    const resultPromise = service.collectEvent(
      event({
        kind: 'outbound',
        name: 'checkout',
        destination: 'https://example.com/checkout?token=secret&campaign=spring',
      }),
    )
    await service.flush()

    await expect(resultPromise).resolves.toMatchObject({ status: 'accepted' })
    await service.stop()
  })

  it('charges source protection before policy admission', async () => {
    const protection = mock<IngestionProtection>()
    protection.consume.mockRejectedValueOnce(new ORPCError('TOO_MANY_REQUESTS', { status: 429 }))
    const { service, policyRepository, acceptanceRepository } = createFixture({ protection })

    await expect(service.collectEvent(event(), { sourceIp: '203.0.113.10' })).rejects.toMatchObject(
      {
        code: 'TOO_MANY_REQUESTS',
      },
    )
    expect(protection.consume).toHaveBeenCalledWith({
      siteId: 'ste_1',
      sourceIp: '203.0.113.10',
      units: 1,
      now,
    })
    expect(policyRepository.loadLayers).not.toHaveBeenCalled()
    expect(acceptanceRepository.append).not.toHaveBeenCalled()
    await service.stop()
  })

  it('persists only the identity assignment returned by the resolver', async () => {
    const identitySession = mock<IdentitySessionResolver>()
    identitySession.resolve.mockResolvedValue({
      visitorId: 'visitor-1',
      identifiedUserId: 'user-1',
      analyticsSessionId: 'session-1',
    })
    const { service, acceptanceRepository } = createFixture({ identitySession })
    acceptanceRepository.append.mockImplementation(async (candidates) => {
      expect(candidates[0]).toMatchObject({
        visitorId: 'visitor-1',
        analyticsSessionId: 'session-1',
        event: { identifiedUserId: 'user-1' },
      })
    })

    const resultPromise = service.collectEvent(event({ identifiedUserId: 'user-1' }))
    await service.flush()

    await expect(resultPromise).resolves.toMatchObject({ status: 'accepted' })
    await service.stop()
  })

  it('fails closed for an identified reference without an identity resolver', async () => {
    const { service, acceptanceRepository } = createFixture()

    await expect(
      service.collectEvent(
        event({ identifiedUserId: 'user-1', collectionContext: { consent: 'granted' } }),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(acceptanceRepository.append).not.toHaveBeenCalled()
    await service.stop()
  })

  it('serializes only the lifecycle boundary while concurrent events share the queue', async () => {
    const acceptanceRepository = mock<AcceptanceRepository>()
    acceptanceRepository.findByEventId.mockResolvedValue(undefined)
    acceptanceRepository.lastReplaySequence.mockResolvedValue(0)
    acceptanceRepository.append.mockResolvedValue()
    const coalescer = new AcceptanceCoalescer({
      repository: acceptanceRepository,
      windowMs: 1,
      clock: () => now,
    })
    const { service } = createFixture({ coalescer })

    const results = await Promise.all([
      service.collectEvent(event({ eventId: 'event-1' })),
      service.collectEvent(event({ eventId: 'event-2' })),
    ])

    expect(results).toEqual([
      { status: 'accepted', eventId: 'event-1', receiptTime: now.toISOString() },
      { status: 'accepted', eventId: 'event-2', receiptTime: now.toISOString() },
    ])
    expect(acceptanceRepository.append).toHaveBeenCalledTimes(1)
    await service.stop()
  })
})
