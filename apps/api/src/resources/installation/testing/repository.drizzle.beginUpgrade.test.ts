import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import {
  beginUpgradeInput,
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
  updatedAt,
} from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.beginUpgrade', () => {
  it('throws when beginning an upgrade without an installation', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(
      fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt)),
    ).rejects.toThrow('Installation is not initialized')
  })

  it('persists an upgrade operation before its artifact exists', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    const record = await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    expect(record).toMatchObject({
      status: 'maintenance',
      activeOperation: expect.objectContaining({
        operationId: 'bop_1',
        kind: 'upgrade',
        checkpoint: 'none',
      }),
    })
    const operations = fixture.db
      .select()
      .from(schema.TBackupOperation)
      .where(eq(schema.TBackupOperation.id, 'bop_1'))
      .all()
    expect(operations).toHaveLength(1)
    expect(
      fixture.db
        .select()
        .from(schema.TBackupArtifact)
        .where(eq(schema.TBackupArtifact.operationId, 'bop_1'))
        .all(),
    ).toHaveLength(0)
  })

  it('rolls back a failed beginUpgrade', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    await expect(
      fixture.repository.beginUpgrade(
        beginUpgradeInput('bop_1', new Date('2026-09-02T00:00:00.000Z')),
      ),
    ).rejects.toThrow(/constraint|unique|reserved|lifecycle operation is active/i)

    const current = await fixture.repository.find()
    expect(current?.activeOperation).toMatchObject({ operationId: 'bop_1' })
    expect(current?.updatedAt).toBe(updatedAt.toISOString())
  })
})
