import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { RetentionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'

const createdAt = new Date('2026-09-01T00:00:00.000Z')
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
  it('rejects resolution when no installation exists', async () => {
    using fixture = createFixture()
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })

    await expect(repository.findResolved({ siteId: null })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('falls back to the built-in 12/12/null default without policy rows', async () => {
    using fixture = createFixture()
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TInstallation)
      .values({
        id: 'ins_1',
        singletonKey: 'default',
        status: 'uninitialized',
        eventRetentionMonths: 12,
        profileRetentionMonths: 12,
        replayRetentionMonths: null,
        dataDirectoryReady: false,
        createdAt,
        updatedAt: createdAt,
      })
      .run()

    await expect(repository.findResolved({ siteId: null })).resolves.toEqual({
      installationId: 'ins_1',
      installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      siteOverride: null,
      effectivePolicy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      updatedAt: createdAt.toISOString(),
    })
  })

  it('versions the installation default and updates the summary in the same transaction', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(createInstallationInsertInput())
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    const policy = { eventMonths: 24, profileMonths: 18, replayMonths: 6 }

    const resolved = await repository.saveInstallationDefault({ id: 'rtn_2', policy, now })

    expect(resolved).toEqual({
      installationId: 'ins_1',
      installationDefault: policy,
      siteOverride: null,
      effectivePolicy: policy,
      updatedAt: now.toISOString(),
    })
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
    expect(versions).toEqual(
      expect.arrayContaining([
        { id: 'rtn_1', version: 1, status: 'superseded' },
        { id: 'rtn_2', version: 2, status: 'active' },
      ]),
    )
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
      eventRetentionMonths: 24,
      profileRetentionMonths: 18,
      replayRetentionMonths: 6,
    })
    await expect(repository.findResolved({ siteId: null })).resolves.toMatchObject({
      installationDefault: policy,
      effectivePolicy: policy,
    })
  })

  it('versions site overrides and restores inheritance on clear', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(createInstallationInsertInput())
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    const override = { eventMonths: 6, profileMonths: 6, replayMonths: null }

    await repository.saveSiteOverride({ id: 'rtn_site_1', siteId: 'ste_1', policy: override, now })
    await expect(repository.findResolved({ siteId: 'ste_1' })).resolves.toMatchObject({
      installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      siteOverride: override,
      effectivePolicy: override,
    })

    const updated = { eventMonths: 3, profileMonths: 3, replayMonths: null }
    await repository.saveSiteOverride({ id: 'rtn_site_2', siteId: 'ste_1', policy: updated, now })
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
          eq(schema.TRetentionPolicy.siteId, 'ste_1'),
        ),
      )
      .all()
    expect(versions).toEqual(
      expect.arrayContaining([
        { id: 'rtn_site_1', version: 1, status: 'superseded' },
        { id: 'rtn_site_2', version: 2, status: 'active' },
      ]),
    )

    await expect(repository.clearSiteOverride({ siteId: 'ste_1', now })).resolves.toMatchObject({
      siteOverride: null,
      effectivePolicy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    })
    await expect(repository.findResolved({ siteId: 'ste_1' })).resolves.toMatchObject({
      siteOverride: null,
      effectivePolicy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    })
  })
})
