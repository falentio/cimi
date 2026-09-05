export type BackupOperationType = 'backup' | 'restore'
export type BackupOperationStatus = 'creating' | 'available' | 'restoring' | 'failed'
export type BackupOperationPhase =
  | 'capturing_sqlite'
  | 'restoring_sqlite'
  | 'rebuilding_duckdb'
  | 'cleanup_pending'
  | 'ready'
  | 'failed'
export type BackupOperationCheckpoint =
  | 'none'
  | 'sqlite_captured'
  | 'sqlite_restored'
  | 'duckdb_rebuilt'
  | 'structurally_ready'
export type BackupErrorCode =
  | 'BACKUP_FAILED'
  | 'INCOMPATIBLE_BACKUP'
  | 'INSUFFICIENT_STORAGE'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR'
export type CleanupStageStatus =
  | 'not_applicable'
  | 'not_started'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'

export interface CleanupStage {
  readonly status: CleanupStageStatus
  readonly startedAt: Date | null
  readonly completedAt: Date | null
  readonly errorCode: BackupErrorCode | null
}

export interface SourceManifest {
  readonly kind: 'source'
  readonly id: string
  readonly operationId: string
  readonly artifactType: 'authoritative_sqlite'
  readonly generationId: string
  readonly storageKey: string
  readonly schemaVersion: string
  readonly retentionBoundary: Date | null
  readonly acceptanceSequence: number | null
  readonly sizeBytes: number
  readonly checksumAlgorithm: 'sha256'
  readonly checksumValue: string
  readonly createdAt: Date
}

export interface SafetyManifest {
  readonly kind: 'safety'
  readonly id: string
  readonly operationId: string
  readonly artifactType: 'pre_restore_sqlite'
  readonly generationId: string
  readonly storageKey: string
  readonly schemaVersion: string
  readonly sizeBytes: number
  readonly checksumAlgorithm: 'sha256'
  readonly checksumValue: string
  readonly createdAt: Date
  readonly lastSafeSequence: number
  readonly status: 'creating' | 'ready' | 'failed'
  readonly errorCode: BackupErrorCode | null
}

interface OperationCommon {
  readonly id: string
  readonly scope: 'installation'
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly startedAt: Date | null
  readonly progress: number
  readonly checkpoint: BackupOperationCheckpoint
  readonly lastSafeSequence: number | null
  readonly readiness: {
    readonly controlStore: 'not_ready' | 'ready'
    readonly analyticsStore: 'not_ready' | 'ready' | 'rebuilding'
    readonly structural: 'not_ready' | 'ready'
  }
  readonly cleanupPending: boolean
  readonly derivedCleanup: CleanupStage
  readonly backupCleanup: CleanupStage
}

export type CreatingBackupOperation = OperationCommon & {
  readonly operationType: 'backup'
  readonly status: 'creating'
  readonly phase: 'capturing_sqlite'
  readonly completedAt: null
  readonly restoreSourceBackupId: null
  readonly preRestoreSafetyArtifact: null
  readonly errorCode: null
}

export type CreatingRestoreOperation = OperationCommon & {
  readonly operationType: 'restore'
  readonly status: 'creating'
  readonly phase: 'capturing_sqlite'
  readonly completedAt: null
  readonly restoreSourceBackupId: string
  readonly preRestoreSafetyArtifact: null
  readonly errorCode: null
}

export type RestoringOperation = OperationCommon & {
  readonly operationType: 'restore'
  readonly status: 'restoring'
  readonly phase: 'restoring_sqlite' | 'rebuilding_duckdb' | 'cleanup_pending' | 'ready'
  readonly completedAt: null
  readonly restoreSourceBackupId: string
  readonly preRestoreSafetyArtifact: SafetyManifest
  readonly errorCode: null
}

export type AvailableOperation = OperationCommon & {
  readonly operationType: BackupOperationType
  readonly status: 'available'
  readonly phase: 'cleanup_pending' | 'ready'
  readonly completedAt: Date
  readonly restoreSourceBackupId: string | null
  readonly preRestoreSafetyArtifact: SafetyManifest | null
  readonly errorCode: null
}

export type FailedOperation = OperationCommon & {
  readonly operationType: BackupOperationType
  readonly status: 'failed'
  readonly phase: 'failed'
  readonly completedAt: Date
  readonly restoreSourceBackupId: string | null
  readonly preRestoreSafetyArtifact: SafetyManifest | null
  readonly errorCode: BackupErrorCode
}

