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
import { AcceptanceCoalescer } from '../coalescer.ts'

const now = new Date('2026-09-05T00:00:00.000Z')

function createFixture(
  options: {
    protection?: IngestionProtection
    identitySession?: IdentitySessionResolver
    withoutResolver?: boolean
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
    ...(options.withoutResolver === true
      ? {}
      : {
          identitySession:
            options.identitySession ?? new DefaultIdentitySessionResolver({ clock: () => now }),
        }),
    ...(options.protection === undefined ? {} : { protection: options.protection }),
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

describe('EventIngestionService.ingestionLease', () => {
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
})
