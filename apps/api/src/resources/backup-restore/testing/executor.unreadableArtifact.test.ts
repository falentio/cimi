import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, createDb, migrateControlDb } from '@cimi/db'
import { createTestAnalyticsDb } from '@cimi/db/testing'
import { toLogError } from '@cimi/logging'
import { describe, expect, it } from 'vitest'
import { BackupIncompatibilityError } from '../errors.ts'
import { ConfiguredSqliteExecutor } from '../executor.ts'

type Corruption = 'header-magic' | 'zeroed-page'

function corruptArtifactBytes(bytes: Buffer, corruption: Corruption): Buffer {
  const copy = Buffer.from(bytes)
  const pageSize = copy.readUInt16BE(16) === 1 ? 65536 : copy.readUInt16BE(16)

  switch (corruption) {
    case 'header-magic':
      copy.fill(0, 0, 4)

      return copy
    case 'zeroed-page':
      copy.fill(0, pageSize * 4, Math.min(pageSize * 5, copy.length))

      return copy
  }
}

async function validateCorruptedArtifact(corruption: Corruption): Promise<Error> {
  const directory = await mkdtemp(join(tmpdir(), 'cimi-unreadable-executor-'))
  const controlDatabasePath = join(directory, 'control.sqlite')
  const db = createDb({ path: controlDatabasePath })
  migrateControlDb(db)
  const analytics = await createTestAnalyticsDb()

  try {
    const executor = new ConfiguredSqliteExecutor({
      db,
      analytics,
      controlDatabasePath,
      dataDirectoryPath: directory,
    })

    const source = await executor.captureBackup({
      operationId: 'bop_1',
      artifactId: 'bar_1',
      lastSafeSequence: 9,
    })

    const artifactPath = join(directory, source.storageKey)
    const corrupted = corruptArtifactBytes(await readFile(artifactPath), corruption)
    await writeFile(artifactPath, corrupted)

    try {
      await executor.validateManifest({
        operationId: 'bop_1',
        source: {
          ...source,
          sizeBytes: corrupted.byteLength,
          checksumValue: createHash('sha256').update(corrupted).digest('hex'),
        },
      })
    } catch (cause) {
      if (cause instanceof Error) return cause

      throw cause
    }

    throw new Error('validateManifest resolved without throwing')
  } finally {
    await analytics.close()
    closeDb(db)
    await rm(directory, { recursive: true, force: true })
  }
}

describe('ConfiguredSqliteExecutor.unreadableArtifact', () => {
  it('reports the SQLite code when the artifact header is unreadable', async () => {
    const error = await validateCorruptedArtifact('header-magic')

    expect(error).toBeInstanceOf(BackupIncompatibilityError)
    expect(error.message).toContain('SQLITE_NOTADB')
  })

  it('reports the SQLite code when the integrity check finds damage', async () => {
    const error = await validateCorruptedArtifact('zeroed-page')

    expect(error).toBeInstanceOf(BackupIncompatibilityError)
    expect(error.message).toContain('SQLITE_CORRUPT')
  })

  it('carries the SQLite code into the operation log payload', async () => {
    const error = await validateCorruptedArtifact('header-magic')

    expect(toLogError(error).message).toContain('SQLITE_NOTADB')
  })
})
