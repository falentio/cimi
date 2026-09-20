import type {
  Installation,
  InstallationResource,
  RetentionCleanup,
  RetentionCleanupStatus,
  RetentionDraft,
  RetentionFailure,
  RetentionLockView,
  RetentionPolicy,
  RetentionResource,
  RetentionState,
  RetentionValidation,
  ShorteningImpact,
  RetentionCleanupView,
  RetentionAdminViewModel,
} from './retention-policy.types'

export const SHORTEN_RETENTION_CONFIRMATION = 'SHORTEN RETENTION' as const

const CLEANUP_STATUS_LABELS: Record<RetentionCleanupStatus, string> = {
  not_applicable: 'Not required',
  not_started: 'Not started',
  pending: 'Pending',
  running: 'Running',
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

export function draftFromPolicy(policy: RetentionPolicy): RetentionDraft {
  return {
    eventMonths: String(policy.eventMonths),
    profileMonths: String(policy.profileMonths),
    replayMonths: policy.replayMonths === null ? '' : String(policy.replayMonths),
  }
}

export function parseRetentionDraft(draft: RetentionDraft) {
  const fieldErrors: Partial<Record<keyof RetentionPolicy, string>> = {}
  const eventMonths = parseMonths(draft.eventMonths, 'Event retention', fieldErrors, 'eventMonths')
  const profileMonths = parseMonths(
    draft.profileMonths,
    'Profile retention',
    fieldErrors,
    'profileMonths',
  )
  const replayMonths = parseReplayMonths(draft.replayMonths, fieldErrors)

  if (eventMonths !== null && profileMonths !== null && profileMonths > eventMonths) {
    fieldErrors.profileMonths = 'Profile retention cannot exceed Event retention.'
  }
  if (replayMonths !== null && eventMonths !== null && replayMonths >= eventMonths) {
    fieldErrors.replayMonths = 'Replay retention must be shorter than Event retention.'
  }
  if (replayMonths !== null && profileMonths !== null && replayMonths >= profileMonths) {
    fieldErrors.replayMonths = 'Replay retention must be shorter than Profile retention.'
  }

  if (Object.keys(fieldErrors).length > 0 || eventMonths === null || profileMonths === null) {
    return {
      kind: 'invalid' as const,
      validation: {
        fieldErrors,
        formError: null,
      } satisfies RetentionValidation,
    }
  }

  return {
    kind: 'valid' as const,
    policy: { eventMonths, profileMonths, replayMonths },
  }
}

export function isRetentionDirty(policy: RetentionPolicy, draft: RetentionDraft): boolean {
  const initial = draftFromPolicy(policy)
  return (
    initial.eventMonths !== draft.eventMonths ||
    initial.profileMonths !== draft.profileMonths ||
    initial.replayMonths !== draft.replayMonths
  )
}

export function isRetentionShortening(current: RetentionPolicy, next: RetentionPolicy): boolean {
  return (
    next.eventMonths < current.eventMonths ||
    next.profileMonths < current.profileMonths ||
    (current.replayMonths !== null &&
      (next.replayMonths === null || next.replayMonths < current.replayMonths))
  )
}

export function retentionShorteningImpact(
  current: RetentionPolicy,
  next: RetentionPolicy,
): ShorteningImpact {
  return {
    event:
      next.eventMonths < current.eventMonths
        ? { from: current.eventMonths, to: next.eventMonths }
        : null,
    profile:
      next.profileMonths < current.profileMonths
        ? { from: current.profileMonths, to: next.profileMonths }
        : null,
    replay:
      current.replayMonths !== next.replayMonths &&
      current.replayMonths !== null &&
      (next.replayMonths === null || next.replayMonths < current.replayMonths)
        ? { from: current.replayMonths, to: next.replayMonths }
        : null,
  }
}

export function isExactRetentionConfirmation(
  value: string,
): value is typeof SHORTEN_RETENTION_CONFIRMATION {
  return value === SHORTEN_RETENTION_CONFIRMATION
}

export function formatRetentionDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  )
}

