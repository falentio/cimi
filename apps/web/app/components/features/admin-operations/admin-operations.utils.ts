import { describeHealth, getOperationFailureMessage } from '../setup/setup.utils'
import type {
  Health,
  HealthView,
  InitializedInstallation,
  Installation,
  LifecycleView,
  SetupHealth,
  SetupInstallation,
  SetupOperation,
  SetupViewModel,
} from '../setup/setup.types'

export type HealthStatus = Health['status']
export type StoreHealthStatus = Health['controlStore']
export type InstallationStatus = Installation['status']
export type CleanupStageStatus = SetupInstallation['derivedCleanup']['status']
export type OperationKind = SetupOperation['kind']
export type OperationPhase = SetupOperation['phase']
export type OperationCheckpoint = SetupOperation['checkpoint']

type HealthMatrixEntry<Status extends HealthStatus> = {
  readonly status: Status
  readonly label: string
}

export const HEALTH_MATRIX = [
  { status: 'healthy', label: 'Healthy' },
  { status: 'degraded', label: 'Degraded' },
  { status: 'recovering', label: 'Recovering' },
  { status: 'maintenance', label: 'Maintenance' },
  { status: 'unavailable', label: 'Unavailable' },
] as const satisfies readonly [
  HealthMatrixEntry<'healthy'>,
  HealthMatrixEntry<'degraded'>,
  HealthMatrixEntry<'recovering'>,
  HealthMatrixEntry<'maintenance'>,
  HealthMatrixEntry<'unavailable'>,
]

export const ADMIN_OPERATION_LINKS = [
  { href: '/admin/backup-restore', label: 'Read backup and restore status' },
  { href: '/admin/retention', label: 'Review retention settings' },
] as const

const INSTALLATION_STATUS_LABELS: Record<InstallationStatus, string> = {
  uninitialized: 'Uninitialized',
  ready: 'Ready',
  degraded: 'Degraded',
  maintenance: 'Maintenance',
  recovering: 'Recovering',
}

const STORE_STATUS_LABELS: Record<StoreHealthStatus, string> = {
  ready: 'Ready',
  degraded: 'Degraded',
  rebuilding: 'Rebuilding',
  unavailable: 'Unavailable',
}

const CLEANUP_STATUS_LABELS: Record<CleanupStageStatus, string> = {
  not_applicable: 'Not applicable',
  not_started: 'Not started',
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
}

const OPERATION_KIND_LABELS: Record<OperationKind, string> = {
  backup: 'Backup',
  restore: 'Restore',
  upgrade: 'Upgrade',
  retention: 'Retention',
  cleanup: 'Cleanup',
  site_deletion: 'Site deletion',
  site_recovery: 'Site recovery',
  site_purge: 'Site purge',
}

const OPERATION_PHASE_LABELS: Record<OperationPhase, string> = {
  pre_upgrade_safety: 'Pre-upgrade safety',
  site_transition: 'Site transition',
  lifecycle_transition: 'Lifecycle transition',
}

const OPERATION_CHECKPOINT_LABELS: Record<OperationCheckpoint, string> = {
  none: 'None',
  sqlite_captured: 'SQLite captured',
  duckdb_rebuilt: 'DuckDB rebuilt',
  structurally_ready: 'Structurally ready',
}

export type AdminHealthMatrixRow = {
  readonly status: HealthStatus
  readonly label: string
  readonly current: boolean
}

export type AdminHealthReport = {
  readonly status: HealthStatus
  readonly title: string
  readonly description: string
  readonly matrix: readonly AdminHealthMatrixRow[]
  readonly controlStore: StoreHealthStatus
  readonly controlStoreLabel: string
  readonly analyticsStore: StoreHealthStatus
  readonly analyticsStoreLabel: string
  readonly cleanupPending: boolean
  readonly version: string
  readonly checkedAt: string
}

export type AdminHealthProjection =
  | { readonly kind: 'loading'; readonly matrix: readonly AdminHealthMatrixRow[] }
  | {
      readonly kind: 'failure'
      readonly matrix: readonly AdminHealthMatrixRow[]
      readonly message: string
    }
  | { readonly kind: 'report'; readonly report: AdminHealthReport }
  | {
      readonly kind: 'stale-report'
      readonly report: AdminHealthReport
      readonly message: string
    }

