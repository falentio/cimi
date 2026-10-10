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

describe('EventIngestionService.collectEvents', () => {
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
        event({
          eventId: 'batch-error',
          kind: 'error',
          name: 'TypeError',
          code: 'E1',
          message: "GET /search?q=O'Reilly&token=secret at async handler (/app/secret.ts:1:2)",
        }),
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
        { status: 'accepted', eventId: 'batch-error', receiptTime: now.toISOString() },
        { status: 'itemError', eventId: 'bad', code: 'BAD_REQUEST' },
        { status: 'rejected', eventId: 'refused', reason: 'policy' },
      ],
    })
    expect(acceptanceRepository.append).toHaveBeenCalledTimes(1)
    expect(acceptanceRepository.append).toHaveBeenCalledWith([
      expect.objectContaining({ event: expect.objectContaining({ eventId: 'event-1' }) }),
      expect.objectContaining({
        event: expect.objectContaining({ eventId: 'batch-error', message: 'GET /search' }),
      }),
    ])
    await service.stop()
  })
})
