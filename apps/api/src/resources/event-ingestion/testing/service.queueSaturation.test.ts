import { describe, expect, it } from 'vitest'
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

describe('EventIngestionService.queueSaturation', () => {
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
})
