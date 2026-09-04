import { createHash } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { migrateControlDb, restoreDbFromBackup, type Db } from '@cimi/db'
import { ORPCError } from '@orpc/server'
import type { InstallationRepository } from './repository.ts'
import type { UpgradeExecutor } from './service.ts'

export class UpgradeIncompatibilityError extends Error {}
export class InsufficientStorageError extends Error {}
export class SafetyArtifactUnavailableError extends Error {}
export class SafetyArtifactChecksumMismatchError extends Error {}

export function classifyStorageExhausted(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'ENOSPC' || code === 'SQLITE_FULL') return true
  if (typeof code === 'string' && code.startsWith('SQLITE_IOERR')) return true
  const message = error instanceof Error ? error.message : String(error)
  return /database or disk is full|disk full|out of space|ENOSPC/i.test(message)
}

export function assertSafeOperationId(id: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new ORPCError('BAD_REQUEST')
}

export interface SqliteUpgradeExecutorDependencies {
  db: Db
  controlDatabasePath: string
  dataDirectoryPath: string
  analyticsRebuild?: ((input: { operationId: string }) => void | Promise<void>) | undefined
}

export class SqliteUpgradeExecutor implements UpgradeExecutor {
  private readonly db: Db
  private readonly controlDatabasePath: string
  private readonly dataDirectoryPath: string
  private readonly analyticsRebuild: (input: { operationId: string }) => void | Promise<void>

  constructor({
    db,
    controlDatabasePath,
    dataDirectoryPath,
    analyticsRebuild,
  }: SqliteUpgradeExecutorDependencies) {
    this.db = db
    this.controlDatabasePath = controlDatabasePath
    this.dataDirectoryPath = dataDirectoryPath
    this.analyticsRebuild = analyticsRebuild ?? (() => undefined)
  }

  async createSafetyArtifact(input: {
    operationId: string
    artifactId: string
  }): Promise<InstallationRepository.SafetyArtifactInput> {
    assertSafeOperationId(input.operationId)
    const storageKey = `safety/${input.operationId}.sqlite`
    const artifactPath = join(this.dataDirectoryPath, storageKey)
    try {
      await mkdir(dirname(artifactPath), { recursive: true })
      await this.db.$client.backup(artifactPath)
      const artifactStats = await stat(artifactPath)
      if (!artifactStats.isFile() || artifactStats.size === 0) {
        throw new InsufficientStorageError('SQLite safety artifact is empty')
      }
      const contents = await readFile(artifactPath)
      return {
        id: input.artifactId,
        generationId: input.operationId,
        storageKey,
        schemaVersion: '1',
        sizeBytes: artifactStats.size,
        checksumAlgorithm: 'sha256',
        checksumValue: createHash('sha256').update(contents).digest('hex'),
      }
    } catch (error) {
      if (error instanceof InsufficientStorageError) throw error
      if (classifyStorageExhausted(error)) {
        throw new InsufficientStorageError('SQLite safety artifact storage failed', {
          cause: error,
        })
      }
      throw error
    }
  }

  async migrate(input: { operationId: string }): Promise<void> {
    try {
      migrateControlDb(this.db)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/incompatible|newer|unsupported|schema version/i.test(message)) {
        throw new UpgradeIncompatibilityError(message, { cause: error })
      }
      if (classifyStorageExhausted(error)) {
        throw new InsufficientStorageError(message, { cause: error })
      }
      throw error
    }
    void input
  }

  async rebuildAnalytics(input: { operationId: string }): Promise<void> {
    await this.analyticsRebuild(input)
  }

  async rollback(input: {
    operationId: string
    artifact: InstallationRepository.SafetyArtifactInput
  }): Promise<void> {
    assertSafeOperationId(input.operationId)
    const artifactPath = join(this.dataDirectoryPath, input.artifact.storageKey)
    let artifactStats: Awaited<ReturnType<typeof stat>>
    try {
      artifactStats = await stat(artifactPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new SafetyArtifactUnavailableError(
          `SQLite safety artifact is unavailable for ${input.operationId}`,
          { cause: error },
        )
      }
      throw error
    }
    if (!artifactStats.isFile() || artifactStats.size !== input.artifact.sizeBytes) {
      throw new SafetyArtifactChecksumMismatchError(
        `SQLite safety artifact is unavailable for ${input.operationId}`,
      )
    }
    const checksum = createHash('sha256')
      .update(await readFile(artifactPath))
      .digest('hex')
    if (checksum !== input.artifact.checksumValue) {
      throw new SafetyArtifactChecksumMismatchError(
        `SQLite safety artifact checksum mismatch for ${input.operationId}`,
      )
    }
    await restoreDbFromBackup({
      backupPath: artifactPath,
      destinationPath: this.controlDatabasePath,
    })
  }
}
