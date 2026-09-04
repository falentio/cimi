import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import {
  beginUpgradeInput,
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
  updatedAt,
} from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.failUpgrade', () => {
  it('persists a terminal internal error and keeps installation non-ready', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    await fixture.repository.failUpgrade({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:04:00.000Z'),
    })

    expect(
      fixture.db
        .select()
        .from(schema.TBackupOperation)
        .where(eq(schema.TBackupOperation.id, 'bop_1'))
        .all()[0],
    ).toMatchObject({ status: 'failed', phase: 'failed', errorCode: 'INTERNAL_SERVER_ERROR' })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'degraded',
      activeOperation: null,
    })
  })
})