export type AdminOperationProjection =
  | {
      readonly status: 'active'
      readonly operationId: string
      readonly operationKind: OperationKind
      readonly operationKindLabel: string
      readonly phase: OperationPhase
      readonly phaseLabel: string
      readonly checkpoint: OperationCheckpoint
      readonly checkpointLabel: string
      readonly progress: number | null
      readonly lastSafeSequence: number | null
    }
  | {
      readonly status: 'failed'
      readonly operationId: string
      readonly operationKind: OperationKind
      readonly operationKindLabel: string
      readonly phase: OperationPhase
      readonly phaseLabel: string
      readonly checkpoint: OperationCheckpoint
      readonly checkpointLabel: string
      readonly progress: number | null
      readonly lastSafeSequence: number | null
      readonly failureMessage: string
    }

export type AdminLifecycleProjection =
  | {
      readonly kind: 'idle'
      readonly installationStatus: Exclude<InstallationStatus, 'uninitialized'>
    }
  | {
      readonly kind: 'active'
      readonly installationStatus: Exclude<InstallationStatus, 'uninitialized'>
      readonly operation: Extract<AdminOperationProjection, { status: 'active' }>
      readonly refreshMode: 'automatic' | 'manual'
    }
  | {
      readonly kind: 'failed'
      readonly installationStatus: Exclude<InstallationStatus, 'uninitialized'>
      readonly operation: Extract<AdminOperationProjection, { status: 'failed' }>
    }

export type AdminCleanupStageProjection = {
  readonly kind: 'derived' | 'backup'
  readonly label: 'Derived cleanup' | 'Backup cleanup'
  readonly status: CleanupStageStatus
  readonly statusLabel: string
  readonly startedAt: string | null
  readonly completedAt: string | null
}

export type AdminCleanupProjection = {
  readonly pending: boolean
  readonly stages: readonly [AdminCleanupStageProjection, AdminCleanupStageProjection]
}

type AdminInstallationDetails = {
  readonly status: Exclude<InstallationStatus, 'uninitialized'>
  readonly statusLabel: string
  readonly dataDirectoryReady: boolean
  readonly cleanupPending: boolean
  readonly updatedAt: string
  readonly lifecycle: AdminLifecycleProjection
  readonly cleanup: AdminCleanupProjection
}

export type AdminInstallationProjection =
  | { readonly kind: 'loading' }
  | { readonly kind: 'auth-required'; readonly message: string }
  | { readonly kind: 'admin-required'; readonly message: string }
  | {
      readonly kind: 'not-initialized'
      readonly statusLabel: 'Uninitialized'
    }
  | { readonly kind: 'failure'; readonly message: string }
  | ({ readonly kind: 'report'; readonly stale: false } & AdminInstallationDetails)
  | ({
      readonly kind: 'stale-report'
      readonly stale: true
      readonly message: string
    } & AdminInstallationDetails)

export type AdminOperationsProjection = {
  readonly health: AdminHealthProjection
  readonly installation: AdminInstallationProjection
}

export function toAdminOperationsView(view: SetupViewModel): AdminOperationsProjection {
  return {
    health: toAdminHealthProjection(view.health),
    installation: toAdminInstallationProjection(view),
  }
}

export function toAdminHealthProjection(health: HealthView): AdminHealthProjection {
  const matrix = HEALTH_MATRIX.map((entry) => ({ ...entry, current: false }))
  if (health.kind === 'loading') return { kind: 'loading', matrix }
  if (health.kind === 'failure') return { kind: 'failure', matrix, message: health.error.message }

  const report = toAdminHealthReport(health.report)
  if (health.kind === 'stale-report') {
    return { kind: 'stale-report', report, message: health.error.message }
  }
  return { kind: 'report', report }
}

export function toAdminCleanupProjection(installation: SetupInstallation): AdminCleanupProjection {
  const stages = [
    toAdminCleanupStage('derived', installation.derivedCleanup),
    toAdminCleanupStage('backup', installation.backupCleanup),
  ] as const satisfies AdminCleanupProjection['stages']
  return { pending: installation.cleanupPending, stages }
}

