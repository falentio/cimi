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

    await expect(
      fixture.repository.activate({
        retentionPolicyId: 'rtn_1',
        retention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
        dataDirectoryReady: true,
        updatedAt,
      }),
    ).resolves.toMatchObject({ status: 'ready' })
    expect(
      fixture.db
        .select()
        .from(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
        .all(),
    ).toMatchObject([{ id: 'rtn_1', version: 1, status: 'active' }])
  })
})
