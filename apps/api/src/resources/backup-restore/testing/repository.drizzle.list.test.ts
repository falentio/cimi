import { describe, expect, it } from 'vitest'
import {
  createBackupDrizzleFixture,
  createBackupInsertInput,
  createSourceManifest,
} from './fixture.ts'

describe('BackupRestoreRepositoryDrizzle.list', () => {
  it('lists only backup operations with stable offset pagination', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const first = await fixture.repository.beginBackup(createBackupInsertInput())
    if (first === undefined) throw new Error('expected backup operation')
    await fixture.repository.recordBackupArtifact({
      operationId: first.id,
      ownerToken: 'owner_1',
      artifact: createSourceManifest(),
      now: new Date('2026-09-01T00:00:01.000Z'),
    })
    await fixture.repository.complete({
      operationId: first.id,
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:00:02.000Z'),
    })

    const page = await fixture.repository.list({ offset: 0, limit: 1 })

    expect(page).toMatchObject({ totalCount: 1, hasMore: false, nextOffset: null })
    expect(page.items).toHaveLength(1)
  })
})
