import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import {
  InMemoryAcceptanceQuiescencePort,
  InMemoryReadQuiescencePort,
  InMemoryLifecycleLock,
} from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import { BackupRestoreRepositoryDrizzle } from '../repository.drizzle.ts'
import type {
  BackupOperation,
  BackupRestoreRepository,
  CreatingBackupOperation,
  CreatingRestoreOperation,
  SafetyManifest,
  SourceManifest,
} from '../repository.ts'
import type { BackupRestoreExecutor } from '../executor.ts'
import { BackupRestoreService } from '../service.ts'

export const createdAt = new Date('2026-09-01T00:00:00.000Z')

export function createBackupOperation(
  overrides: Partial<CreatingBackupOperation> = {},
): CreatingBackupOperation {
  return {
    id: 'bop_1',
    operationType: 'backup',
    status: 'creating',
    scope: 'installation',
    phase: 'capturing_sqlite',
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    progress: 0,
    checkpoint: 'none',
    lastSafeSequence: null,
    readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'not_ready' },
    cleanupPending: false,
    derivedCleanup: {
      status: 'not_applicable',
      startedAt: null,
      completedAt: null,
      errorCode: null,
    },
    backupCleanup: {
      status: 'not_applicable',
      startedAt: null,
      completedAt: null,
      errorCode: null,
    },
    restoreSourceBackupId: null,
    preRestoreSafetyArtifact: null,
    errorCode: null,
    ...overrides,
  }
}

export function createRestoreOperation(
  overrides: Partial<CreatingRestoreOperation> = {},
): CreatingRestoreOperation {
  return {
    ...createBackupOperation(),
    operationType: 'restore',
    restoreSourceBackupId: 'bop_source',
    ...overrides,
  }
}

export function createSourceManifest(overrides: Partial<SourceManifest> = {}): SourceManifest {
  return {
    kind: 'source',
    id: 'bar_1',
    operationId: 'bop_1',
    artifactType: 'authoritative_sqlite',
    generationId: 'gen_1',
    storageKey: 'backups/bop_1.sqlite',
    schemaVersion: '1',
    retentionBoundary: null,
    acceptanceSequence: 42,
    sizeBytes: 8,
    checksumAlgorithm: 'sha256',
    checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    createdAt,
    ...overrides,
  }
}

export function createSafetyManifest(overrides: Partial<SafetyManifest> = {}): SafetyManifest {
  return {
    kind: 'safety',
    id: 'bar_safety',
    operationId: 'bop_restore',
    artifactType: 'pre_restore_sqlite',
    generationId: 'gen_current',
    storageKey: 'safety/bop_restore.sqlite',
    schemaVersion: '1',
    sizeBytes: 8,
    checksumAlgorithm: 'sha256',
    checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    createdAt,
    lastSafeSequence: 42,
    status: 'ready',
    errorCode: null,
    ...overrides,
  }
}

export function createBackupDrizzleFixture() {
  const db = createMigratedTestDb()
  const repository = new BackupRestoreRepositoryDrizzle({ db })
  return {
    db,
    repository,
    async insertInstallation(): Promise<void> {
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
    },
    [Symbol.dispose](): void {
      closeDb(db)
    },
  }
}

export function createBackupInsertInput(
  overrides: Partial<BackupRestoreRepository.BeginInput> = {},
): BackupRestoreRepository.BeginInput {
  return { operationId: 'bop_1', ownerToken: 'owner_1', now: createdAt, ...overrides }
}

export function createServiceFixture(
  options: {
    readonly operation?: BackupOperation
    readonly executor?: BackupRestoreExecutor
  } = {},
) {
  const repository = mock<BackupRestoreRepository>()
  const executor = options.executor ?? mock<BackupRestoreExecutor>()
  const service = new BackupRestoreService({
    repository,
    executor,
    lock: new InMemoryLifecycleLock(),
    acceptance: new InMemoryAcceptanceQuiescencePort(),
    reads: new InMemoryReadQuiescencePort(),
    dataDirectoryReady: true,
  })
  if (options.operation !== undefined) repository.find.mockResolvedValue(options.operation)
  return { repository, executor, service }
}
