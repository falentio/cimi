import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, createDb, migrateControlDb } from '@cimi/db'
import { describe, expect, it } from 'vitest'
import {
  classifyStorageExhausted,
  SafetyArtifactChecksumMismatchError,
  SafetyArtifactUnavailableError,
  SqliteUpgradeExecutor,
} from '../upgrade-executor.ts'

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
      closeDb(db)

      await executor.rollback({ operationId: 'bop_1', artifact })

      const restored = createDb({ path: controlDatabasePath })
      try {
        expect(
          restored.$client
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'upgrade_marker'",
            )
            .get(),
        ).toBeUndefined()
      } finally {
        closeDb(restored)
      }
      await expect(stat(join(directory, artifact.storageKey))).resolves.toMatchObject({
        size: artifact.sizeBytes,
      })
    } finally {
      try {
        closeDb(db)
      } catch {}
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('migrate and rebuildAnalytics resolve on a migrated database', async () => {
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

      await expect(executor.migrate({ operationId: 'bop_1' })).resolves.toBeUndefined()
      await expect(executor.rebuildAnalytics({ operationId: 'bop_1' })).resolves.toBeUndefined()
    } finally {
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects rollback when the artifact file is missing', async () => {
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
      await rm(join(directory, artifact.storageKey))

      await expect(executor.rollback({ operationId: 'bop_1', artifact })).rejects.toBeInstanceOf(
        SafetyArtifactUnavailableError,
      )
    } finally {
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects rollback on checksum mismatch', async () => {
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

      await expect(
        executor.rollback({
          operationId: 'bop_1',
          artifact: { ...artifact, checksumValue: '0'.repeat(64) },
        }),
      ).rejects.toThrow(/checksum mismatch/)
      await expect(
        executor.rollback({
          operationId: 'bop_1',
          artifact: { ...artifact, checksumValue: '0'.repeat(64) },
        }),
      ).rejects.toBeInstanceOf(SafetyArtifactChecksumMismatchError)
    } finally {
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects unsafe operation ids before touching the filesystem', async () => {
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

      await expect(
        executor.createSafetyArtifact({ operationId: '../evil', artifactId: 'bar_2' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
        executor.rollback({ operationId: '../../evil', artifact }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    } finally {
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('classifies only storage exhaustion as insufficient storage', () => {
    expect(classifyStorageExhausted(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }))).toBe(
      true,
    )
    expect(
      classifyStorageExhausted(Object.assign(new Error('full'), { code: 'SQLITE_FULL' })),
    ).toBe(true)
    expect(
      classifyStorageExhausted(Object.assign(new Error('io'), { code: 'SQLITE_IOERR_WRITE' })),
    ).toBe(true)
    expect(classifyStorageExhausted(new Error('database or disk is full'))).toBe(true)
    expect(classifyStorageExhausted(new Error('disk full, out of space'))).toBe(true)
    expect(classifyStorageExhausted(new Error('no space left on device, out of space'))).toBe(true)
    expect(classifyStorageExhausted(new Error('storage failed'))).toBe(false)
    expect(classifyStorageExhausted(new Error('space aliens'))).toBe(false)
    expect(classifyStorageExhausted(new Error('migration failed'))).toBe(false)
  })
})
