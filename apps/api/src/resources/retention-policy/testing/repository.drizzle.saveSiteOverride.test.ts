import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture, createSiteRow } from '../../site/fixture.drizzle.ts'
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

  it('re-enables a site override after clear with a monotonic version', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(createInstallationInsertInput())
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    const override = { eventMonths: 6, profileMonths: 6, replayMonths: null }
    const later = new Date('2026-09-03T00:00:00.000Z')

    await repository.saveSiteOverride({ id: 'rtn_site_1', siteId: 'ste_1', policy: override, now })
    await repository.clearSiteOverride({ siteId: 'ste_1', now })
    const reenabled = { eventMonths: 3, profileMonths: 3, replayMonths: null }
    await repository.saveSiteOverride({
      id: 'rtn_site_2',
      siteId: 'ste_1',
      policy: reenabled,
      now: later,
    })

    await expect(repository.findResolved({ siteId: 'ste_1' })).resolves.toMatchObject({
      siteOverride: reenabled,
      effectivePolicy: reenabled,
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
  })

  it('falls back to the built-in default for site save and clear without an installation policy', async () => {
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
    const fallback = { eventMonths: 12, profileMonths: 12, replayMonths: null }
    const override = { eventMonths: 6, profileMonths: 6, replayMonths: null }

    const saved = await repository.saveSiteOverride({
      id: 'rtn_site_1',
      siteId: 'ste_1',
      policy: override,
      now,
    })
    expect(saved).toEqual({
      installationId: 'ins_1',
      installationDefault: fallback,
      siteOverride: override,
      effectivePolicy: override,
      updatedAt: now.toISOString(),
    })

    const cleared = await repository.clearSiteOverride({ siteId: 'ste_1', now })
    expect(cleared).toEqual({
      installationId: 'ins_1',
      installationDefault: fallback,
      siteOverride: null,
      effectivePolicy: fallback,
      updatedAt: createdAt.toISOString(),
    })
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
          eq(schema.TRetentionPolicy.siteId, 'ste_1'),
        ),
      )
      .all()
    expect(versions).toEqual([{ id: 'rtn_site_1', version: 1, status: 'superseded' }])
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

  it('isolates site overrides', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(createInstallationInsertInput())
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    const first = { eventMonths: 6, profileMonths: 6, replayMonths: null }
    const second = { eventMonths: 3, profileMonths: 3, replayMonths: null }
    const fallback = { eventMonths: 12, profileMonths: 12, replayMonths: null }

    await repository.saveSiteOverride({ id: 'rtn_site_1', siteId: 'ste_1', policy: first, now })
    fixture.db
      .insert(schema.TSite)
      .values(
        createSiteRow({
          id: 'ste_2',
          hostname: 'second.example.com',
          ingestionIdentifier: 'ing_2',
        }),
      )
      .run()
    await repository.saveSiteOverride({ id: 'rtn_site_2', siteId: 'ste_2', policy: second, now })

    const ste1Versions = fixture.db
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
    expect(ste1Versions).toEqual([{ id: 'rtn_site_1', version: 1, status: 'active' }])
    const ste2Versions = fixture.db
      .select({
        id: schema.TRetentionPolicy.id,
        version: schema.TRetentionPolicy.version,
        status: schema.TRetentionPolicy.status,
      })
      .from(schema.TRetentionPolicy)
      .where(
        and(
          eq(schema.TRetentionPolicy.installationId, 'ins_1'),
          eq(schema.TRetentionPolicy.siteId, 'ste_2'),
        ),
      )
      .all()
    expect(ste2Versions).toEqual([{ id: 'rtn_site_2', version: 1, status: 'active' }])
    await expect(repository.findResolved({ siteId: 'ste_1' })).resolves.toMatchObject({
      siteOverride: first,
      effectivePolicy: first,
    })
    await expect(repository.findResolved({ siteId: 'ste_2' })).resolves.toMatchObject({
      siteOverride: second,
      effectivePolicy: second,
    })
    await expect(repository.findResolved({ siteId: null })).resolves.toMatchObject({
      installationDefault: fallback,
      siteOverride: null,
      effectivePolicy: fallback,
    })

    await repository.clearSiteOverride({ siteId: 'ste_1', now })
    await expect(repository.findResolved({ siteId: 'ste_1' })).resolves.toMatchObject({
      siteOverride: null,
      effectivePolicy: fallback,
    })
    await expect(repository.findResolved({ siteId: 'ste_2' })).resolves.toMatchObject({
      siteOverride: second,
      effectivePolicy: second,
    })
  })

  it('rejects saveSiteOverride when no installation exists', async () => {
    using fixture = createFixture()
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    const policy = { eventMonths: 6, profileMonths: 6, replayMonths: null }

    await expect(
      repository.saveSiteOverride({ id: 'rtn_x', siteId: 'ste_1', policy, now }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fixture.db.select().from(schema.TRetentionPolicy).all()).toEqual([])
  })
})