export function normalizeRetentionError(
  error: unknown,
  source: 'read' | 'update' | 'status',
): RetentionFailure {
  const details = readErrorDetails(error)
  if (details.code === 'UNAUTHORIZED' || details.status === 401) {
    return {
      kind: 'authentication',
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      message: 'Sign in as an installation administrator to continue.',
      action: 'sign-in',
    }
  }
  if (details.code === 'FORBIDDEN' || details.status === 403) {
    return {
      kind: 'forbidden',
      code: 'FORBIDDEN',
      httpStatus: 403,
      message: 'Your account is not an installation administrator.',
      action: 'contact-admin',
    }
  }
  if (details.code === 'NOT_FOUND' || details.status === 404) {
    return {
      kind: 'not-found',
      code: 'NOT_FOUND',
      httpStatus: 404,
      message:
        source === 'status'
          ? 'The installation is not available. Refresh or initialize it before changing retention.'
          : 'Retention settings are not available. Refresh or initialize the installation.',
      action: source === 'status' ? 'refresh' : 'setup',
    }
  }
  if (details.code === 'BAD_REQUEST' || details.status === 400) {
    return {
      kind: 'bad-request',
      code: 'BAD_REQUEST',
      httpStatus: 400,
      message:
        source === 'update'
          ? 'The retention values were rejected. Review the horizon rules and try again.'
          : 'The retention request was invalid. Refresh and try again.',
      action: 'edit',
    }
  }
  if (details.code === 'CONFLICT' || details.status === 409) {
    return {
      kind: 'conflict',
      code: 'CONFLICT',
      httpStatus: 409,
      message: 'Another installation operation is active. Refresh before trying again.',
      action: 'refresh',
    }
  }
  if (details.code === 'INTERNAL_SERVER_ERROR' || details.status === 500) {
    return {
      kind: 'server',
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
      message: 'Retention status could not be completed safely. Refresh and try again.',
      action: 'refresh',
    }
  }

  return {
    kind: 'retryable',
    code: details.code,
    httpStatus: details.status,
    message:
      source === 'status'
        ? 'Installation status could not be verified. Refresh before acting.'
        : source === 'update'
          ? 'The retention policy could not be saved safely. Refresh and try again.'
          : 'Retention settings could not be loaded. Refresh and try again.',
    action: source === 'update' ? 'retry' : 'refresh',
  }
}

export function deriveRetentionLock(installation: InstallationResource): RetentionLockView {
  if (installation.kind === 'loading') return { kind: 'loading' }
  if (installation.kind === 'failed' || installation.kind === 'stale') {
    return {
      kind: 'unknown',
      message: 'Installation status is unavailable or stale. Refresh before acting.',
    }
  }
  if (installation.refreshing) return { kind: 'loading' }

  const activeOperation = installation.installation.activeOperation
  if (activeOperation !== null && activeOperation.errorCode === null) {
    return {
      kind: 'held',
      operationKind: activeOperation.kind,
      operationLabel: OPERATION_LABELS[activeOperation.kind],
    }
  }
  if (installation.installation.cleanupPending) {
    return {
      kind: 'cleanup-pending',
      message: 'Installation cleanup is pending. Refresh before acting.',
    }
  }
  if (
    installation.installation.status !== 'ready' ||
    !installation.installation.dataDirectoryReady
  ) {
    return {
      kind: 'not-ready',
      message: 'The installation must be ready before retention can change.',
    }
  }
  return { kind: 'available' }
}

export function getRetentionLockReason(lock: RetentionLockView): string | null {
  switch (lock.kind) {
    case 'loading':
      return 'Checking installation status.'
    case 'unknown':
    case 'cleanup-pending':
    case 'not-ready':
      return lock.message
    case 'held':
      return `${lock.operationLabel} is active. Refresh before changing retention.`
    case 'available':
      return null
    default: {
      const _exhaustive: never = lock
      return _exhaustive
    }
  }
}

export function toRetentionCleanupProjection(cleanup: RetentionCleanup): RetentionCleanupView {
  const stages = [
    toCleanupStage('derived', cleanup.derived, false),
    toCleanupStage('backup', cleanup.backup, cleanup.derived.status !== 'completed'),
  ] as const
  return { pending: cleanup.pending, stages }
}

export function toRetentionAdminView(state: RetentionState): RetentionAdminViewModel {
  if (state.retention.kind === 'loading') {
    return { kind: 'loading', message: 'Loading installation retention settings.' }
  }

  if (state.retention.kind === 'failed') {
    if (
      state.retention.error.kind === 'authentication' ||
      state.retention.error.kind === 'forbidden'
    ) {
      return { kind: 'access-error', error: state.retention.error }
    }
    if (
      state.retention.error.kind === 'not-found' &&
      state.installation.kind === 'ready' &&
      state.installation.installation.status === 'uninitialized'
    ) {
      return {
        kind: 'not-initialized',
        message: 'Initialize the installation before managing retention settings.',
      }
    }
    return { kind: 'error', error: state.retention.error }
  }

  const result = state.retention.result
  if (
    state.installation.kind === 'ready' &&
    state.installation.installation.status === 'uninitialized'
  ) {
    return {
      kind: 'not-initialized',
      message: 'Initialize the installation before managing retention settings.',
    }
  }

  const draft = state.draft ?? draftFromPolicy(result.installationDefault)
  const validation = parseRetentionDraft(draft)
  const stale = state.retention.kind === 'stale'
  const lock = deriveRetentionLock(state.installation)
  const saving = state.command.kind === 'submitting'
  const serverError = state.command.kind === 'failed' ? state.command.error : null
  const disabledReason = getDisabledReason({ stale, lock, saving, validation })
  const dirty = isRetentionDirty(result.installationDefault, draft)
  const canAttemptSubmit = dirty && !saving && !stale && lock.kind === 'available'
  const retentionError = state.retention.kind === 'stale' ? state.retention.error : null

  return {
    kind: 'ready',
    result,
    policy: {
      draft,
      current: result.installationDefault,
      effective: result.effectivePolicy,
      validation,
      dirty,
      saving,
      canAttemptSubmit,
      canSubmit: validation.kind === 'valid' && canAttemptSubmit,
      disabledReason,
      serverError,
      updatedAt: result.updatedAt,
    },
    cleanup: toRetentionCleanupProjection(result.cleanup),
    lock,
    command: state.command,
    stale,
    retentionError,
    notice: state.notice,
    refreshing: isRefreshing(state.retention) || isRefreshing(state.installation),
    announcement: buildAnnouncement(state),
  }
}

