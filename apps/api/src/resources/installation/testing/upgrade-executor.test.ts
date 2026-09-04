import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, createDb, migrateControlDb } from '@cimi/db'
import { describe, expect, it } from 'vitest'
import { SqliteUpgradeExecutor } from '../upgrade-executor.ts'

describe('SqliteUpgradeExecutor', () => {
  it('creates a non-empty artifact with actual size and checksum metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-upgrade-executor-'))
    const controlDatabasePath = join(directory, 'control.sqlite')
    const db = createDb({ path: controlDatabasePath })
    try {
      migrateControlDb(db)
      const executor = new SqliteUpgradeExecutor({
        db,
        controlDatabasePath,
        dataDirectoryPath: directory,
      })

      const artifact = await executor.createSafetyArtifact({
        operationId: 'bop_1',
        artifactId: 'bar_1',
      })
      const contents = await readFile(join(directory, artifact.storageKey))

      expect(artifact.sizeBytes).toBeGreaterThan(0)
      expect(artifact.sizeBytes).toBe(contents.byteLength)
      expect(artifact.checksumAlgorithm).toBe('sha256')
      expect(artifact.checksumValue).toBe(createHash('sha256').update(contents).digest('hex'))
    } finally {
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('restores the safety artifact after later SQLite changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-upgrade-executor-'))
    const controlDatabasePath = join(directory, 'control.sqlite')
    const db = createDb({ path: controlDatabasePath })
    try {
      migrateControlDb(db)
      const executor = new SqliteUpgradeExecutor({
        db,
        controlDatabasePath,
        dataDirectoryPath: directory,
      })
      const artifact = await executor.createSafetyArtifact({
        operationId: 'bop_1',
        artifactId: 'bar_1',
      })
      db.$client.prepare('CREATE TABLE upgrade_marker (id TEXT PRIMARY KEY)').run()

      await executor.rollback({ operationId: 'bop_1', artifact })

      expect(
        db.$client
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'upgrade_marker'",
          )
          .get(),
      ).toBeUndefined()
      await expect(stat(join(directory, artifact.storageKey))).resolves.toMatchObject({
        size: artifact.sizeBytes,
      })
    } finally {
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })
})
