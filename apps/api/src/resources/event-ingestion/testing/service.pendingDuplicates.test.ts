import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import { InMemorySiteScopePort, type SiteIngestionPort } from '@cimi/guard'
import {
  InMemoryLifecycleLock,
  InMemoryLifecycleOperationStatusReader,
  InMemoryRetentionResolver,
  type LifecycleLock,
} from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import type { MockProxy } from 'vitest-mock-extended'
import { CollectionPolicyService } from '../../collection-policy/service.ts'
import { createPolicyLayers } from '../../collection-policy/fixture.ts'
import type { CollectionPolicyRepository } from '../../collection-policy/repository.ts'
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
  const sites = mock<SiteIngestionPort>()
  sites.findActiveByIngestionIdentifier.mockResolvedValue({
    id: 'ste_1',
    hostname: 'example.com',
    reportingTimezone: 'UTC',
  })

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

  return { service, sites, policyRepository, acceptanceRepository }
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

describe('EventIngestionService.pendingDuplicates', () => {
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
})
