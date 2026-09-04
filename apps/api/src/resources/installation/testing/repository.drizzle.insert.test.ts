import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import {
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
  createdAt,
  updatedAt,
} from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.insert', () => {
  it('round-trips an insert through find', async () => {
    using fixture = createInstallationDrizzleFixture()

    const inserted = await fixture.repository.insert(createInstallationInsertInput())

    expect(inserted).toMatchObject({
      id: 'ins_1',
      status: 'ready',
      activeOperation: null,
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      updatedAt: updatedAt.toISOString(),
    })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      id: 'ins_1',
      status: 'ready',
    })
    const installationRows = fixture.db
      .select()
      .from(schema.TInstallation)
      .where(eq(schema.TInstallation.id, 'ins_1'))
      .all()
    expect(installationRows).toHaveLength(1)
    expect(installationRows[0]?.createdAt.toISOString()).toBe(createdAt.toISOString())
    expect(installationRows[0]?.updatedAt.toISOString()).toBe(updatedAt.toISOString())
    expect(
      fixture.db
        .select()
        .from(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
        .all(),
    ).toMatchObject([
      {
        eventMonths: 12,
        profileMonths: 12,
        replayMonths: null,
      },
    ])
  })

  it('stores insert defaults for cleanup and retention', async () => {
    using fixture = createInstallationDrizzleFixture()

    const inserted = await fixture.repository.insert(createInstallationInsertInput())

    expect(inserted).toMatchObject({
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      cleanupPending: false,
      derivedCleanup: expect.objectContaining({ status: 'not_applicable' }),
      backupCleanup: expect.objectContaining({ status: 'not_applicable' }),
    })
    expect(inserted.updatedAt).toBe(updatedAt.toISOString())
    expect(
      fixture.db
        .select()
        .from(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
        .all(),
    ).toMatchObject([
      {
        id: 'rtn_1',
        installationId: 'ins_1',
        scope: 'installation',
        eventMonths: 12,
        profileMonths: 12,
        replayMonths: null,
        version: 1,
        status: 'active',
      },
    ])
    const retentionRows = fixture.db
      .select()
      .from(schema.TRetentionPolicy)
      .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
      .all()
    expect(retentionRows[0]?.effectiveFrom.toISOString()).toBe(createdAt.toISOString())
    expect(retentionRows[0]?.createdAt.toISOString()).toBe(createdAt.toISOString())
    expect(retentionRows[0]?.updatedAt.toISOString()).toBe(updatedAt.toISOString())
  })

  it('stores non-null replay months without directory readiness', async () => {
    using fixture = createInstallationDrizzleFixture()

    const inserted = await fixture.repository.insert(
      createInstallationInsertInput({ replayMonths: 6, dataDirectoryReady: false }),
    )

    expect(inserted).toMatchObject({
      id: 'ins_1',
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: 6 },
      dataDirectoryReady: false,
      updatedAt: updatedAt.toISOString(),
    })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: 6 },
      dataDirectoryReady: false,
    })
  })

  it('rejects a duplicate insert', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    await expect(
      fixture.repository.insert(
        createInstallationInsertInput({ id: 'ins_2', retentionPolicyId: 'rtn_2' }),
      ),
    ).rejects.toThrow(/UNIQUE constraint failed.*installation\.singleton_key/i)
  })

  it('rejects a retention that violates the check', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(
      fixture.repository.insert(createInstallationInsertInput({ profileMonths: 24 })),
    ).rejects.toThrow(/CHECK constraint failed.*installation_retention_policy_check/i)
  })
})
