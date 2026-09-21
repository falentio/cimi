import { describe, expect, it } from 'vitest'
import {
  createBackupDrizzleFixture,
  createBackupInsertInput,
  createSafetyManifest,
  createSourceManifest,
} from './fixture.ts'

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

  it('keeps analytics rebuilding until structural readiness is verified', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const source = await fixture.repository.beginBackup(createBackupInsertInput())
    if (source === undefined) throw new Error('expected source backup operation')
    await fixture.repository.recordBackupArtifact({
      operationId: source.id,
      ownerToken: 'owner_1',
      artifact: createSourceManifest(),
      now: new Date('2026-09-01T00:00:01.000Z'),
    })
    await fixture.repository.complete({
      operationId: source.id,
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:00:02.000Z'),
    })

    const restore = await fixture.repository.beginRestore({
      operationId: 'bop_restore',
      ownerToken: 'owner_restore',
      sourceBackupId: source.id,
      now: new Date('2026-09-01T00:00:03.000Z'),
    })
    if (restore === undefined) throw new Error('expected restore operation')
    await fixture.repository.recordSafetyArtifact({
      operationId: restore.id,
      ownerToken: 'owner_restore',
      artifact: createSafetyManifest({ operationId: restore.id }),
      now: new Date('2026-09-01T00:00:04.000Z'),
    })

    const rebuilt = await fixture.repository.advance({
      operationId: restore.id,
      ownerToken: 'owner_restore',
      phase: 'rebuilding_duckdb',
      checkpoint: 'duckdb_rebuilt',
      progress: 0.9,
      lastSafeSequence: 42,
      now: new Date('2026-09-01T00:00:05.000Z'),
    })
    expect(rebuilt).toMatchObject({
      status: 'restoring',
      phase: 'rebuilding_duckdb',
      checkpoint: 'duckdb_rebuilt',
      readiness: {
        controlStore: 'ready',
        analyticsStore: 'rebuilding',
        structural: 'not_ready',
      },
    })
  })
})
