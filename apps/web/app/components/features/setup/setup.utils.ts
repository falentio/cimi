import type {
  DeriveSetupViewInput,
  Health,
  HealthResource,
  HealthView,
  InitializeResponse,
  InitializationOutcome,
  InitializedInstallation,
  Installation,
  InstallationResource,
  LifecycleView,
  PollingView,
  QuerySnapshot,
  SetupFailure,
  SetupHealth,
  SetupInstallation,
  SetupOperation,
  SetupViewModel,
  UpgradeView,
} from './setup.types'

type SetupErrorSource = 'status' | 'health' | 'initialize' | 'upgrade'

const FALLBACK_MESSAGES: Record<SetupErrorSource, string> = {
  status: 'Installation status could not be loaded. Refresh and try again.',
  health: 'Health status could not be loaded. Refresh and try again.',
  initialize: 'Installation could not be initialized. Refresh and try again.',
  upgrade: 'Upgrade could not be started. Refresh and try again.',
}

export function toInstallationResource(
  snapshot: QuerySnapshot<Installation>,
): InstallationResource {
  const installation = snapshot.data === undefined ? undefined : pickInstallation(snapshot.data)
  if (installation !== undefined && snapshot.error !== null && snapshot.error !== undefined) {
    return {
      kind: 'stale-failure',
      installation,
      error: mapSetupError(snapshot.error, 'status'),
    }
  }

  if (installation !== undefined) {
    return snapshot.isLoading
      ? { kind: 'refreshing', installation }
      : { kind: 'ready', installation }
  }

  if (snapshot.isLoading || snapshot.error === null || snapshot.error === undefined) {
    return { kind: 'loading' }
  }

  const details = readErrorDetails(snapshot.error)
  if (details.code === 'NOT_FOUND' || details.status === 404) {
    return { kind: 'not-found', httpStatus: 404 }
  }
  if (details.code === 'UNAUTHORIZED' || details.status === 401) {
    return { kind: 'unauthorized', httpStatus: 401 }
  }
  if (details.code === 'FORBIDDEN' || details.status === 403) {
    return { kind: 'forbidden', httpStatus: 403 }
  }
  return { kind: 'failure', error: mapSetupError(snapshot.error, 'status') }
}

export function toHealthResource(snapshot: QuerySnapshot<Health>): HealthResource {
  const health = snapshot.data === undefined ? undefined : pickHealth(snapshot.data)
  if (health !== undefined && snapshot.error !== null && snapshot.error !== undefined) {
    return {
      kind: 'stale-failure',
      health,
      error: mapSetupError(snapshot.error, 'health'),
    }
  }

  if (health !== undefined) {
    return snapshot.isLoading ? { kind: 'refreshing', health } : { kind: 'ready', health }
  }

  if (snapshot.isLoading || snapshot.error === null || snapshot.error === undefined) {
    return { kind: 'loading' }
  }
  return { kind: 'failure', error: mapSetupError(snapshot.error, 'health') }
}

export function describeHealth(
  health: SetupHealth,
): Pick<Extract<HealthView, { kind: 'report' }>, 'title' | 'description' | 'action'> {
  switch (health.status) {
    case 'healthy':
      return {
        title: 'Healthy',
        description: 'Cimi is ready. Control and analytics stores are ready.',
        action: 'none',
      }
    case 'degraded':
      return {
        title: 'Degraded',
        description:
          'Cimi is operating with reduced analytics readiness. Check again after the underlying work completes.',
        action: 'refresh',
      }
    case 'recovering':
      return {
        title: 'Recovering',
        description: 'Cimi is recovering. Keep this page open and check again for readiness.',
        action: 'refresh',
      }
    case 'maintenance':
      return {
        title: 'Maintenance',
        description:
          'Cimi is in maintenance. New work may be paused until the lifecycle operation completes.',
        action: 'refresh',
      }
    case 'unavailable':
      return {
        title: 'Unavailable',
        description:
          'The control store is unavailable. Check the server data directory and try again.',
        action: 'refresh',
      }
  }
}

