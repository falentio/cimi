import type {
  Backup,
  BackupListSectionView,
  BackupRestoreActions,
  BackupRestoreFailure,
  BackupRestoreProjectionInput,
  BackupRestoreViewModel,
  BackupRowView,
  CleanupSectionView,
  Installation,
  InstallationSignal,
  LockSectionView,
  OperationSectionView,
  PollingState,
  RestoreConfirmationAvailability,
} from './backup-restore.types'

const STATUS_LABELS: Record<Backup['status'], string> = {
  creating: 'Creating',
  available: 'Available',
  restoring: 'Restoring',
  failed: 'Failed',
}

const PHASE_LABELS: Record<Backup['phase'], string> = {
  capturing_sqlite: 'Capturing SQLite',
  restoring_sqlite: 'Restoring SQLite',
  rebuilding_duckdb: 'Rebuilding DuckDB',
  cleanup_pending: 'Cleanup pending',
  ready: 'Ready',
  failed: 'Failed',
}

const CHECKPOINT_LABELS: Record<Backup['checkpoint'], string> = {
  none: 'None',
  sqlite_captured: 'SQLite captured',
  sqlite_restored: 'SQLite restored',
  duckdb_rebuilt: 'DuckDB rebuilt',
  structurally_ready: 'Structurally ready',
}

const CLEANUP_LABELS: Record<Backup['derivedCleanup']['status'], string> = {
  not_applicable: 'Not required',
  not_started: 'Not started',
  pending: 'Waiting to start',
  running: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
}

const OPERATION_LABELS: Record<NonNullable<Installation['activeOperation']>['kind'], string> = {
  backup: 'Backup',
  restore: 'Restore',
  upgrade: 'Upgrade',
  retention: 'Retention',
  cleanup: 'Cleanup',
  site_deletion: 'Site deletion',
  site_recovery: 'Site recovery',
  site_purge: 'Site purge',
}

const FALLBACK_MESSAGES: Record<'list' | 'status' | 'create' | 'restore' | 'installation', string> =
  {
    list: 'Backup history could not be loaded. Refresh and try again.',
    status: 'Backup status could not be loaded. Refresh and try again.',
    create: 'A backup could not be started. Refresh and try again.',
    restore: 'The restore could not be started. Refresh and try again.',
    installation: 'Installation status could not be loaded. Refresh and try again.',
  }

type ErrorSource = keyof typeof FALLBACK_MESSAGES

export function isRestorableSource(backup: Backup): boolean {
  return backup.status === 'available' && backup.restoreSourceBackupId === null
}

export function isExactRestoreConfirmation(value: string): value is 'RESTORE' {
  return value === 'RESTORE'
}

export function formatBackupDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  )
}

export function normalizeBackupRestoreError(
  error: unknown,
  source: ErrorSource,
): BackupRestoreFailure {
  const details = readErrorDetails(error)
  const code = details.code
  const status = details.status

  if (code === 'UNAUTHORIZED' || status === 401) {
    return {
      kind: 'authentication',
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      message: 'Sign in as an installation administrator to continue.',
      action: 'sign-in',
    }
  }
  if (code === 'FORBIDDEN' || status === 403) {
    return {
      kind: 'forbidden',
      code: 'FORBIDDEN',
      httpStatus: 403,
      message:
        'Your account is not an installation administrator. Contact an installation administrator for access.',
      action: 'contact-admin',
    }
  }
  if (code === 'NOT_FOUND' || status === 404) {
    return {
      kind: 'not-found',
      code: 'NOT_FOUND',
      httpStatus: 404,
      message: 'The backup or installation is no longer available. Refresh and try again.',
      action: 'refresh',
    }
  }
  if (code === 'BAD_REQUEST' || status === 400) {
    return {
      kind: 'bad-request',
      code: 'BAD_REQUEST',
      httpStatus: 400,
      message: 'The request was invalid. Check the confirmation and try again.',
      action: 'retry',
    }
  }
  if (code === 'CONFLICT' || status === 409) {
    return {
      kind: 'conflict',
      code: 'CONFLICT',
      httpStatus: 409,
      message: 'Another installation operation is active. Refresh before trying again.',
      action: 'refresh',
    }
  }
  if (code === 'INCOMPATIBLE_BACKUP' || status === 422) {
    return {
      kind: 'incompatible',
      code: 'INCOMPATIBLE_BACKUP',
      httpStatus: 422,
      message: 'This backup is not compatible with the current installation.',
      action: 'choose-another-backup',
    }
  }
  if (code === 'INSUFFICIENT_STORAGE' || status === 507) {
    return {
      kind: 'storage',
      code: 'INSUFFICIENT_STORAGE',
      httpStatus: 507,
      message: 'Free server storage before trying this operation again.',
      action: 'resolve-and-retry',
    }
  }
  if (code === 'BACKUP_FAILED') {
    return {
      kind: 'backup-failed',
      code: 'BACKUP_FAILED',
      httpStatus: 500,
      message: 'The backup operation failed safely. Review status and retry when ready.',
      action: 'retry',
    }
  }
  if (code === 'INTERNAL_SERVER_ERROR' || status === 500) {
    return {
      kind: 'server',
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
      message: 'The operation could not complete safely. Review status and retry later.',
      action: 'retry',
    }
  }
  if (code === 'POLL_TIMEOUT' || code === 'POLL_UNAVAILABLE') {
    return {
      kind: 'polling',
      code,
      httpStatus: undefined,
      message: 'Automatic status checks paused. Refresh to verify the server operation.',
      action: 'refresh',
    }
  }

  return {
    kind: 'retryable',
    code,
    httpStatus: status,
    message: FALLBACK_MESSAGES[source],
    action: 'retry',
  }
}