function toAdminHealthReport(health: SetupHealth): AdminHealthReport {
  const description = describeHealth(health)
  const matrix: readonly AdminHealthMatrixRow[] = HEALTH_MATRIX.map((entry) => ({
    ...entry,
    current: entry.status === health.status,
  }))
  return {
    status: health.status,
    title: description.title,
    description: description.description,
    matrix,
    controlStore: health.controlStore,
    controlStoreLabel: STORE_STATUS_LABELS[health.controlStore],
    analyticsStore: health.analyticsStore,
    analyticsStoreLabel: STORE_STATUS_LABELS[health.analyticsStore],
    cleanupPending: health.cleanupPending,
    version: health.version,
    checkedAt: health.checkedAt,
  }
}

function toAdminInstallationProjection(view: SetupViewModel): AdminInstallationProjection {
  switch (view.kind) {
    case 'loading':
      return { kind: 'loading' }
    case 'auth-required':
      return {
        kind: 'auth-required',
        message: 'Sign in as an installation administrator to view operations.',
      }
    case 'admin-required':
      return {
        kind: 'admin-required',
        message: 'Your account is not an installation administrator.',
      }
    case 'not-initialized':
      return {
        kind: 'not-initialized',
        statusLabel: 'Uninitialized',
      }
    case 'installation-failure':
      return { kind: 'failure', message: view.installation.error.message }
    case 'operational': {
      const details = toAdminInstallationDetails(view.installation.installation, view.lifecycle)
      if (view.installation.kind === 'stale-failure') {
        return {
          kind: 'stale-report',
          stale: true,
          message: view.installation.error.message,
          ...details,
        }
      }
      return { kind: 'report', stale: false, ...details }
    }
    default: {
      const _exhaustive: never = view
      return _exhaustive
    }
  }
}

function toAdminInstallationDetails(
  installation: InitializedInstallation,
  lifecycle: LifecycleView,
): AdminInstallationDetails {
  return {
    status: installation.status,
    statusLabel: INSTALLATION_STATUS_LABELS[installation.status],
    dataDirectoryReady: installation.dataDirectoryReady,
    cleanupPending: installation.cleanupPending,
    updatedAt: installation.updatedAt,
    lifecycle: toAdminLifecycleProjection(lifecycle, installation.status),
    cleanup: toAdminCleanupProjection(installation),
  }
}

function toAdminLifecycleProjection(
  lifecycle: LifecycleView,
  installationStatus: InitializedInstallation['status'],
): AdminLifecycleProjection {
  switch (lifecycle.kind) {
    case 'idle':
      return {
        kind: 'idle',
        installationStatus: lifecycle.installationStatus,
      }
    case 'running':
      return {
        kind: 'active',
        installationStatus,
        operation: toAdminActiveOperation(lifecycle.operation),
        refreshMode: lifecycle.polling.kind === 'active' ? 'automatic' : 'manual',
      }
    case 'failed':
      return {
        kind: 'failed',
        installationStatus,
        operation: toAdminFailedOperation(lifecycle.operation),
      }
    default: {
      const _exhaustive: never = lifecycle
      return _exhaustive
    }
  }
}

function toAdminActiveOperation(
  operation: SetupOperation,
): Extract<AdminOperationProjection, { status: 'active' }> {
  return { status: 'active', ...toAdminOperationDetails(operation) }
}

function toAdminFailedOperation(
  operation: SetupOperation,
): Extract<AdminOperationProjection, { status: 'failed' }> {
  return {
    status: 'failed',
    ...toAdminOperationDetails(operation),
    failureMessage: getOperationFailureMessage(operation),
  }
}

function toAdminOperationDetails(operation: SetupOperation) {
  return {
    operationId: operation.operationId,
    operationKind: operation.kind,
    operationKindLabel: OPERATION_KIND_LABELS[operation.kind],
    phase: operation.phase,
    phaseLabel: OPERATION_PHASE_LABELS[operation.phase],
    checkpoint: operation.checkpoint,
    checkpointLabel: OPERATION_CHECKPOINT_LABELS[operation.checkpoint],
    progress: operation.progress,
    lastSafeSequence: operation.lastSafeSequence,
  }
}

function toAdminCleanupStage(
  kind: 'derived' | 'backup',
  stage: SetupInstallation['derivedCleanup'],
): AdminCleanupStageProjection {
  return {
    kind,
    label: kind === 'derived' ? 'Derived cleanup' : 'Backup cleanup',
    status: stage.status,
    statusLabel: CLEANUP_STATUS_LABELS[stage.status],
    startedAt: stage.startedAt,
    completedAt: stage.completedAt,
  }
}
