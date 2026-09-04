import { createHash } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { migrateControlDb, restoreDbFromBackup, type Db } from '@cimi/db'
import type { InstallationRepository } from './repository.ts'
import type { UpgradeExecutor } from './service.ts'

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
    const storageKey = `safety/${input.operationId}.sqlite`
    const artifactPath = join(this.dataDirectoryPath, storageKey)
    await mkdir(dirname(artifactPath), { recursive: true })

    await this.db.$client.backup(artifactPath)
    const artifactStats = await stat(artifactPath)
    if (!artifactStats.isFile() || artifactStats.size === 0) {
      throw new Error('SQLite safety artifact is empty')
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
  }

  async migrate(_input: { operationId: string }): Promise<void> {
    migrateControlDb(this.db)
  }

  async rebuildAnalytics(input: { operationId: string }): Promise<void> {
    await this.analyticsRebuild(input)
  }

  async rollback(input: {
    operationId: string
    artifact: InstallationRepository.SafetyArtifactInput
  }): Promise<void> {
    const artifactPath = join(this.dataDirectoryPath, input.artifact.storageKey)
    const artifactStats = await stat(artifactPath)
    if (!artifactStats.isFile() || artifactStats.size !== input.artifact.sizeBytes) {
      throw new Error(`SQLite safety artifact is unavailable for ${input.operationId}`)
    }
    const checksum = createHash('sha256')
      .update(await readFile(artifactPath))
      .digest('hex')
    if (checksum !== input.artifact.checksumValue) {
      throw new Error(`SQLite safety artifact checksum mismatch for ${input.operationId}`)
    }
    await restoreDbFromBackup({
      backupPath: artifactPath,
      destinationPath: this.controlDatabasePath,
    })
  }
}