export function deriveLifecycleLock(input: {
  readonly installation: InstallationSignal
}): LockSectionView {
  if (input.installation.kind === 'loading') return { kind: 'loading' }
  if (input.installation.kind === 'failed') {
    return {
      kind: 'unknown',
      message: 'Installation status is unavailable. Refresh before acting.',
    }
  }
  if (input.installation.kind === 'stale') {
    return { kind: 'unknown', message: 'Installation status is stale. Refresh before acting.' }
  }

  const installation = input.installation.installation
  const operation = installation.activeOperation
  if (operation !== null && operation.errorCode === null) {
    return {
      kind: 'held',
      operationId: operation.operationId,
      operationKind: operation.kind,
      operationLabel: OPERATION_LABELS[operation.kind],
    }
  }
  if (installation.cleanupPending) {
    return {
      kind: 'cleanup-pending',
      message: 'Installation cleanup is pending. Refresh before acting.',
    }
  }
  if (installation.status !== 'ready' || !installation.dataDirectoryReady) {
    return {
      kind: 'not-ready',
      message: 'The installation must be ready before this action can run.',
    }
  }
  return { kind: 'available' }
}

export function deriveBackupRestoreActions(input: {
  readonly lock: LockSectionView
  readonly command: BackupRestoreProjectionInput['command']
  readonly trackedOperation: Backup | null
}): BackupRestoreActions {
  const trackedOperation = input.trackedOperation
  const operationActive =
    trackedOperation !== null &&
    (trackedOperation.status === 'creating' ||
      trackedOperation.status === 'restoring' ||
      (trackedOperation.status === 'available' && trackedOperation.cleanupPending))

  if (input.lock.kind !== 'available') {
    return {
      canCreate: false,
      canRestore: false,
      disabledReason: getLockReason(input.lock),
    }
  }
  if (input.command.kind === 'creating' || input.command.kind === 'restoring' || operationActive) {
    return {
      canCreate: false,
      canRestore: false,
      disabledReason: operationActive
        ? 'A backup or restore operation is still in progress.'
        : 'A backup or restore operation is being submitted.',
    }
  }
  return { canCreate: true, canRestore: true, disabledReason: null }
}

export function toBackupRowView(backup: Backup, lock: LockSectionView): BackupRowView {
  const restorable = isRestorableSource(backup)
  const restore = !restorable
    ? 'not-available'
    : lock.kind === 'available'
      ? 'available'
      : 'blocked-by-lock'
  return {
    id: backup.id,
    createdAt: backup.createdAt,
    completedAt: backup.completedAt,
    status: backup.status,
    statusLabel: STATUS_LABELS[backup.status],
    phaseLabel: PHASE_LABELS[backup.phase],
    progressPercent:
      backup.status === 'available' || backup.status === 'failed'
        ? null
        : Math.round(backup.progress * 100),
    operationLabel: backup.restoreSourceBackupId === null ? 'Backup' : 'Restore',
    restore,
    restoreDisabledReason:
      restore === 'blocked-by-lock'
        ? getLockReason(lock)
        : restore === 'not-available'
          ? 'Only available source backups can be restored.'
          : null,
  }
}

