import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema } from '@cimi/db'
import { schema as contractSchema } from '@cimi/contract'
import { mock } from 'vitest-mock-extended'
import { InMemoryLifecycleLock, InMemoryLifecycleOperationStatusReader } from '@cimi/kernel'
import { InMemorySiteScopePort } from '@cimi/guard'
import type { CollectionPolicyRepository } from '../../collection-policy/repository.ts'
import { CollectionPolicyService } from '../../collection-policy/service.ts'
import type { PolicyLayers } from '../../collection-policy/model.ts'
import type { RetentionPolicyRepository } from '../../retention-policy/repository.ts'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { SiteRepositoryDrizzle } from '../../site/repository.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { createEventIngestion } from '../index.ts'

const now = new Date('2026-09-10T06:00:00.000Z')

function createFixture() {
  const siteFixture = createSiteDrizzleFixture()
  const db = siteFixture.db
  db.update(schema.TSite)
    .set({ ingestionIdentifier: 'ing_1' })
    .where(eq(schema.TSite.id, 'ste_1'))
    .run()
  const policyRepository = mock<CollectionPolicyRepository>()
  policyRepository.loadLayers.mockImplementation(async () => {
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
  const service = new CollectionPolicyService({
    repository: policyRepository,
    lock: new InMemoryLifecycleLock(),
    scope: {
      siteScope: new InMemorySiteScopePort([{ siteId: 'ste_1', organizationId: 'org_1' }]),
      membership: new InMemorySiteScopePort(),
    },
    lifecycle: new InMemoryLifecycleOperationStatusReader(),
    clock: () => now,
  })
  const retention = mock<RetentionPolicyRepository>()
  retention.findResolved.mockResolvedValue({
    installationId: 'ins_1',
    installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    siteOverride: null,
    effectivePolicy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    cleanup: {
      pending: false,
      derived: { status: 'not_applicable', startedAt: null, completedAt: null, errorCode: null },
      backup: { status: 'not_applicable', startedAt: null, completedAt: null, errorCode: null },
    },
    updatedAt: now.toISOString(),
  })
  const ingestion = createEventIngestion({
    db,
    siteRepository: new SiteRepositoryDrizzle({ db }),
    collectionPolicy: service,
    retention,
  })
  return {
    siteFixture,
    ingestion,
    [Symbol.dispose]() {
      siteFixture[Symbol.dispose]()
    },
  }
}

describe('createEventIngestion identity link consumption', () => {
  it('resolves a future anonymous Event to the linked identified user', async () => {
    using fixture = createFixture()
    const db = fixture.siteFixture.db
    await new InstallationRepositoryDrizzle({ db }).insert(createInstallationInsertInput())
    db.insert(schema.TIdentityProfile)
      .values({
        profileId: 'ipr_1',
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        status: 'active',
        profileEpoch: 1,
        traits: null,
        firstSeenAt: new Date('2026-09-10T05:00:00.000Z'),
        lastSeenAt: new Date('2026-09-10T05:00:00.000Z'),
        createdAt: new Date('2026-09-10T05:00:00.000Z'),
        updatedAt: new Date('2026-09-10T05:00:00.000Z'),
      })
      .run()
    db.insert(schema.TIdentityProfileEpoch)
      .values({
        profileId: 'ipr_1',
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        epoch: 1,
        status: 'active',
        startedAt: new Date('2026-09-10T05:00:00.000Z'),
        endedAt: null,
        redactedAt: null,
      })
      .run()
    db.insert(schema.TIdentityLink)
      .values({
        id: 'ilk_1',
        siteId: 'ste_1',
        profileId: 'ipr_1',
        profileEpoch: 1,
        anonymousIdentityId: 'ano_1',
        analyticsSessionId: null,
        effectiveFrom: new Date('2026-09-10T05:00:00.000Z'),
        linkedAt: new Date('2026-09-10T05:00:00.000Z'),
        unlinkedAt: null,
      })
      .run()

    const result = fixture.ingestion.service.collectEvent({
      eventId: 'event-1',
      ingestionIdentifier: 'ing_1',
      kind: 'page_view',
      pagePath: '/home',
      anonymousIdentityId: 'ano_1',
    })
    await fixture.ingestion.service.flush()
    await expect(result).resolves.toMatchObject({ status: 'accepted' })

    const accepted = db
      .select({
        identifiedUserId: schema.TAcceptedEvent.identifiedUserId,
        visitorId: schema.TAcceptedEvent.visitorId,
        analyticsSessionId: schema.TAcceptedEvent.analyticsSessionId,
      })
      .from(schema.TAcceptedEvent)
      .all()
    expect(accepted[0]).toMatchObject({
      identifiedUserId: 'app_user_1',
    })
    expect(accepted[0]?.visitorId).not.toBeNull()
    expect(accepted[0]?.analyticsSessionId).not.toBeNull()
    await fixture.ingestion.service.stop()
  })
})
