import type { ComputedRef } from 'vue'
import type { CimiOrpc } from '~/plugins/orpc'

export type Backup = Awaited<ReturnType<CimiOrpc['backupRestore']['getBackupStatus']['call']>>
export type BackupList = Awaited<ReturnType<CimiOrpc['backupRestore']['listBackups']['call']>>
export type Installation = Awaited<
  ReturnType<CimiOrpc['installation']['getInstallationStatus']['call']>
>
export type BackupId = Backup['id']
export type BackupErrorCode = NonNullable<Backup['errorCode']>
export type InstallationOperation = NonNullable<Installation['activeOperation']>

export type BackupRestoreFailure =
  | {
      readonly kind: 'authentication'
      readonly code: 'UNAUTHORIZED'
      readonly httpStatus: 401
      readonly message: 'Sign in as an installation administrator to continue.'
      readonly action: 'sign-in'
    }
  | {
      readonly kind: 'forbidden'
      readonly code: 'FORBIDDEN'
      readonly httpStatus: 403
      readonly message: 'Your account is not an installation administrator. Contact an installation administrator for access.'
      readonly action: 'contact-admin'
    }
  | {
      readonly kind: 'not-found'
      readonly code: 'NOT_FOUND'
      readonly httpStatus: 404
      readonly message: 'The backup or installation is no longer available. Refresh and try again.'
      readonly action: 'refresh'
    }
  | {
      readonly kind: 'bad-request'
      readonly code: 'BAD_REQUEST'
      readonly httpStatus: 400
      readonly message: 'The request was invalid. Check the confirmation and try again.'
      readonly action: 'retry'
    }
  | {
      readonly kind: 'conflict'
      readonly code: 'CONFLICT'
      readonly httpStatus: 409
      readonly message: 'Another installation operation is active. Refresh before trying again.'
      readonly action: 'refresh'
    }
  | {
      readonly kind: 'incompatible'
      readonly code: 'INCOMPATIBLE_BACKUP'
      readonly httpStatus: 422
      readonly message: 'This backup is not compatible with the current installation.'
      readonly action: 'choose-another-backup'
    }
  | {
      readonly kind: 'storage'
      readonly code: 'INSUFFICIENT_STORAGE'
      readonly httpStatus: 507
      readonly message: 'Free server storage before trying this operation again.'
      readonly action: 'resolve-and-retry'
    }
  | {
      readonly kind: 'backup-failed'
      readonly code: 'BACKUP_FAILED'
      readonly httpStatus: 500
      readonly message: 'The backup operation failed safely. Review status and retry when ready.'
      readonly action: 'retry'
    }
  | {
      readonly kind: 'server'
      readonly code: 'INTERNAL_SERVER_ERROR'
      readonly httpStatus: 500
      readonly message: 'The operation could not complete safely. Review status and retry later.'
      readonly action: 'retry'
    }
  | {
      readonly kind: 'polling'
      readonly code: 'POLL_TIMEOUT' | 'POLL_UNAVAILABLE'
      readonly httpStatus: undefined
      readonly message: string
      readonly action: 'refresh'
    }
  | {
      readonly kind: 'retryable'
      readonly code: string | undefined
      readonly httpStatus: number | undefined
      readonly message: string
      readonly action: 'retry'
    }

export type ResourceLoad = 'idle' | 'loading' | 'refreshing' | 'ready' | 'failed'

export type ListSignal =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly refreshing: boolean
      readonly loadingMore: boolean
    }
  | { readonly kind: 'failed'; readonly error: BackupRestoreFailure }

export type InstallationSignal =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly installation: Installation
      readonly refreshing: boolean
    }
  | {
      readonly kind: 'stale'
      readonly installation: Installation
      readonly error: BackupRestoreFailure
    }
  | { readonly kind: 'failed'; readonly error: BackupRestoreFailure }

export type CommandState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'creating' }
  | { readonly kind: 'restoring'; readonly sourceId: BackupId }
  | {
      readonly kind: 'failed'
      readonly command: 'create' | 'restore'
      readonly error: BackupRestoreFailure
    }

