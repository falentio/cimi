import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema } from '@cimi/db'
import { schema as contractSchema } from '@cimi/contract'
import { mock } from 'vitest-mock-extended'
import type { CollectionPolicyRepository } from '../../collection-policy/repository.ts'
import { CollectionPolicyService } from '../../collection-policy/service.ts'
import { InMemoryLifecycleLock, InMemoryLifecycleOperationStatusReader } from '@cimi/kernel'
import { InMemorySiteScopePort } from '@cimi/guard'
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

describe('createEventIngestion reference validation', () => {
  it('rejects an Event whose identified profile is older than the activity cutoff', async () => {
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
        firstSeenAt: new Date('2026-08-01T00:00:00.000Z'),
        lastSeenAt: new Date('2026-08-10T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-10T00:00:00.000Z'),
      })
      .run()
    const cutoff = new Date('2026-09-01T00:00:00.000Z')
    db.insert(schema.TRetentionEffectiveCutoff)
      .values({
        siteId: 'ste_1',
        installationId: 'ins_1',
        policyId: 'rtn_1',
        reportingTimezone: 'UTC',
        localDay: '2026-09-10',
        eventOccurrenceCutoffAt: cutoff,
        rawReceiptCutoffAt: cutoff,
        profileActivityCutoffAt: cutoff,
        replayReceiptCutoffAt: null,
        effectiveAt: cutoff,
        updatedAt: cutoff,
      })
      .run()

    await expect(
      fixture.ingestion.service.collectEvent({
        eventId: 'event-1',
        ingestionIdentifier: 'ing_1',
        kind: 'custom_event',
        name: 'checkout_completed',
        identifiedUserId: 'app_user_1',
        collectionContext: { consent: 'granted' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await fixture.ingestion.service.stop()
  })
})