export function toBackupOperationSection(
  backup: Backup,
  polling: PollingState,
): OperationSectionView {
  const pollingView = toPollingIndicator(polling)
  const sourceBackupId = backup.restoreSourceBackupId
  const operation = sourceBackupId === null ? 'backup' : 'restore'

  if (backup.status === 'available') {
    return {
      kind: 'available',
      operation,
      operationId: backup.id,
      completedAt: backup.completedAt,
      cleanupPending: backup.cleanupPending,
    }
  }
  if (backup.status === 'failed') {
    return {
      kind: 'failed',
      operation,
      operationId: backup.id,
      error: normalizeBackupRestoreError({ code: backup.errorCode }, 'status'),
      safetyArtifact: operation === 'restore' ? toSafetyArtifact(backup) : null,
    }
  }
  if (sourceBackupId === null) {
    return {
      kind: 'active',
      operation: 'backup',
      stage: 'capturing-sqlite',
      operationId: backup.id,
      progressPercent: Math.round(backup.progress * 100),
      checkpointLabel: CHECKPOINT_LABELS[backup.checkpoint],
      readiness: backup.readiness,
      lastSafeSequence: backup.lastSafeSequence,
      safetyArtifact: null,
      polling: pollingView,
    }
  }

  return {
    kind: 'active',
    operation: 'restore',
    stage: resolveRestoreStage(backup),
    operationId: backup.id,
    sourceBackupId,
    progressPercent: Math.round(backup.progress * 100),
    checkpointLabel: CHECKPOINT_LABELS[backup.checkpoint],
    readiness: backup.readiness,
    lastSafeSequence: backup.lastSafeSequence,
    safetyArtifact: toSafetyArtifact(backup),
    polling: pollingView,
  }
}

export function toCleanupSection(
  backup: Backup | null,
  installation: Installation | null,
): CleanupSectionView {
  const source = backup?.cleanupPending
    ? backup
    : installation?.cleanupPending
      ? installation
      : null
  if (source === null) return { kind: 'hidden' }
  const stages = [
    toCleanupStage('derived', source.derivedCleanup, null),
    toCleanupStage('backup', source.backupCleanup, source.derivedCleanup.status),
  ] as const
  return { kind: 'visible', pending: source.cleanupPending, stages }
}

export function toBackupRestoreViewModel(
  input: BackupRestoreProjectionInput,
): BackupRestoreViewModel {
  if (input.list.kind === 'loading' && input.installation.kind === 'loading') {
    return { kind: 'loading', message: 'Loading backup and restore status.' }
  }

  if (input.installation.kind === 'failed' && isAccessFailure(input.installation.error)) {
    return { kind: 'access-error', error: input.installation.error }
  }

  const lock = deriveLifecycleLock({ installation: input.installation })
  const actions = deriveBackupRestoreActions({
    lock,
    command: input.command,
    trackedOperation: input.data.trackedOperation,
  })
  const list = toListSection(input, lock)
  const operation =
    input.data.trackedOperation === null
      ? { kind: 'none' as const }
      : toBackupOperationSection(input.data.trackedOperation, input.polling)
  const installation = getInstallation(input.installation)
  const cleanup = toCleanupSection(input.data.trackedOperation, installation)
  const rows = new Map<string, Backup>()
  for (const id of input.data.order) {
    const backup = input.data.records.get(id)
    if (backup !== undefined) rows.set(id, backup)
  }
  const restore = toRestoreSection(input, actions, lock, rows)

  return {
    kind: 'ready',
    lock,
    actions,
    list,
    create: toCreateSection(input.command, actions, input.data.trackedOperation),
    operation,
    restore,
    cleanup,
    recovery: toRecoverySection(input),
    announcement: toAnnouncement(lock, operation, cleanup),
  }
}

function toListSection(
  input: BackupRestoreProjectionInput,
  lock: LockSectionView,
): BackupListSectionView {
  const rows = input.data.order.flatMap((id) => {
    const backup = input.data.records.get(id)
    return backup === undefined ? [] : [toBackupRowView(backup, lock)]
  })
  if (input.list.kind === 'loading' && rows.length === 0) return { kind: 'loading' }
  if (input.list.kind === 'failed') {
    return rows.length === 0
      ? { kind: 'error', message: input.list.error.message }
      : { kind: 'stale', rows, message: input.list.error.message, refreshing: false }
  }
  if (input.data.totalCount === 0 && rows.length === 0) return { kind: 'empty', totalCount: 0 }
  return {
    kind: 'ready',
    rows,
    totalCount: input.data.totalCount,
    hasMore: input.data.hasMore,
    loadingMore: input.list.kind === 'ready' && input.list.loadingMore,
    refreshing: input.list.kind === 'ready' && input.list.refreshing,
  }
}

