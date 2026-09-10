import { describe, expect, it, vi } from 'vitest'
import { schema } from '@cimi/contract'
import { InMemorySiteScopePort } from '@cimi/guard'
import {
  InMemoryLifecycleLock,
  InMemoryLifecycleOperationStatusReader,
  type LifecycleLock,
} from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import type { MockProxy } from 'vitest-mock-extended'
import { CollectionPolicyService } from '../../collection-policy/service.ts'
import { createPolicyLayers } from '../../collection-policy/fixture.ts'
import type { CollectionPolicyRepository } from '../../collection-policy/repository.ts'
import type { RetentionPolicyRepository } from '../../retention-policy/repository.ts'
import type { SiteRepository } from '../../site/repository.ts'
import { EventIngestionService } from '../service.ts'
import { DefaultIdentitySessionResolver } from '../identity-session.ts'
import type { AcceptanceRepository } from '../repository.ts'
import type { IdentitySessionResolver, IngestionProtection } from '../service.ts'
import { InMemoryIngestionProtection } from '../protection.ts'
import { AcceptanceCoalescer, AcceptanceReservationConflictError } from '../coalescer.ts'

const now = new Date('2026-09-05T00:00:00.000Z')

function createFixture(
  options: {
    protection?: IngestionProtection
    identitySession?: IdentitySessionResolver
    coalescer?: AcceptanceCoalescer
    lifecycleLock?: LifecycleLock
    acceptance?: MockProxy<AcceptanceRepository> & AcceptanceRepository
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

  const acceptanceRepository: MockProxy<AcceptanceRepository> =
    options.acceptance ??
    (() => {
      const repository = mock<AcceptanceRepository>()
      repository.findByEventId.mockResolvedValue(undefined)
      repository.lastReplaySequence.mockResolvedValue(0)
      repository.append.mockImplementation(async (candidates) =>
        candidates.map(() => ({ status: 'accepted' }) as const),
      )
      return repository
    })()

  const service = new EventIngestionService({
    siteRepository,
    collectionPolicy: policy,
    retention: retentionRepository,
    acceptance: acceptanceRepository,
    clock: () => now,
    ...(options.protection === undefined ? {} : { protection: options.protection }),
    ...(options.identitySession === undefined ? {} : { identitySession: options.identitySession }),
    ...(options.coalescer === undefined ? {} : { coalescer: options.coalescer }),
    ...(options.lifecycleLock === undefined ? {} : { lifecycleLock: options.lifecycleLock }),
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
      return candidates.map(() => ({ status: 'accepted' }) as const)
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

  it('coalesces pageviews by pageview ID while allowing distinct event IDs', async () => {
    const { service, acceptanceRepository } = createFixture()
    const first = service.collectEvent(
      event({ kind: 'page_view', pageViewId: 'page-1', pagePath: '/', eventId: 'event-1' }),
    )
    const second = service.collectEvent(
      event({ kind: 'page_view', pageViewId: 'page-1', pagePath: '/', eventId: 'event-2' }),
    )
    await service.flush()

    await expect(first).resolves.toMatchObject({ status: 'accepted', eventId: 'event-1' })
    await expect(second).resolves.toMatchObject({ status: 'duplicate', eventId: 'event-2' })
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

  it('rolls back identity state when acceptance fails before committing it', async () => {
    const identitySession = new DefaultIdentitySessionResolver({ clock: () => now })
    const { service, acceptanceRepository } = createFixture({ identitySession })
    let appendCalls = 0
    const assignments: Array<{
      visitorId: string | null
      analyticsSessionId: string | null
    }> = []
    acceptanceRepository.append.mockImplementation(async (candidates) => {
      appendCalls += 1
      const candidate = candidates[0]
      if (candidate !== undefined) {
        assignments.push({
          visitorId: candidate.visitorId,
          analyticsSessionId: candidate.analyticsSessionId,
        })
      }
      if (appendCalls === 1) throw new Error('sqlite unavailable')
      return candidates.map(() => ({ status: 'accepted' }) as const)
    })

    const failed = service.collectEvent(event({ anonymousIdentityId: 'anonymous-1' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(service.flush()).rejects.toThrow('sqlite unavailable')
    await expect(failed).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

    const retry = service.collectEvent(
      event({ eventId: 'event-2', anonymousIdentityId: 'anonymous-1' }),
    )
    await service.flush()
    await expect(retry).resolves.toMatchObject({ status: 'accepted', eventId: 'event-2' })

    const later = service.collectEvent(
      event({ eventId: 'event-3', anonymousIdentityId: 'anonymous-1' }),
    )
    await service.flush()
    await expect(later).resolves.toMatchObject({ status: 'accepted', eventId: 'event-3' })

    expect(assignments).toHaveLength(3)
    expect(assignments[0]).not.toEqual(assignments[1])
    expect(assignments[1]).toEqual(assignments[2])
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

  it('applies the trusted country before identity assignment', async () => {
    const { service, policyRepository, acceptanceRepository } = createFixture()
    const policy = schema.DEFAULT_COLLECTION_POLICY
    policyRepository.loadLayers.mockResolvedValue(
      createPolicyLayers({
        ...policy,
        exclusions: { ...policy.exclusions, countries: ['DE'] },
      }),
    )

    await expect(service.collectEvent(event(), { country: 'DE' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(acceptanceRepository.append).not.toHaveBeenCalled()
    await service.stop()
  })

  it('records excluded bots without creating visitor or session state', async () => {
    const { service, policyRepository, acceptanceRepository } = createFixture()
    const policy = schema.DEFAULT_COLLECTION_POLICY
    policyRepository.loadLayers.mockResolvedValue(
      createPolicyLayers({ ...policy, botPolicy: 'record_excluded' }),
    )
    acceptanceRepository.append.mockImplementation(async (candidates) => {
      expect(candidates[0]).toMatchObject({
        visitorId: null,
        analyticsSessionId: null,
        event: {
          anonymousIdentityId: null,
          identifiedUserId: null,
          botPolicyOutcome: 'recorded_excluded',
        },
      })
      return candidates.map(() => ({ status: 'accepted' }) as const)
    })

    const result = service.collectEvent(event({ anonymousIdentityId: 'anonymous-bot' }), {
      isBot: true,
    })
    await service.flush()

    await expect(result).resolves.toMatchObject({ status: 'accepted' })
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
      return candidates.map(() => ({ status: 'accepted' }) as const)
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
    const protection = new InMemoryIngestionProtection({
      siteRatePerSecond: 1,
      siteBurst: 1,
      sourceIpRatePerSecond: 1,
      sourceIpBurst: 1,
    })
    await protection.consume({
      siteId: 'ste_1',
      sourceIp: '203.0.113.10',
      units: 1,
      now,
    })
    const { service, policyRepository, acceptanceRepository } = createFixture({ protection })

    await expect(service.collectEvent(event(), { sourceIp: '203.0.113.10' })).rejects.toMatchObject(
      {
        code: 'TOO_MANY_REQUESTS',
      },
    )
    expect(policyRepository.loadLayers).not.toHaveBeenCalled()
    expect(acceptanceRepository.append).not.toHaveBeenCalled()
    await service.stop()
  })

  it('persists only the identity assignment returned by the resolver', async () => {
    const identitySession: IdentitySessionResolver = {
      async resolve() {
        return {
          visitorId: 'visitor-1',
          identifiedUserId: 'user-1',
          analyticsSessionId: 'session-1',
        }
      },
    }
    const { service, acceptanceRepository } = createFixture({ identitySession })
    acceptanceRepository.append.mockImplementation(async (candidates) => {
      expect(candidates[0]).toMatchObject({
        visitorId: 'visitor-1',
        analyticsSessionId: 'session-1',
        event: { identifiedUserId: 'user-1' },
      })
      return candidates.map(() => ({ status: 'accepted' }) as const)
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
    acceptanceRepository.append.mockImplementation(async (candidates) =>
      candidates.map(() => ({ status: 'accepted' }) as const),
    )
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

  it('admits under an ingestion lease and releases it after resolution', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const { service } = createFixture({ lifecycleLock })

    const resultPromise = service.collectEvent(event())
    await service.flush()

    await expect(resultPromise).resolves.toMatchObject({ status: 'accepted' })
    await service.stop()
  })

  it('holds the ingestion lease until the acceptance commit completes', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const acceptanceRepository = mock<AcceptanceRepository>()
    acceptanceRepository.findByEventId.mockResolvedValue(undefined)
    acceptanceRepository.lastReplaySequence.mockResolvedValue(0)
    let releaseAppend!: () => void
    const appendReleased = new Promise<void>((resolve) => {
      releaseAppend = resolve
    })
    let appendStarted = false
    acceptanceRepository.append.mockImplementation(async (candidates) => {
      appendStarted = true
      await appendReleased
      return candidates.map(() => ({ status: 'accepted' }) as const)
    })
    const coalescer = new AcceptanceCoalescer({
      repository: acceptanceRepository,
      windowMs: 60_000,
      clock: () => now,
    })
    const { service } = createFixture({
      acceptance: acceptanceRepository,
      coalescer,
      lifecycleLock,
    })

    const resultPromise = service.collectEvent(event())
    await vi.waitFor(() => expect(coalescer.queueDepth).toBe(1))
    const flushPromise = service.flush()
    await vi.waitFor(() => expect(appendStarted).toBe(true))

    expect(lifecycleLock.acquire('retention')).toBeUndefined()
    releaseAppend()
    await flushPromise
    await expect(resultPromise).resolves.toMatchObject({ status: 'accepted' })
    const retentionLease = lifecycleLock.acquire('retention')
    expect(retentionLease).toBeDefined()
    await retentionLease?.release()
    await service.stop()
  })

  it('returns service unavailable while a lifecycle operation holds the lock', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const lease = lifecycleLock.acquire('site_deletion')
    expect(lease).toBeDefined()
    const { service } = createFixture({ lifecycleLock })

    await expect(service.collectEvent(event())).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
    await lease?.release()
    await service.stop()
  })

  it('returns not found for an unknown site while a lifecycle operation holds the lock', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const lease = lifecycleLock.acquire('site_deletion')
    expect(lease).toBeDefined()
    const { service, siteRepository } = createFixture({ lifecycleLock })
    siteRepository.findByIngestionIdentifier.mockResolvedValue(undefined)

    await expect(service.collectEvent(event())).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await lease?.release()
    await service.stop()
  })

  it('shares the ingestion lock with another ingestion request', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const { service, acceptanceRepository } = createFixture({ lifecycleLock })

    const resultPromise = service.collectEvent(event())
    await service.flush()

    await expect(resultPromise).resolves.toMatchObject({ status: 'accepted' })
    expect(acceptanceRepository.append).toHaveBeenCalledTimes(1)
    await service.stop()
  })

  it('grandfathers a candidate admitted before the site flips to deleting', async () => {
    const { service, siteRepository, acceptanceRepository } = createFixture()
    acceptanceRepository.append.mockImplementation(async (candidates) => {
      siteRepository.findByIngestionIdentifier.mockResolvedValue({
        ...site(),
        status: 'deleting',
      })
      expect(candidates[0]?.event.eventId).toBe('event-1')
      return candidates.map(() => ({ status: 'accepted' }) as const)
    })

    const resultPromise = service.collectEvent(event())
    await service.flush()

    await expect(resultPromise).resolves.toMatchObject({ status: 'accepted' })
    await service.stop()
  })

  it('reports cross-request pending duplicates with the original receipt time', async () => {
    const { service } = createFixture()

    const first = service.collectEvent(event())
    const second = service.collectEvent(event())
    await service.flush()

    await expect(first).resolves.toEqual({
      status: 'accepted',
      eventId: 'event-1',
      receiptTime: now.toISOString(),
    })
    await expect(second).resolves.toEqual({
      status: 'duplicate',
      eventId: 'event-1',
      receiptTime: now.toISOString(),
    })
    await service.stop()
  })

  it('surfaces a split-flush failure as service unavailable and supports retry by Event ID', async () => {
    const acceptanceRepository = mock<AcceptanceRepository>()
    acceptanceRepository.findByEventId.mockResolvedValue(undefined)
    acceptanceRepository.lastReplaySequence.mockResolvedValue(0)
    acceptanceRepository.append.mockResolvedValue([])
    const stored = new Map<string, { receiptTime: string; payloadFingerprint: string }>()
    let appendCalls = 0
    acceptanceRepository.append.mockImplementation(async (candidates) => {
      appendCalls += 1
      if (appendCalls === 2) throw new Error('sqlite unavailable')
      for (const candidate of candidates) {
        stored.set(candidate.event.eventId, {
          receiptTime: candidate.receiptTime,
          payloadFingerprint: candidate.payloadFingerprint,
        })
      }
      return candidates.map(() => ({ status: 'accepted' }) as const)
    })
    acceptanceRepository.findByEventId.mockImplementation(async (_siteId, eventId) =>
      stored.get(eventId),
    )
    const { service } = createFixture({
      acceptance: acceptanceRepository,
      coalescer: new AcceptanceCoalescer({
        repository: acceptanceRepository,
        windowMs: 60_000,
        flushMaxEvents: 2,
        pendingMaxEvents: 10,
        clock: () => now,
      }),
    })

    const batch = () => ({
      ingestionIdentifier: 'ing-1',
      events: [
        event({ eventId: 'event-1' }),
        event({ eventId: 'event-2' }),
        event({ eventId: 'event-3' }),
        event({ eventId: 'event-4' }),
      ],
    })
    const failed = service.collectEvents(batch())
    await expect(failed).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    expect(appendCalls).toBe(2)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const retry = service.collectEvents(batch())
    await service.flush()

    await expect(retry).resolves.toEqual({
      results: [
        { status: 'duplicate', eventId: 'event-1', receiptTime: now.toISOString() },
        { status: 'duplicate', eventId: 'event-2', receiptTime: now.toISOString() },
        { status: 'accepted', eventId: 'event-3', receiptTime: now.toISOString() },
        { status: 'accepted', eventId: 'event-4', receiptTime: now.toISOString() },
      ],
    })
    await service.stop()
  })

  it('returns service unavailable when the acceptance queue is saturated', async () => {
    const acceptanceRepository = mock<AcceptanceRepository>()
    acceptanceRepository.lastReplaySequence.mockResolvedValue(0)
    let releaseAppend: (() => void) | undefined
    acceptanceRepository.append.mockImplementation(
      (candidates) =>
        new Promise<readonly { status: 'accepted' }[]>((resolve) => {
          releaseAppend = () => resolve(candidates.map(() => ({ status: 'accepted' }) as const))
        }),
    )
    const { service } = createFixture({
      acceptance: acceptanceRepository,
      coalescer: new AcceptanceCoalescer({
        repository: acceptanceRepository,
        flushMaxEvents: 1,
        pendingMaxEvents: 0,
        windowMs: 60_000,
        clock: () => now,
      }),
    })

    const first = service.collectEvent(event())
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(service.collectEvent(event({ eventId: 'event-2' }))).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })

    releaseAppend?.()
    await expect(first).resolves.toMatchObject({ status: 'accepted' })
    await service.stop()
  })

  it('maps a coalescer reservation conflict to a request-level conflict', async () => {
    const { service, acceptanceRepository } = createFixture()
    acceptanceRepository.append.mockRejectedValue(
      new AcceptanceReservationConflictError('ste_1', 'event-1'),
    )

    await expect(service.collectEvent(event())).rejects.toMatchObject({ code: 'CONFLICT' })
    await service.stop()
  })
})
