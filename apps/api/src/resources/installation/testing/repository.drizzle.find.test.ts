import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import {
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
  updatedAt,
} from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.find', () => {
  it('returns undefined when no installation exists', async () => {
    using fixture = createInstallationDrizzleFixture()

    const found = await fixture.repository.find()

    expect(found).toBeUndefined()
    expect(fixture.db.select().from(schema.TInstallation).all()).toHaveLength(0)
  })

  it('maps retention cleanup and active operation fields', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    const found = await fixture.repository.find()

    expect(found).toMatchObject({
      id: 'ins_1',
      status: 'ready',
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      dataDirectoryReady: true,
      activeOperation: null,
      cleanupPending: false,
      derivedCleanup: {
        status: 'not_applicable',
        startedAt: null,
        completedAt: null,
        errorCode: null,
      },
      backupCleanup: {
        status: 'not_applicable',
        startedAt: null,
        completedAt: null,
        errorCode: null,
      },
      updatedAt: updatedAt.toISOString(),
    })
  })

  it('throws on an inconsistent active operation row', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    fixture.db
      .update(schema.TInstallation)
      .set({
        activeOperationId: 'bop_bad',
        activeOperationKind: null,
        activeOperationPhase: null,
      })
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .run()

    await expect(fixture.repository.find()).rejects.toThrow(
      'Installation active operation is inconsistent',
    )
  })

  it('throws on a null-id inconsistent active operation row', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    fixture.db
      .update(schema.TInstallation)
      .set({
        activeOperationId: null,
        activeOperationKind: 'upgrade',
        activeOperationPhase: 'pre_upgrade_safety',
      })
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .run()

    await expect(fixture.repository.find()).rejects.toThrow(
      'Installation active operation is inconsistent',
    )
  })
})