function parseMonths(
  value: string,
  label: string,
  errors: Partial<Record<keyof RetentionPolicy, string>>,
  field: 'eventMonths' | 'profileMonths',
): number | null {
  if (value.length === 0) {
    errors[field] = `${label} is required.`
    return null
  }
  if (!/^\d+$/.test(value)) {
    errors[field] = `${label} must be a whole number from 1 to 120.`
    return null
  }
  const months = Number(value)
  if (months < 1 || months > 120) {
    errors[field] = `${label} must be between 1 and 120 months.`
    return null
  }
  return months
}

function parseReplayMonths(
  value: string,
  errors: Partial<Record<keyof RetentionPolicy, string>>,
): number | null {
  if (value.length === 0) return null
  if (!/^\d+$/.test(value)) {
    errors.replayMonths = 'Replay retention must be blank or a whole number from 1 to 120.'
    return null
  }
  const months = Number(value)
  if (months < 1 || months > 120) {
    errors.replayMonths = 'Replay retention must be between 1 and 120 months.'
    return null
  }
  return months
}

function toCleanupStage(
  kind: 'derived' | 'backup',
  stage: RetentionCleanup['derived'],
  blockedByDerivedCleanup: boolean,
) {
  return {
    kind,
    label:
      kind === 'derived' ? ('Derived cleanup' as const) : ('Historical backup cleanup' as const),
    status: stage.status,
    statusLabel: CLEANUP_STATUS_LABELS[stage.status],
    startedAt: stage.startedAt,
    completedAt: stage.completedAt,
    blockedByDerivedCleanup: kind === 'backup' && blockedByDerivedCleanup,
    errorMessage: stage.errorCode === null ? null : cleanupErrorMessage(kind, stage.errorCode),
  }
}

function cleanupErrorMessage(
  kind: 'derived' | 'backup',
  code: NonNullable<RetentionCleanup['derived']['errorCode']>,
): string {
  if (kind === 'backup' || code === 'BACKUP_FAILED') {
    return 'Historical backup cleanup failed. Review backup and restore status.'
  }
  if (code === 'CLEANUP_FAILED')
    return 'Derived cleanup failed. Refresh status and review operations.'
  if (code === 'RETENTION_FAILED')
    return 'Derived cleanup could not finish. Refresh status and try again later.'
  return 'Cleanup could not finish safely. Refresh status and review operations.'
}

function getDisabledReason(input: {
  readonly stale: boolean
  readonly lock: RetentionLockView
  readonly saving: boolean
  readonly validation: ReturnType<typeof parseRetentionDraft>
}): string | null {
  if (input.saving) return 'Saving retention settings.'
  if (input.stale) return 'Retention settings are stale. Refresh before saving.'
  const lockReason = getRetentionLockReason(input.lock)
  if (lockReason !== null) return lockReason
  if (input.validation.kind === 'invalid') return 'Fix the retention values before saving.'
  return null
}

function isRefreshing(resource: RetentionResource | InstallationResource): boolean {
  return resource.kind === 'ready' || resource.kind === 'stale' ? resource.refreshing : false
}

function buildAnnouncement(state: RetentionState): string {
  if (state.notice !== null) return state.notice.message
  if (state.command.kind === 'submitting') return 'Saving retention settings.'
  if (state.retention.kind === 'stale') return state.retention.error.message
  if (state.retention.kind === 'ready' && state.retention.result.cleanup.pending) {
    return 'Cleanup is pending. Derived cleanup runs before historical backup cleanup.'
  }
  return ''
}

function readErrorDetails(error: unknown): {
  readonly code: string | undefined
  readonly status: number | undefined
} {
  const candidates: unknown[] = [error]
  if (isRecord(error)) candidates.push(error.data, error.error, error.cause, error.response)

  let code: string | undefined
  let status: number | undefined
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue
    if (code === undefined && typeof candidate.code === 'string') code = candidate.code
    if (status === undefined && typeof candidate.status === 'number') status = candidate.status
    if (status === undefined && typeof candidate.statusCode === 'number')
      status = candidate.statusCode
  }
  return { code, status }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