export function deriveHealthView(resource: HealthResource): HealthView {
  if (resource.kind === 'loading') return resource
  if (resource.kind === 'failure') return resource

  const description = describeHealth(resource.health)
  if (resource.kind === 'stale-failure') {
    return {
      kind: 'stale-report',
      report: resource.health,
      error: resource.error,
      title: description.title,
      description: description.description,
      action: 'refresh',
    }
  }
  return { kind: 'report', report: resource.health, ...description }
}

export function deriveLifecycleView(
  installation: InitializedInstallation,
  polling: PollingView,
): LifecycleView {
  const operation = installation.activeOperation
  if (operation === null) {
    return { kind: 'idle', installationStatus: installation.status }
  }
  if (operation.errorCode !== null) return { kind: 'failed', operation }
  return { kind: 'running', operation, polling }
}

export function canStartUpgrade(
  installation: InitializedInstallation,
  lifecycle: LifecycleView,
): boolean {
  if (lifecycle.kind === 'running') return false
  if (lifecycle.kind === 'failed' && lifecycle.operation.kind !== 'upgrade') return false
  if (installation.status === 'ready') return true
  return (
    installation.status === 'degraded' &&
    lifecycle.kind === 'failed' &&
    lifecycle.operation.kind === 'upgrade'
  )
}

export function deriveSetupView(input: DeriveSetupViewInput): SetupViewModel {
  const health = deriveHealthView(input.health)
  const installation = input.installation

  if (installation.kind === 'loading') {
    return { kind: 'loading', installation, health }
  }
  if (installation.kind === 'unauthorized') {
    return { kind: 'auth-required', installation, health }
  }
  if (installation.kind === 'forbidden') {
    return { kind: 'admin-required', installation, health }
  }
  if (installation.kind === 'not-found') {
    return { kind: 'not-initialized', installation, health, initialization: input.initialization }
  }
  if (installation.kind === 'failure') {
    return { kind: 'installation-failure', installation, health }
  }

  const currentInstallation = installation.installation
  if (!isInitializedInstallation(currentInstallation)) {
    return {
      kind: 'not-initialized',
      installation: {
        kind: 'known-uninitialized',
        installation: { ...currentInstallation, status: 'uninitialized' as const },
      },
      health,
      initialization: input.initialization,
    }
  }

  const lifecycle = deriveLifecycleView(currentInstallation, input.polling)
  const upgrade = resolveUpgradeView(currentInstallation, lifecycle, input.upgrade)
  return {
    kind: 'operational',
    installation: toInitializedResource(installation),
    health,
    lifecycle,
    upgrade,
    notice: input.notice,
  }
}

export function mapSetupError(error: unknown, source: SetupErrorSource): SetupFailure {
  const details = readErrorDetails(error)
  if (details.code === 'UNAUTHORIZED' || details.status === 401) {
    return {
      kind: 'authentication-required',
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      message: 'Sign in as an installation administrator to continue.',
      action: 'sign-in',
    }
  }
  if (details.code === 'FORBIDDEN' || details.status === 403) {
    return {
      kind: 'admin-required',
      code: 'FORBIDDEN',
      httpStatus: 403,
      message: 'Your account is not an installation administrator.',
      action: 'contact-admin',
    }
  }
  if (details.code === 'CONFLICT' || details.status === 409) {
    return {
      kind: 'conflict',
      code: 'CONFLICT',
      httpStatus: 409,
      message: 'The installation is busy with another lifecycle operation. Refresh and try again.',
      action: 'refresh',
    }
  }
  if (details.code === 'INCOMPATIBLE_BACKUP') {
    return {
      kind: 'upgrade-rejected',
      code: 'INCOMPATIBLE_BACKUP',
      httpStatus: 422,
      message:
        'The installation cannot be upgraded from its current safety backup. Resolve it and retry.',
      action: 'resolve-and-retry',
    }
  }
  if (details.code === 'INSUFFICIENT_STORAGE') {
    return {
      kind: 'upgrade-rejected',
      code: 'INSUFFICIENT_STORAGE',
      httpStatus: 507,
      message: 'Free storage on the server before retrying the installation upgrade.',
      action: 'resolve-and-retry',
    }
  }
  return {
    kind: 'retryable',
    code: details.code,
    httpStatus: details.status,
    message: FALLBACK_MESSAGES[source],
    action: 'retry',
  }
}

