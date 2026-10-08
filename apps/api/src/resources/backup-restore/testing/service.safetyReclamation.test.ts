import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestUser } from '@cimi/auth'
import { closeDb, createDb, migrateControlDb, schema } from '@cimi/db'
import { createTestAnalyticsDb } from '@cimi/db/testing'
import {
  InMemoryAcceptanceQuiescencePort,
  InMemoryLifecycleLock,
  InMemoryReadQuiescencePort,
} from '@cimi/kernel'
import { describe, expect, it } from 'vitest'
import { ConfiguredSqliteExecutor, type BackupRestoreExecutor } from '../executor.ts'
import { BackupRestoreRepositoryDrizzle } from '../repository.drizzle.ts'
import { BackupRestoreService } from '../service.ts'

const admin = createTestUser()

const createdAt = new Date('2026-09-01T00:00:00.000Z')

class FailAfterSwapExecutor implements BackupRestoreExecutor {
  fail = false

  constructor(private readonly real: BackupRestoreExecutor) {}

  captureBackup: BackupRestoreExecutor['captureBackup'] = (input) => this.real.captureBackup(input)
  createPreRestoreSafety: BackupRestoreExecutor['createPreRestoreSafety'] = (input) =>
    this.real.createPreRestoreSafety(input)
  validateManifest: BackupRestoreExecutor['validateManifest'] = (input) =>
    this.real.validateManifest(input)
  restoreSqlite: BackupRestoreExecutor['restoreSqlite'] = (input) => this.real.restoreSqlite(input)
  migrate: BackupRestoreExecutor['migrate'] = (input) => this.real.migrate(input)
  rebuildAnalytics: BackupRestoreExecutor['rebuildAnalytics'] = (input) =>
    this.real.rebuildAnalytics(input)
  rollback: BackupRestoreExecutor['rollback'] = (input) => this.real.rollback(input)

  async verifyStructuralReadiness(input: { readonly operationId: string }): Promise<void> {
    if (this.fail) throw new Error('structural readiness failed after the sqlite swap')

    return this.real.verifyStructuralReadiness(input)
  }
}

async function createHarness() {
  const directory = await mkdtemp(join(tmpdir(), 'cimi-safety-reclaim-'))
  const controlDatabasePath = join(directory, 'control.sqlite')
  const db = createDb({ path: controlDatabasePath })
  migrateControlDb(db)
  const analytics = await createTestAnalyticsDb()
  const repository = new BackupRestoreRepositoryDrizzle({ db })

  db.insert(schema.TInstallation)
    .values({
      id: 'ins_1',
      singletonKey: 'default',
      status: 'ready',
      eventRetentionMonths: 12,
      profileRetentionMonths: 12,
      replayRetentionMonths: null,
      dataDirectoryReady: true,
      activeOperationId: null,
      activeOperationKind: null,
      activeOperationPhase: null,
      activeOperationCheckpoint: null,
      activeOperationProgress: null,
      activeOperationOwnerToken: null,
      activeOperationLastSafeSequence: null,
      activeOperationErrorCode: null,
      cleanupPending: false,
      derivedCleanupStatus: 'not_applicable',
      derivedCleanupStartedAt: null,
      derivedCleanupCompletedAt: null,
      derivedCleanupErrorCode: null,
      backupCleanupStatus: 'not_applicable',
      backupCleanupStartedAt: null,
      backupCleanupCompletedAt: null,
      backupCleanupErrorCode: null,
      createdAt,
      updatedAt: createdAt,
    })
    .run()

  const real = new ConfiguredSqliteExecutor({
    db,
    analytics,
    controlDatabasePath,
    dataDirectoryPath: directory,
  })

  const executor = new FailAfterSwapExecutor(real)

  let counter = 0

  const service = new BackupRestoreService({
    repository,
    executor,
    lock: new InMemoryLifecycleLock(),
    acceptance: new InMemoryAcceptanceQuiescencePort(async () => ({ lastSafeSequence: 42 })),
    reads: new InMemoryReadQuiescencePort(),
    dataDirectoryReady: true,
    clock: () => new Date('2026-09-01T00:00:01.000Z'),
    ids: {
      operationId: () => `bop_${++counter}`,
      artifactId: () => `bar_${counter}`,
      ownerToken: () => `own_${counter}`,
    },
  })

  async function safetyFiles(): Promise<string[]> {
    try {
      return (await readdir(join(directory, 'safety'))).filter((name) => name.endsWith('.sqlite'))
    } catch {
      return []
    }
  }

  return {
    service,
    executor,
    safetyFiles,
    async dispose() {
      await service.stop()
      await analytics.close()
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    },
  }
}

describe('BackupRestoreService.safetyReclamation', () => {
  it('deletes the orphaned pre-restore safety file after a failed restore is retried', async () => {
    const harness = await createHarness()

    try {
      const source = await harness.service.createBackup({}, admin)
      await harness.service.stop()

      harness.executor.fail = true

      const failed = await harness.service.restoreBackup(
        { backupId: source.id, confirmation: 'RESTORE' },
        admin,
      )

      await harness.service.stop()

      const failedStatus = await harness.service.getStatus({ backupId: failed.id }, admin)
      expect(failedStatus.status).toBe('failed')

      harness.executor.fail = false

      const retry = await harness.service.restoreBackup(
        { backupId: source.id, confirmation: 'RESTORE' },
        admin,
      )

      await harness.service.stop()

      const retryStatus = await harness.service.getStatus({ backupId: retry.id }, admin)
      expect(retryStatus.status).toBe('available')
      expect(retryStatus.preRestoreSafetyArtifact?.status).toBe('ready')

      expect(await harness.safetyFiles()).toEqual([])
    } finally {
      await harness.dispose()
    }
  })
})