function toCreateSection(
  command: BackupRestoreProjectionInput['command'],
  actions: BackupRestoreActions,
  trackedOperation: Backup | null,
) {
  if (command.kind === 'creating') return { kind: 'submitting' as const }
  if (command.kind === 'failed' && command.command === 'create') {
    return { kind: 'failed' as const, error: command.error }
  }
  if (actions.canCreate) return { kind: 'available' as const }
  if (
    trackedOperation !== null &&
    trackedOperation.restoreSourceBackupId === null &&
    (trackedOperation.status === 'creating' ||
      trackedOperation.status === 'restoring' ||
      (trackedOperation.status === 'available' && trackedOperation.cleanupPending))
  ) {
    return { kind: 'tracking' as const, operationId: trackedOperation.id }
  }
  return { kind: 'blocked' as const, reason: actions.disabledReason ?? 'Action unavailable.' }
}

function toRestoreSection(
  input: BackupRestoreProjectionInput,
  actions: BackupRestoreActions,
  lock: LockSectionView,
  records: ReadonlyMap<string, Backup>,
) {
  const blockedReason = actions.disabledReason ?? getLockReason(lock)
  const dialog = input.restoreDialog
  if (dialog.kind === 'closed') {
    return actions.canRestore
      ? { kind: 'available' as const, selected: null }
      : { kind: 'blocked' as const, reason: blockedReason }
  }

  const source = records.get(dialog.backupId)
  const row = source === undefined ? null : toBackupRowView(source, lock)
  if (row === null || source === undefined || !isRestorableSource(source)) {
    return { kind: 'blocked' as const, reason: 'This backup is no longer available for restore.' }
  }
  if (dialog.kind === 'tracking') {
    return { kind: 'tracking' as const, selected: row, operationId: dialog.operationId }
  }
  const confirmation = toRestoreConfirmationAvailability({
    actions,
    lock,
    submitted: dialog.kind === 'submitting',
  })
  if (dialog.kind === 'submitting') {
    return { kind: 'submitting' as const, selected: row, confirmation }
  }
  return {
    kind: 'confirming' as const,
    selected: row,
    requiredConfirmation: 'RESTORE' as const,
    error: dialog.kind === 'confirming' ? dialog.error : null,
    confirmation,
  }
}

function toRestoreConfirmationAvailability(input: {
  readonly actions: BackupRestoreActions
  readonly lock: LockSectionView
  readonly submitted: boolean
}): RestoreConfirmationAvailability {
  if (!input.actions.canRestore) {
    return {
      canConfirm: false,
      confirmDisabledReason: input.actions.disabledReason ?? getLockReason(input.lock),
    }
  }
  if (input.submitted) {
    return {
      canConfirm: false,
      confirmDisabledReason: 'Restore is being submitted.',
    }
  }
  return { canConfirm: true, confirmDisabledReason: null }
}

function toRecoverySection(input: BackupRestoreProjectionInput) {
  if (input.polling.kind === 'idle' || !input.polling.resumedAfterReload) {
    return { kind: 'none' as const }
  }
  const operation = input.data.trackedOperation
  if (operation === null) return { kind: 'none' as const }
  return {
    kind: 'resumed' as const,
    operation:
      operation.restoreSourceBackupId === null ? ('backup' as const) : ('restore' as const),
    operationId: operation.id,
    message: 'This operation was recovered from the server after the page loaded.',
  }
}

function toAnnouncement(
  lock: LockSectionView,
  operation: OperationSectionView,
  cleanup: CleanupSectionView,
): string {
  if (cleanup.kind === 'visible' && cleanup.pending) {
    return 'Installation cleanup is pending. Backup and restore actions are locked.'
  }
  if (operation.kind === 'active') {
    return `${operation.operation === 'backup' ? 'Backup' : 'Restore'} is ${stageAnnouncement(operation.stage)}. Lifecycle actions are locked.`
  }
  if (operation.kind === 'failed') return operation.error.message
  if (lock.kind === 'unknown' || lock.kind === 'loading') {
    return 'Installation lock status is not ready. Backup and restore actions are disabled.'
  }
  if (lock.kind === 'held')
    return `Lifecycle actions are locked while ${lock.operationLabel} is running.`
  return ''
}

function stageAnnouncement(
  stage: Extract<OperationSectionView, { kind: 'active' }>['stage'],
): string {
  switch (stage) {
    case 'capturing-sqlite':
      return 'capturing SQLite'
    case 'preparing-safety-artifact':
      return 'preparing a safety artifact'
    case 'restoring-sqlite':
      return 'restoring SQLite'
    case 'rebuilding-duckdb':
      return 'rebuilding DuckDB'
    case 'structurally-ready':
      return 'structurally ready and awaiting final availability'
    case 'cleanup-pending':
      return 'waiting for cleanup'
    default: {
      const _exhaustive: never = stage
      return _exhaustive
    }
  }
}