export function mapInitializeResponse(response: InitializeResponse): InitializationOutcome {
  const installation = pickInstallation(response.body)
  if (response.status === 201) {
    return {
      kind: 'created' as const,
      httpStatus: 201 as const,
      installation,
    }
  }
  return {
    kind: 'reused' as const,
    httpStatus: 200 as const,
    installation,
  }
}

export function isExactUpgradeConfirmation(value: string): value is 'UPGRADE' {
  return value === 'UPGRADE'
}

export function getOperationFailureMessage(operation: SetupOperation): string {
  if (operation.errorCode === 'INCOMPATIBLE_BACKUP') {
    return 'The installation upgrade needs a compatible safety backup before it can continue.'
  }
  if (operation.errorCode === 'INSUFFICIENT_STORAGE') {
    return 'The installation upgrade needs more server storage before it can continue.'
  }
  return 'The lifecycle operation stopped. Refresh status and retry the action when it is safe.'
}

export function isInitializedInstallation(
  installation: SetupInstallation,
): installation is InitializedInstallation {
  return installation.status !== 'uninitialized'
}

function resolveUpgradeView(
  installation: InitializedInstallation,
  lifecycle: LifecycleView,
  requested: UpgradeView,
): UpgradeView {
  if (requested.kind !== 'available' && requested.kind !== 'blocked') return requested
  if (!canStartUpgrade(installation, lifecycle)) {
    return {
      kind: 'blocked',
      reason:
        lifecycle.kind === 'running' || lifecycle.kind === 'failed'
          ? 'operation-active'
          : 'installation-not-ready',
    }
  }
  return { kind: 'available' }
}

function toInitializedResource(
  resource: Extract<InstallationResource, { kind: 'ready' | 'refreshing' | 'stale-failure' }>,
): Extract<SetupViewModel, { kind: 'operational' }>['installation'] {
  if (resource.kind === 'stale-failure') {
    return {
      kind: 'stale-failure',
      installation: requireInitialized(resource.installation),
      error: resource.error,
    }
  }
  return {
    kind: resource.kind,
    installation: requireInitialized(resource.installation),
  }
}

function requireInitialized(installation: SetupInstallation): InitializedInstallation {
  if (!isInitializedInstallation(installation)) {
    throw new Error('An uninitialized installation cannot be operational.')
  }
  return installation
}

function pickInstallation(installation: Installation): SetupInstallation {
  return {
    status: installation.status,
    dataDirectoryReady: installation.dataDirectoryReady,
    activeOperation: installation.activeOperation,
    cleanupPending: installation.cleanupPending,
    derivedCleanup: installation.derivedCleanup,
    backupCleanup: installation.backupCleanup,
    updatedAt: installation.updatedAt,
  }
}

function pickHealth(health: Health): SetupHealth {
  return {
    status: health.status,
    controlStore: health.controlStore,
    analyticsStore: health.analyticsStore,
    cleanupPending: health.cleanupPending,
    version: health.version,
    checkedAt: health.checkedAt,
  }
}

function readErrorDetails(error: unknown): {
  readonly code: string | undefined
  readonly status: number | undefined
} {
  const candidates: unknown[] = [error]
  if (isRecord(error)) {
    candidates.push(error.data, error.error, error.cause, error.response)
  }

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
