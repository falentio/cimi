import { describe, expect, it } from 'vitest'
import { createBackupDrizzleFixture, createBackupInsertInput } from './fixture.ts'

describe('BackupRestoreRepositoryDrizzle.advance', () => {
  it('fences stale workers and keeps checkpoint and progress monotonic', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const started = await fixture.repository.beginBackup(createBackupInsertInput())
    if (started === undefined) throw new Error('expected backup operation')

    const advanced = await fixture.repository.advance({
      operationId: started.id,
      ownerToken: 'owner_1',
      phase: 'capturing_sqlite',
      checkpoint: 'none',
      progress: 0.2,
      lastSafeSequence: 7,
      now: new Date('2026-09-01T00:00:01.000Z'),
    })
    expect(advanced).toMatchObject({ progress: 0.2, lastSafeSequence: 7 })

    await expect(
      fixture.repository.advance({
        operationId: started.id,
        ownerToken: 'stale_owner',
        phase: 'capturing_sqlite',
        checkpoint: 'none',
        progress: 0.1,
        lastSafeSequence: 3,
        now: new Date('2026-09-01T00:00:02.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(
      fixture.repository.advance({
        operationId: started.id,
        ownerToken: 'owner_1',
        phase: 'capturing_sqlite',
        checkpoint: 'none',
        progress: 0.1,
        lastSafeSequence: 3,
        now: new Date('2026-09-01T00:00:02.000Z'),
      }),
    ).resolves.toBeUndefined()
  })
})