function resolveRestoreStage(
  backup: Backup,
): Extract<OperationSectionView, { kind: 'active'; operation: 'restore' }>['stage'] {
  if (backup.status === 'creating') return 'preparing-safety-artifact'
  switch (backup.phase) {
    case 'restoring_sqlite':
      return 'restoring-sqlite'
    case 'rebuilding_duckdb':
      return 'rebuilding-duckdb'
    case 'cleanup_pending':
      return 'cleanup-pending'
    case 'ready':
      return 'structurally-ready'
    case 'capturing_sqlite':
      return 'preparing-safety-artifact'
    case 'failed':
      return 'cleanup-pending'
  }
}

function toPollingIndicator(polling: PollingState) {
  if (polling.kind === 'automatic') {
    return {
      kind: 'automatic' as const,
      attempt: polling.attempt,
      maxAttempts: polling.maxAttempts,
    }
  }
  if (polling.kind === 'manual') return { kind: 'manual' as const, reason: polling.reason }
  return { kind: 'manual' as const, reason: 'Status checks are paused.' }
}

function toSafetyArtifact(backup: Backup) {
  const artifact = backup.preRestoreSafetyArtifact
  if (artifact === null) return { kind: 'not-created' as const }
  if (artifact.status === 'creating') return { kind: 'creating' as const }
  if (artifact.status === 'ready') {
    return {
      kind: 'ready' as const,
      createdAt: artifact.createdAt,
      lastSafeSequence: artifact.lastSafeSequence,
    }
  }
  return {
    kind: 'failed' as const,
    error: normalizeBackupRestoreError({ code: artifact.errorCode }, 'restore'),
  }
}

function toCleanupStage(
  kind: 'derived' | 'backup',
  stage: {
    readonly status: Backup['derivedCleanup']['status']
    readonly startedAt: string | null
    readonly completedAt: string | null
    readonly errorCode: string | null
  },
  derivedStatus: Backup['derivedCleanup']['status'] | null,
) {
  const blockedByDerivedCleanup = kind === 'backup' && derivedStatus !== 'completed'
  return {
    kind,
    label: kind === 'derived' ? ('Derived cleanup' as const) : ('Backup cleanup' as const),
    status: stage.status,
    statusLabel: blockedByDerivedCleanup
      ? 'Waiting for derived cleanup'
      : CLEANUP_LABELS[stage.status],
    startedAt: stage.startedAt,
    completedAt: stage.completedAt,
    error:
      stage.errorCode === null
        ? null
        : normalizeBackupRestoreError({ code: stage.errorCode }, 'status'),
    blockedByDerivedCleanup,
  }
}

function getInstallation(signal: InstallationSignal): Installation | null {
  return signal.kind === 'ready' || signal.kind === 'stale' ? signal.installation : null
}

function isAccessFailure(
  failure: BackupRestoreFailure,
): failure is Extract<BackupRestoreFailure, { kind: 'authentication' | 'forbidden' }> {
  return failure.kind === 'authentication' || failure.kind === 'forbidden'
}

function getLockReason(lock: LockSectionView): string {
  switch (lock.kind) {
    case 'loading':
      return 'Checking installation lock status.'
    case 'unknown':
    case 'cleanup-pending':
    case 'not-ready':
      return lock.message
    case 'held':
      return `${lock.operationLabel} is active. Refresh after it finishes.`
    case 'available':
      return 'Action unavailable.'
    default: {
      const _exhaustive: never = lock
      return _exhaustive
    }
  }
}

function toErrorRecord(error: unknown): Record<string, unknown> | null {
  return isRecord(error) ? error : null
}

function readErrorDetails(error: unknown): {
  readonly code: string | undefined
  readonly status: number | undefined
} {
  const candidates: unknown[] = [error]
  const record = toErrorRecord(error)
  if (record !== null) {
    candidates.push(record.data, record.error, record.cause, record.response)
  }
  let code: string | undefined
  let status: number | undefined
  for (const candidate of candidates) {
    const candidateRecord = toErrorRecord(candidate)
    if (candidateRecord === null) continue
    if (code === undefined && typeof candidateRecord.code === 'string') code = candidateRecord.code
    if (status === undefined && typeof candidateRecord.status === 'number')
      status = candidateRecord.status
    if (status === undefined && typeof candidateRecord.statusCode === 'number') {
      status = candidateRecord.statusCode
    }
  }
  return { code, status }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
