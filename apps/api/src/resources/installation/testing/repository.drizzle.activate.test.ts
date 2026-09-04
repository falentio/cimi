import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createdAt, createInstallationDrizzleFixture, updatedAt } from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.activate', () => {
  it('seeds retention when activating an uninitialized installation', async () => {
    using fixture = createInstallationDrizzleFixture()
    fixture.db
      .insert(schema.TInstallation)
      .values({
        id: 'ins_1',
        singletonKey: 'default',
        status: 'uninitialized',
        eventRetentionMonths: 12,
        profileRetentionMonths: 12,
        replayRetentionMonths: null,
        dataDirectoryReady: true,
        createdAt,
        updatedAt,
      })
      .run()

    const activatedAt = new Date('2026-09-02T00:00:00.000Z')
    const activated = await fixture.repository.activate({
      retentionPolicyId: 'rtn_1',
      retention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      dataDirectoryReady: true,
      updatedAt: activatedAt,
    })

    expect(activated).toMatchObject({
      status: 'ready',
      dataDirectoryReady: true,
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      updatedAt: activatedAt.toISOString(),
    })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'ready',
      dataDirectoryReady: true,
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      updatedAt: activatedAt.toISOString(),
    })
    const installationRows = fixture.db
      .select()
      .from(schema.TInstallation)
      .where(eq(schema.TInstallation.id, 'ins_1'))
      .all()
    expect(installationRows[0]).toMatchObject({
      status: 'ready',
      eventRetentionMonths: 12,
      profileRetentionMonths: 12,
      replayRetentionMonths: null,
      dataDirectoryReady: true,
    })
    expect(installationRows[0]?.updatedAt.toISOString()).toBe(activatedAt.toISOString())
    expect(
      fixture.db
        .select()
        .from(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
        .all(),
    ).toMatchObject([{ id: 'rtn_1', version: 1, status: 'active' }])
  })

  it('returns undefined when no installation exists', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(
      fixture.repository.activate({
        retentionPolicyId: 'rtn_1',
        retention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
        dataDirectoryReady: true,
        updatedAt,
      }),
    ).resolves.toBeUndefined()
    expect(
      fixture.db
        .select()
        .from(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
        .all(),
    ).toHaveLength(0)
  })

  it('returns undefined when activating an already-ready installation', async () => {
    using fixture = createInstallationDrizzleFixture()
    fixture.db
      .insert(schema.TInstallation)
      .values({
        id: 'ins_1',
        singletonKey: 'default',
        status: 'uninitialized',
        eventRetentionMonths: 12,
        profileRetentionMonths: 12,
        replayRetentionMonths: null,
        dataDirectoryReady: true,
        createdAt,
        updatedAt,
      })
      .run()

    const input = {
      retentionPolicyId: 'rtn_1',
      retention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      dataDirectoryReady: true,
      updatedAt,
    } as const

    await expect(fixture.repository.activate({ ...input })).resolves.toMatchObject({
      status: 'ready',
    })
    await expect(fixture.repository.activate({ ...input })).resolves.toBeUndefined()
  })

  it('returns undefined on retention mismatch', async () => {
    using fixture = createInstallationDrizzleFixture()
    fixture.db
      .insert(schema.TInstallation)
      .values({
        id: 'ins_1',
        singletonKey: 'default',
        status: 'uninitialized',
        eventRetentionMonths: 12,
        profileRetentionMonths: 12,
        replayRetentionMonths: null,
        dataDirectoryReady: true,
        createdAt,
        updatedAt,
      })
      .run()
    fixture.db
      .insert(schema.TRetentionPolicy)
      .values({
        id: 'rtn_1',
        installationId: 'ins_1',
        siteId: null,
        scope: 'installation',
        eventMonths: 12,
        profileMonths: 12,
        replayMonths: null,
        version: 1,
        status: 'active',
        effectiveFrom: createdAt,
        effectiveTo: null,
        changedBy: null,
        createdAt,
        updatedAt,
      })
      .run()

    await expect(
      fixture.repository.activate({
        retentionPolicyId: 'rtn_2',
        retention: { eventMonths: 24, profileMonths: 12, replayMonths: null },
        dataDirectoryReady: true,
        updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(fixture.repository.find()).resolves.toMatchObject({ status: 'uninitialized' })
    expect(
      fixture.db
        .select()
        .from(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
        .all(),
    ).toHaveLength(1)
  })

  it('reuses the active policy without a duplicate row', async () => {
    using fixture = createInstallationDrizzleFixture()
    fixture.db
      .insert(schema.TInstallation)
      .values({
        id: 'ins_1',
        singletonKey: 'default',
        status: 'uninitialized',
        eventRetentionMonths: 12,
        profileRetentionMonths: 12,
        replayRetentionMonths: null,
        dataDirectoryReady: true,
        createdAt,
        updatedAt,
      })
      .run()
    fixture.db
      .insert(schema.TRetentionPolicy)
      .values({
        id: 'rtn_1',
        installationId: 'ins_1',
        siteId: null,
        scope: 'installation',
        eventMonths: 12,
        profileMonths: 12,
        replayMonths: null,
        version: 1,
        status: 'active',
        effectiveFrom: createdAt,
        effectiveTo: null,
        changedBy: null,
        createdAt,
        updatedAt,
      })
      .run()

    const activated = await fixture.repository.activate({
      retentionPolicyId: 'rtn_2',
      retention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      dataDirectoryReady: true,
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })

    expect(activated).toMatchObject({
      status: 'ready',
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    })
    const policies = fixture.db
      .select()
      .from(schema.TRetentionPolicy)
      .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
      .all()
    expect(policies).toHaveLength(1)
    expect(policies[0]).toMatchObject({ id: 'rtn_1' })
  })
})
