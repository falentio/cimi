import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { RetentionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'

const now = new Date('2026-09-02T00:00:00.000Z')

function createFixture() {
  const siteFixture = createSiteDrizzleFixture()
  return {
    db: siteFixture.db,
    installation: new InstallationRepositoryDrizzle({ db: siteFixture.db }),
    repository: new RetentionPolicyRepositoryDrizzle({ db: siteFixture.db }),
    [Symbol.dispose]() {
      siteFixture[Symbol.dispose]()
    },
  }
}

describe('RetentionPolicyRepositoryDrizzle', () => {
  it('treats clear without an active override as idempotent', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(createInstallationInsertInput())
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    const fallback = { eventMonths: 12, profileMonths: 12, replayMonths: null }

    const resolved = await repository.clearSiteOverride({ siteId: 'ste_1', now })

    expect(resolved).toMatchObject({ siteOverride: null, effectivePolicy: fallback })
    expect(
      fixture.db
        .select()
        .from(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.siteId, 'ste_1'))
        .all(),
    ).toEqual([])
    await expect(repository.findResolved({ siteId: 'ste_1' })).resolves.toMatchObject({
      siteOverride: null,
      effectivePolicy: fallback,
    })
    const installation = fixture.db
      .select({
        eventRetentionMonths: schema.TInstallation.eventRetentionMonths,
        profileRetentionMonths: schema.TInstallation.profileRetentionMonths,
        replayRetentionMonths: schema.TInstallation.replayRetentionMonths,
      })
      .from(schema.TInstallation)
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .all()[0]
    expect(installation).toEqual({
      eventRetentionMonths: 12,
      profileRetentionMonths: 12,
      replayRetentionMonths: null,
    })
  })

  it('leaves the installation summary untouched by site save and clear', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(createInstallationInsertInput())
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    const override = { eventMonths: 6, profileMonths: 6, replayMonths: null }
    const summary = {
      eventRetentionMonths: 12,
      profileRetentionMonths: 12,
      replayRetentionMonths: null,
    }

    await repository.saveSiteOverride({ id: 'rtn_site_1', siteId: 'ste_1', policy: override, now })
    const afterSave = fixture.db
      .select({
        eventRetentionMonths: schema.TInstallation.eventRetentionMonths,
        profileRetentionMonths: schema.TInstallation.profileRetentionMonths,
        replayRetentionMonths: schema.TInstallation.replayRetentionMonths,
      })
      .from(schema.TInstallation)
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .all()[0]
    expect(afterSave).toEqual(summary)

    const cleared = await repository.clearSiteOverride({ siteId: 'ste_1', now })
    const afterClear = fixture.db
      .select({
        eventRetentionMonths: schema.TInstallation.eventRetentionMonths,
        profileRetentionMonths: schema.TInstallation.profileRetentionMonths,
        replayRetentionMonths: schema.TInstallation.replayRetentionMonths,
      })
      .from(schema.TInstallation)
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .all()[0]
    expect(afterClear).toEqual(summary)
    await expect(repository.findResolved({ siteId: 'ste_1' })).resolves.toEqual(cleared)
    const versions = fixture.db
      .select({
        id: schema.TRetentionPolicy.id,
        version: schema.TRetentionPolicy.version,
        status: schema.TRetentionPolicy.status,
      })
      .from(schema.TRetentionPolicy)
      .where(
        and(
          eq(schema.TRetentionPolicy.installationId, 'ins_1'),
          eq(schema.TRetentionPolicy.scope, 'installation'),
        ),
      )
      .all()
    expect(versions).toEqual([{ id: 'rtn_1', version: 1, status: 'active' }])
  })

  it('rejects clearSiteOverride when no installation exists', async () => {
    using fixture = createFixture()
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })

    await expect(repository.clearSiteOverride({ siteId: 'ste_1', now })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(fixture.db.select().from(schema.TRetentionPolicy).all()).toEqual([])
  })
})