export type PollingState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'automatic'
      readonly operationId: BackupId
      readonly attempt: number
      readonly maxAttempts: number
      readonly resumedAfterReload: boolean
    }
  | {
      readonly kind: 'manual'
      readonly operationId: BackupId
      readonly reason: 'poll-limit' | 'temporary-error'
      readonly resumedAfterReload: boolean
    }

export type RestoreDialogState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'open'; readonly backupId: BackupId }
  | {
      readonly kind: 'confirming'
      readonly backupId: BackupId
      readonly error: BackupRestoreFailure | null
    }
  | { readonly kind: 'submitting'; readonly backupId: BackupId }
  | { readonly kind: 'tracking'; readonly backupId: BackupId; readonly operationId: BackupId }

export type LockSectionView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unknown'; readonly message: string }
  | {
      readonly kind: 'held'
      readonly operationId: string
      readonly operationKind: InstallationOperation['kind']
      readonly operationLabel: string
    }
  | { readonly kind: 'cleanup-pending'; readonly message: string }
  | { readonly kind: 'not-ready'; readonly message: string }
  | { readonly kind: 'available' }

export type BackupRowView = {
  readonly id: BackupId
  readonly createdAt: string
  readonly completedAt: string | null
  readonly status: Backup['status']
  readonly statusLabel: string
  readonly phaseLabel: string
  readonly progressPercent: number | null
  readonly operationLabel: 'Backup' | 'Restore'
  readonly restore: 'available' | 'not-available' | 'blocked-by-lock'
  readonly restoreDisabledReason: string | null
}

export type BackupListSectionView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'empty'; readonly totalCount: 0 }
  | {
      readonly kind: 'ready'
      readonly rows: readonly BackupRowView[]
      readonly totalCount: number
      readonly hasMore: boolean
      readonly loadingMore: boolean
      readonly refreshing: boolean
    }
  | {
      readonly kind: 'stale'
      readonly rows: readonly BackupRowView[]
      readonly message: string
      readonly refreshing: boolean
    }
  | { readonly kind: 'error'; readonly message: string }

export type PollingIndicatorView =
  | { readonly kind: 'automatic'; readonly attempt: number; readonly maxAttempts: number }
  | { readonly kind: 'manual'; readonly reason: string }

export type SafetyArtifactView =
  | { readonly kind: 'not-created' }
  | { readonly kind: 'creating' }
  | { readonly kind: 'ready'; readonly createdAt: string; readonly lastSafeSequence: number }
  | { readonly kind: 'failed'; readonly error: BackupRestoreFailure }

export type CleanupStageView = {
  readonly kind: 'derived' | 'backup'
  readonly label: 'Derived cleanup' | 'Backup cleanup'
  readonly status: Backup['derivedCleanup']['status']
  readonly statusLabel: string
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly error: BackupRestoreFailure | null
  readonly blockedByDerivedCleanup: boolean
}

export type CleanupSectionView =
  | { readonly kind: 'hidden' }
  | {
      readonly kind: 'visible'
      readonly pending: boolean
      readonly stages: readonly [CleanupStageView, CleanupStageView]
    }

export type ActiveOperationView =
  | {
      readonly kind: 'active'
      readonly operation: 'backup'
      readonly stage: 'capturing-sqlite'
      readonly operationId: BackupId
      readonly progressPercent: number
      readonly checkpointLabel: string
      readonly readiness: Backup['readiness']
      readonly lastSafeSequence: number | null
      readonly safetyArtifact: null
      readonly polling: PollingIndicatorView
    }
  | {
      readonly kind: 'active'
      readonly operation: 'restore'
      readonly stage:
        | 'preparing-safety-artifact'
        | 'restoring-sqlite'
        | 'rebuilding-duckdb'
        | 'structurally-ready'
        | 'cleanup-pending'
      readonly operationId: BackupId
      readonly sourceBackupId: BackupId
      readonly progressPercent: number
      readonly checkpointLabel: string
      readonly readiness: Backup['readiness']
      readonly lastSafeSequence: number | null
      readonly safetyArtifact: SafetyArtifactView
      readonly polling: PollingIndicatorView
    }

