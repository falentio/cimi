import type { AnalyticsDb, Db } from '@cimi/db'
import {
  InMemoryAcceptanceQuiescencePort,
  InMemoryReadQuiescencePort,
  type AcceptanceQuiescencePort,
  type LifecycleLock,
  type ReadQuiescencePort,
} from '@cimi/kernel'
import { BackupRestoreRepositoryDrizzle } from './repository.drizzle.ts'
import { ConfiguredSqliteExecutor } from './executor.ts'
import { backupRestoreRouter } from './router.ts'
import { BackupRestoreCleanupWorker, type BackupRestoreCleanupPort } from './cleanup.ts'
import { BackupRestoreService, type BackupRestoreIdFactory } from './service.ts'
import type { BackupRestoreExecutor } from './executor.ts'

export { backupRestoreRouter }
export {
  BackupRestoreCleanupWorker,
  type BackupRestoreCleanupPort,
  type BackupRestoreCleanupWorkerDependencies,
} from './cleanup.ts'
export {
  BackupRestoreService,
  type BackupRestoreHealthSnapshot,
  type BackupRestoreIdFactory,
  type BackupRestoreServiceDependencies,
} from './service.ts'
export {
  BackupRestoreRepositoryDrizzle,
  type BackupRestoreRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type {
  BackupRestoreRepository,
  BackupOperation,
  BackupOperationCheckpoint,
  BackupOperationPhase,
  BackupOperationStatus,
  BackupOperationType,
  CleanupStage,
  SafetyManifest,
  SourceManifest,
} from './repository.ts'
export {
  BackupIncompatibilityError,
  ConfiguredSqliteExecutor,
  InsufficientStorageError,
  SafetyArtifactChecksumMismatchError,
  SafetyArtifactUnavailableError,
  classifyStorageExhausted,
} from './executor.ts'
export type { BackupRestoreExecutor, ConfiguredSqliteExecutorDependencies } from './executor.ts'

export interface CreateBackupRestoreDependencies {
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly lock: LifecycleLock
  readonly acceptance?: AcceptanceQuiescencePort | undefined
  readonly reads?: ReadQuiescencePort | undefined
  readonly dataDirectoryReady: boolean | (() => boolean)
  readonly controlDatabasePath: string
  readonly dataDirectoryPath: string
  readonly clock?: (() => Date) | undefined
  readonly ids?: BackupRestoreIdFactory | undefined
  readonly executor?: BackupRestoreExecutor | undefined
  readonly cleanup?: BackupRestoreCleanupPort | undefined
}

export function createBackupRestore({
  db,
  analytics,
  lock,
  acceptance,
  reads,
  dataDirectoryReady,
  controlDatabasePath,
  dataDirectoryPath,
  clock,
  ids,
  executor,
  cleanup,
}: CreateBackupRestoreDependencies) {
  const repository = new BackupRestoreRepositoryDrizzle({ db })
  const operationExecutor =
    executor ??
    new ConfiguredSqliteExecutor({
      db,
      analytics,
      controlDatabasePath,
      dataDirectoryPath,
    })
  const service = new BackupRestoreService({
    repository,
    executor: operationExecutor,
    lock,
    acceptance: acceptance ?? new InMemoryAcceptanceQuiescencePort(),
    reads: reads ?? new InMemoryReadQuiescencePort(),
    dataDirectoryReady,
    ...(clock === undefined ? {} : { clock }),
    ...(ids === undefined ? {} : { ids }),
  })
  const router = backupRestoreRouter(service)
  const worker: BackupRestoreCleanupWorker = new BackupRestoreCleanupWorker({
    repository,
    lock,
    ...(cleanup === undefined ? {} : { cleanup }),
  })
  return { repository, executor: operationExecutor, service, router, worker }
}

export type BackupRestoreModule = ReturnType<typeof createBackupRestore>