export type BackupOperation =
  | CreatingBackupOperation
  | CreatingRestoreOperation
  | RestoringOperation
  | AvailableOperation
  | FailedOperation

export interface BackupOperationPage {
  readonly items: readonly BackupOperation[]
  readonly nextOffset: number | null
  readonly hasMore: boolean
  readonly totalCount: number
}

export interface BackupRestoreRepository {
  beginBackup(
    input: BackupRestoreRepository.BeginInput,
  ): Promise<CreatingBackupOperation | undefined>
  beginRestore(
    input: BackupRestoreRepository.BeginRestoreInput,
  ): Promise<CreatingRestoreOperation | undefined>
  find(operationId: string): Promise<BackupOperation | undefined>
  findActive(): Promise<BackupOperation | undefined>
  findSourceManifest(backupId: string): Promise<SourceManifest | undefined>
  findAuthoritativeArtifact(operationId: string): Promise<SourceManifest | undefined>
  findSafetyArtifact(operationId: string): Promise<SafetyManifest | undefined>
  findCleanupPending(): Promise<BackupOperation | undefined>
  list(input: BackupRestoreRepository.PageInput): Promise<BackupOperationPage>
  claim(input: BackupRestoreRepository.ClaimInput): Promise<BackupOperation | undefined>
  recordBackupArtifact(
    input: BackupRestoreRepository.RecordBackupArtifactInput,
  ): Promise<BackupOperation | undefined>
  recordSafetyArtifact(
    input: BackupRestoreRepository.RecordSafetyArtifactInput,
  ): Promise<BackupOperation | undefined>
  advance(input: BackupRestoreRepository.AdvanceInput): Promise<BackupOperation | undefined>
  complete(input: BackupRestoreRepository.CompleteInput): Promise<BackupOperation | undefined>
  fail(input: BackupRestoreRepository.FailInput): Promise<BackupOperation | undefined>
  claimCleanupStage(
    input: BackupRestoreRepository.ClaimCleanupStageInput,
  ): Promise<BackupRestoreRepository.CleanupWork | undefined>
  completeCleanupStage(input: BackupRestoreRepository.CompleteCleanupStageInput): Promise<void>
  failCleanupStage(input: BackupRestoreRepository.FailCleanupStageInput): Promise<void>
}

export declare namespace BackupRestoreRepository {
  export interface BeginInput {
    readonly operationId: string
    readonly ownerToken: string
    readonly now: Date
  }

  export interface BeginRestoreInput extends BeginInput {
    readonly sourceBackupId: string
  }

  export interface PageInput {
    readonly offset: number
    readonly limit: number
  }

  export interface ClaimInput {
    readonly operationId: string
    readonly expectedUpdatedAt: Date
    readonly ownerToken: string
    readonly now: Date
  }

  export interface RecordBackupArtifactInput {
    readonly operationId: string
    readonly ownerToken: string
    readonly artifact: SourceManifest
    readonly now: Date
  }

  export interface RecordSafetyArtifactInput {
    readonly operationId: string
    readonly ownerToken: string
    readonly artifact: SafetyManifest
    readonly now: Date
  }

  export interface AdvanceInput {
    readonly operationId: string
    readonly ownerToken: string
    readonly phase: BackupOperationPhase
    readonly checkpoint: BackupOperationCheckpoint
    readonly progress: number
    readonly lastSafeSequence: number | null
    readonly now: Date
  }

  export interface CompleteInput {
    readonly operationId: string
    readonly ownerToken: string
    readonly now: Date
  }

  export interface FailInput {
    readonly operationId: string
    readonly ownerToken: string
    readonly errorCode: BackupErrorCode
    readonly now: Date
    readonly recoveryRequired?: boolean
  }

  export type CleanupKind = 'derived_cleanup' | 'backup_cleanup'

  export interface ClaimCleanupStageInput {
    readonly operationId: string
    readonly stage: CleanupKind
    readonly ownerToken: string
    readonly now: Date
  }

  export interface CompleteCleanupStageInput extends ClaimCleanupStageInput {}

  export interface FailCleanupStageInput extends ClaimCleanupStageInput {
    readonly errorCode: BackupErrorCode
  }

  export interface CleanupWork {
    readonly operationId: string
    readonly stage: CleanupKind
  }
}