export type OperationSectionView =
  | { readonly kind: 'none' }
  | ActiveOperationView
  | {
      readonly kind: 'available'
      readonly operation: 'backup' | 'restore'
      readonly operationId: BackupId
      readonly completedAt: string | null
      readonly cleanupPending: boolean
    }
  | {
      readonly kind: 'failed'
      readonly operation: 'backup' | 'restore'
      readonly operationId: BackupId
      readonly error: BackupRestoreFailure
      readonly safetyArtifact: SafetyArtifactView | null
    }

export type CreateSectionView =
  | { readonly kind: 'available' }
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'tracking'; readonly operationId: BackupId }
  | { readonly kind: 'failed'; readonly error: BackupRestoreFailure }

export type RestoreConfirmationAvailability =
  | { readonly canConfirm: true; readonly confirmDisabledReason: null }
  | { readonly canConfirm: false; readonly confirmDisabledReason: string }

export type RestoreSectionView =
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'available'; readonly selected: BackupRowView | null }
  | {
      readonly kind: 'confirming'
      readonly selected: BackupRowView
      readonly requiredConfirmation: 'RESTORE'
      readonly error: BackupRestoreFailure | null
      readonly confirmation: RestoreConfirmationAvailability
    }
  | {
      readonly kind: 'submitting'
      readonly selected: BackupRowView
      readonly confirmation: RestoreConfirmationAvailability
    }
  | {
      readonly kind: 'tracking'
      readonly selected: BackupRowView
      readonly operationId: BackupId
    }

export type RecoverySectionView =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'resumed'
      readonly operation: 'backup' | 'restore'
      readonly operationId: BackupId
      readonly message: string
    }

export type BackupRestoreActions = {
  readonly canCreate: boolean
  readonly canRestore: boolean
  readonly disabledReason: string | null
}

export type BackupRestoreViewModel =
  | { readonly kind: 'loading'; readonly message: 'Loading backup and restore status.' }
  | {
      readonly kind: 'access-error'
      readonly error: Extract<BackupRestoreFailure, { kind: 'authentication' | 'forbidden' }>
    }
  | {
      readonly kind: 'ready'
      readonly lock: LockSectionView
      readonly actions: BackupRestoreActions
      readonly list: BackupListSectionView
      readonly create: CreateSectionView
      readonly operation: OperationSectionView
      readonly restore: RestoreSectionView
      readonly cleanup: CleanupSectionView
      readonly recovery: RecoverySectionView
      readonly announcement: string
    }

export type BackupRestoreProjectionInput = {
  readonly data: BackupRestoreDataState
  readonly list: ListSignal
  readonly installation: InstallationSignal
  readonly command: CommandState
  readonly polling: PollingState
  readonly restoreDialog: RestoreDialogState
}

export type BackupRestoreDataState = {
  readonly order: readonly BackupId[]
  readonly records: ReadonlyMap<BackupId, Backup>
  readonly totalCount: number
  readonly nextOffset: number | null
  readonly hasMore: boolean
  readonly selectedBackupId: BackupId | null
  readonly trackedOperationId: BackupId | null
  readonly trackedOperation: Backup | null
}

export type BackupRestoreDataAction =
  | { readonly kind: 'list-replaced'; readonly page: BackupList }
  | { readonly kind: 'list-appended'; readonly page: BackupList }
  | { readonly kind: 'operation-received'; readonly operation: Backup }
  | { readonly kind: 'operation-cleared'; readonly operationId: BackupId }
  | { readonly kind: 'selection-changed'; readonly backupId: BackupId | null }

export interface BackupRestoreController {
  readonly view: Readonly<ComputedRef<BackupRestoreViewModel>>
  refresh(): Promise<void>
  loadMore(): Promise<void>
  openRestore(backupId: BackupId): void
  cancelRestore(): void
  createBackup(): Promise<void>
  confirmRestore(confirmation: string): Promise<void>
  resumePolling(): void
}
