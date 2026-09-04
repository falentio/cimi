import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import {
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
  updatedAt,
} from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.insert', () => {
  it('round-trips an insert through find', async () => {
    using fixture = createInstallationDrizzleFixture()

    const inserted = await fixture.repository.insert(createInstallationInsertInput())

    expect(inserted).toMatchObject({ status: 'ready', activeOperation: null })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      id: 'ins_1',
      status: 'ready',
    })
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
        scope: 'installation',
        version: 1,
        status: 'active',
      },
    ])
  })

  it('rejects a duplicate insert', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    await expect(
      fixture.repository.insert(
        createInstallationInsertInput({ id: 'ins_2', retentionPolicyId: 'rtn_2' }),
      ),
    ).rejects.toThrow(/constraint|unique|reserved/i)
  })

  it('rejects a retention that violates the check', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(
      fixture.repository.insert(createInstallationInsertInput({ profileMonths: 24 })),
    ).rejects.toThrow(/constraint/i)
  })
})
