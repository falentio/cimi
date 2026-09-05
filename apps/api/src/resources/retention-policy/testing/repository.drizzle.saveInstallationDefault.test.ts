import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { RetentionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'
import { defaultCleanup } from '../fixture.ts'

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
      cleanup: {
        pending: true,
        derived: { ...defaultCleanup.derived, status: 'pending' },
        backup: { ...defaultCleanup.backup, status: 'pending' },
      },
      updatedAt: now.toISOString(),
    })
    const versions = fixture.db
      .select({
        id: schema.TRetentionPolicy.id,
        version: schema.TRetentionPolicy.version,
        status: schema.TRetentionPolicy.status,
        effectiveTo: schema.TRetentionPolicy.effectiveTo,
        updatedAt: schema.TRetentionPolicy.updatedAt,
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
        { id: 'rtn_1', version: 1, status: 'superseded', effectiveTo: now, updatedAt: now },
        { id: 'rtn_2', version: 2, status: 'active', effectiveTo: null, updatedAt: now },
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

  it('creates a v1 installation default with no supersede', async () => {
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
    const policy = { eventMonths: 24, profileMonths: 18, replayMonths: 6 }

    const resolved = await repository.saveInstallationDefault({ id: 'rtn_1', policy, now })

    expect(resolved).toEqual({
      installationId: 'ins_1',
      installationDefault: policy,
      siteOverride: null,
      effectivePolicy: policy,
      cleanup: {
        pending: true,
        derived: { ...defaultCleanup.derived, status: 'pending' },
        backup: { ...defaultCleanup.backup, status: 'pending' },
      },
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
    expect(versions).toEqual([{ id: 'rtn_1', version: 1, status: 'active' }])
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

  it('rejects saveInstallationDefault when no installation exists', async () => {
    using fixture = createFixture()
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    const policy = { eventMonths: 6, profileMonths: 6, replayMonths: null }

    await expect(
      repository.saveInstallationDefault({ id: 'rtn_x', policy, now }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fixture.db.select().from(schema.TRetentionPolicy).all()).toEqual([])
  })

  it('stamps supersede timing and rolls back the whole write on insert failure', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(createInstallationInsertInput())
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    const policy = { eventMonths: 24, profileMonths: 18, replayMonths: 6 }

    await expect(repository.saveInstallationDefault({ id: 'rtn_1', policy, now })).rejects.toThrow(
      /UNIQUE|PRIMARY/i,
    )

    const rows = fixture.db
      .select({
        id: schema.TRetentionPolicy.id,
        version: schema.TRetentionPolicy.version,
        status: schema.TRetentionPolicy.status,
        effectiveTo: schema.TRetentionPolicy.effectiveTo,
      })
      .from(schema.TRetentionPolicy)
      .where(
        and(
          eq(schema.TRetentionPolicy.installationId, 'ins_1'),
          eq(schema.TRetentionPolicy.scope, 'installation'),
        ),
      )
      .all()
    expect(rows).toEqual([
      {
        id: 'rtn_1',
        version: 1,
        status: 'active',
        effectiveTo: null,
      },
    ])
    await expect(repository.findResolved({ siteId: null })).resolves.toMatchObject({
      installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    })
  })
})
