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
import type { SiteIngestionPort } from '@cimi/guard'
import { createIngestionSite } from '../../site/fixture.ts'
import { InMemoryRetentionResolver } from '@cimi/kernel'
import { CollectionPolicyService } from '../../collection-policy/service.ts'
import { createPolicyLayers } from '../../collection-policy/fixture.ts'
import type { CollectionPolicyRepository } from '../../collection-policy/repository.ts'
import { EventIngestionService } from '../service.ts'
import { DefaultIdentitySessionResolver } from '../identity-session.ts'
import type { AcceptanceRepository } from '../repository.ts'
import type { IdentitySessionResolver, IngestionProtection } from '../service.ts'
import { AcceptanceCoalescer } from '../coalescer.ts'
import type { JsonValue } from '@cimi/utils'

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
  const sites = mock<SiteIngestionPort>()
  sites.findActiveByIngestionIdentifier.mockResolvedValue(ingestionSite)

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

  const retention = new InMemoryRetentionResolver(schema.DEFAULT_RETENTION_POLICY)

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
    sites,
    collectionPolicy: policy,
    retention,
    acceptance: acceptanceRepository,
    clock: () => now,
    ...(options.withoutResolver !== true && {
      identitySession:
        options.identitySession ?? new DefaultIdentitySessionResolver({ clock: () => now }),
    }),
    ...(options.protection !== undefined && { protection: options.protection }),
    ...(options.coalescer !== undefined && { coalescer: options.coalescer }),
    ...(options.lifecycleLock !== undefined && { lifecycleLock: options.lifecycleLock }),
  })

  return { service, sites, policyRepository, acceptanceRepository }
}

function event(overrides: Record<string, JsonValue> = {}) {
  return {
    eventId: 'event-1',
    ingestionIdentifier: 'ing-1',
    kind: 'custom_event' as const,
    name: 'checkout_completed',
    ...overrides,
  }
}

const ingestionSite = createIngestionSite()

describe('EventIngestionService.flushFailureRetry', () => {
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
})
