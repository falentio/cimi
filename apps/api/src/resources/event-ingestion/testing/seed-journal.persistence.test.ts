import { describe, expect, it } from 'vitest'
import { asc } from 'drizzle-orm'
import { schema } from '@cimi/db'
import { schema as contractSchema } from '@cimi/contract'
import { mock } from 'vitest-mock-extended'
import { InMemoryLifecycleLock, InMemoryLifecycleOperationStatusReader } from '@cimi/kernel'
import { InMemorySiteScopePort } from '@cimi/guard'
import type { CollectionPolicyRepository } from '../../collection-policy/repository.ts'
import { CollectionPolicyService } from '../../collection-policy/service.ts'
import type { PolicyLayers } from '../../collection-policy/model.ts'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import type { DemoSeedEvent } from '../../demo-seed/ports.ts'
import { AcceptanceRepositoryDrizzle } from '../repository.drizzle.ts'
import { AcceptanceSeedJournal } from '../seed-journal.ts'

const now = new Date('2026-04-01T12:00:00.000Z')

function common(eventId: string) {
  return {
    eventId,
    occurrenceTime: '2026-03-30T09:15:00.000Z',
    visitorId: 'ste_1-v1',
    analyticsSessionId: 'ste_1-s1',
    properties: {},
  }
}

const events: readonly DemoSeedEvent[] = [
  {
    ...common('ste_1-e0'),
    kind: 'page_view',
    pageViewId: 'ste_1-pv0',
    pagePath: '/pricing',
    referrer: 'https://www.google.com/',
  },
  {
    ...common('ste_1-e1'),
    kind: 'performance',
    name: 'largest_contentful_paint',
    value: 820,
    unit: null,
  },
  {
    ...common('ste_1-e2'),
    kind: 'error',
    name: 'NetworkError',
    code: null,
    message: 'Failed to fetch',
  },
]

function createPolicyService(db: SiteDrizzleDb) {
  const repository = mock<CollectionPolicyRepository>()
  repository.loadLayers.mockImplementation(async () => {
    const revision = db
      .select({ id: schema.TCollectionPolicyRevision.id })
      .from(schema.TCollectionPolicyRevision)
      .limit(1)
      .all()[0]

    if (revision === undefined) throw new Error('Expected a seeded collection policy revision')

    const layers: PolicyLayers = {
      installation: {
        id: revision.id,
        version: 1,
        target: { scope: 'installation' },
        values: contractSchema.DEFAULT_COLLECTION_POLICY,
      },
      site: null,
    }

    return layers
  })

  return new CollectionPolicyService({
    repository,
    lock: new InMemoryLifecycleLock(),
    scope: {
      siteScope: new InMemorySiteScopePort(),
      membership: new InMemorySiteScopePort(),
    },
    lifecycle: new InMemoryLifecycleOperationStatusReader(),
    clock: () => now,
  })
}

type SiteDrizzleDb = ReturnType<typeof createSiteDrizzleFixture>['db']

function createJournal(db: SiteDrizzleDb) {
  return new AcceptanceSeedJournal({
    acceptance: new AcceptanceRepositoryDrizzle({ db }),
    collectionPolicy: createPolicyService(db),
    clock: () => now,
  })
}

function replaySequences(db: SiteDrizzleDb): readonly number[] {
  return db
    .select({ replaySequence: schema.TAcceptedEvent.replaySequence })
    .from(schema.TAcceptedEvent)
    .orderBy(asc(schema.TAcceptedEvent.replaySequence))
    .all()
    .map((row) => row.replaySequence)
}

describe('AcceptanceSeedJournal persistence', () => {
  it('writes accepted rows, kind tables, and a rising replay sequence', async () => {
    using siteFixture = createSiteDrizzleFixture()
    const db = siteFixture.db
    await new InstallationRepositoryDrizzle({ db }).insert(createInstallationInsertInput())

    await expect(createJournal(db).appendGenerated({ siteId: 'ste_1', events })).resolves.toBe(3)

    expect(replaySequences(db)).toEqual([1, 2, 3])

    const accepted = db
      .select({
        late: schema.TAcceptedEvent.late,
        pageViewId: schema.TAcceptedEvent.pageViewId,
        policyRevisionId: schema.TAcceptedEvent.policyRevisionId,
      })
      .from(schema.TAcceptedEvent)
      .all()

    expect(accepted.every((row) => row.late === true)).toBe(true)
    expect(accepted.filter((row) => row.pageViewId !== null).length).toBe(1)

    const revision = db
      .select({ id: schema.TCollectionPolicyRevision.id })
      .from(schema.TCollectionPolicyRevision)
      .limit(1)
      .all()[0]

    expect(accepted[0]?.policyRevisionId).toBe(revision?.id)

    expect(db.select().from(schema.TEventPerformance).all().length).toBe(1)
    expect(db.select().from(schema.TEventError).all().length).toBe(1)
    expect(db.select().from(schema.TEventAcceptanceJournal).all().length).toBe(3)
  })

  it('continues the replay sequence after the written high-water mark', async () => {
    using siteFixture = createSiteDrizzleFixture()
    const db = siteFixture.db
    await new InstallationRepositoryDrizzle({ db }).insert(createInstallationInsertInput())
    const journal = createJournal(db)

    await journal.appendGenerated({ siteId: 'ste_1', events })

    const more = events.slice(1).map((event, index) => ({
      ...event,
      eventId: `ste_1-e9${index}`,
    }))

    await expect(journal.appendGenerated({ siteId: 'ste_1', events: more })).resolves.toBe(2)
    expect(replaySequences(db)).toEqual([1, 2, 3, 4, 5])
  })
})
