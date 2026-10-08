import { isNumberValue, isStringValue } from '../../../utils/type-guards'
import type {
  PublicDashboardConfig,
  PublicDashboardConfiguration,
  PublicDashboardFailure,
  PublicDashboardNotice,
  PublicDashboardOperation,
  PublicDashboardOperationCopy,
  PublicDashboardState,
  PublicDashboardStatus,
  SitePublicDashboardViewModel,
} from './public-dashboard.types'

export const PUBLIC_DASHBOARD_SCOPE_FACTS = [
  {
    label: 'Aggregate only',
    detail:
      'The public view returns approved aggregate metrics and dimensions. It never returns raw events, sessions, profiles, replay, search-console data, or exports.',
  },
  {
    label: 'Hourly, up to 90 days',
    detail:
      'Every bucket covers one hour. The longest range is 90 days, further limited by this Site retention setting.',
  },
  {
    label: 'Suppression at k=5',
    detail:
      'A cohort of fewer than five distinct visitors is omitted from the total and from each identity segment. A suppressed row carries no value and no reason.',
  },
  {
    label: 'Search engines excluded',
    detail:
      'The public page sends noindex, nofollow and stays out of the sitemap. A shared link can still be copied by anyone who opens it.',
  },
  {
    label: 'Rate limited',
    detail:
      'The public query allows 360 requests per Site per minute and 600 requests per IP per minute. Past either limit the server returns 429 with Retry-After.',
  },
] as const satisfies ReadonlyArray<{ readonly label: string; readonly detail: string }>

export const PUBLIC_DASHBOARD_LIFECYCLE_FACTS = [
  {
    label: 'Deleting, deleted, recovering, or purged',
    detail:
      'While the Site is in one of these states, every public request fails with NOT_FOUND. Deletion suspends public access without rotating the identifier.',
  },
  {
    label: 'Recovery',
    detail:
      'Recovering the Site restores its previous public configuration and identifier. Disabling the dashboard stays a separate, explicit action.',
  },
] as const satisfies ReadonlyArray<{ readonly label: string; readonly detail: string }>

export const PUBLIC_DASHBOARD_OPERATION_COPY: Readonly<
  Record<PublicDashboardOperation, PublicDashboardOperationCopy>
> = {
  enable: {
    title: 'Enable the public dashboard?',
    description:
      'Enabling issues a new identifier and revokes any identifier issued before it. The old public URL stops resolving at once. The identifier is a shareable capability, not a secret, so anyone who has it can read the aggregate view.',
    confirmLabel: 'Enable and issue a new identifier',
  },
  disable: {
    title: 'Disable the public dashboard?',
    description:
      'Disabling revokes the current identifier and the server stops authorizing new public requests at the committed cutoff. It cannot delete a response a browser, proxy, or person already copied.',
    confirmLabel: 'Disable public access',
  },
  rotate: {
    title: 'Rotate the public identifier?',
    description:
      'Rotation revokes the current identifier and issues one new identifier while public access stays enabled. It revokes the old capability. It is not a password reset, and it cannot recall copies already taken.',
    confirmLabel: 'Rotate identifier',
  },
}

const STATUS_LABELS: Readonly<Record<PublicDashboardStatus, string>> = {
  unconfigured: 'Not configured',
  disabled: 'Disabled',
  enabled: 'Enabled',
}

export function publicDashboardStatusLabel(status: PublicDashboardStatus): string {
  return STATUS_LABELS[status]
}

export function publicDashboardStatus(
  configuration: PublicDashboardConfiguration,
): PublicDashboardStatus {
  if (configuration.kind === 'unconfigured') return 'unconfigured'

  if (!configuration.config.enabled || configuration.config.publicDashboardIdentifier === null) {
    return 'disabled'
  }

  return 'enabled'
}

export function publicDashboardConfig(
  configuration: PublicDashboardConfiguration,
): PublicDashboardConfig | null {
  return configuration.kind === 'configured' ? configuration.config : null
}

export function publicDashboardPath(identifier: string): string {
  return `/public/${identifier}`
}

export function publicDashboardUrl(origin: string, identifier: string): string {
  return `${origin}${publicDashboardPath(identifier)}`
}

export function formatPublicDashboardDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

export function publicDashboardOperations(
  status: PublicDashboardStatus,
): readonly PublicDashboardOperation[] {
  return status === 'enabled' ? ['rotate', 'disable'] : ['enable']
}

export function normalizePublicDashboardError(
  cause: unknown,
  source: 'read' | 'operation',
): PublicDashboardFailure {
  const details = readErrorDetails(cause)

  if (details.code === 'UNAUTHORIZED' || details.status === 401) {
    return {
      kind: 'authentication',
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      message: 'Sign in as a Site administrator to manage the public dashboard.',
      action: 'sign-in',
    }
  }

  if (details.code === 'FORBIDDEN' || details.status === 403) {
    return {
      kind: 'forbidden',
      code: 'FORBIDDEN',
      httpStatus: 403,
      message: 'Your account cannot manage the public dashboard for this Site.',
      action: 'contact-admin',
    }
  }

  if (details.code === 'NOT_FOUND' || details.status === 404) {
    return {
      kind: 'not-found',
      code: 'NOT_FOUND',
      httpStatus: 404,
      message:
        source === 'read'
          ? 'The public dashboard settings are not available for this Site. Refresh or choose another Site.'
          : 'This Site is not active, so the public dashboard did not change. Refresh to read its current state.',
      action: 'refresh',
    }
  }

  if (details.code === 'CONFLICT' || details.status === 409) {
    return {
      kind: 'conflict',
      code: 'CONFLICT',
      httpStatus: 409,
      message: 'This Site is not active, or another operation is running. Refresh before retrying.',
      action: 'refresh',
    }
  }

  if (details.code === 'INTERNAL_SERVER_ERROR' || details.status === 500) {
    return {
      kind: 'server',
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
      message:
        source === 'read'
          ? 'The public dashboard settings could not be loaded. Refresh and try again.'
          : 'The public dashboard change could not be completed safely. Refresh and try again.',
      action: 'refresh',
    }
  }

  return {
    kind: 'retryable',
    code: details.code,
    httpStatus: details.status,
    message:
      source === 'read'
        ? 'The public dashboard settings could not be loaded. Refresh and try again.'
        : 'The public dashboard change could not be completed. Refresh and try again.',
    action: source === 'read' ? 'refresh' : 'retry',
  }
}

export function publicDashboardNotice(
  operation: PublicDashboardOperation,
  warning: PublicDashboardFailure | null,
): PublicDashboardNotice {
  const message =
    operation === 'enable'
      ? 'The public dashboard is enabled and a new identifier was issued. Any identifier issued earlier no longer resolves.'
      : operation === 'disable'
        ? 'The public dashboard is disabled and its identifier was revoked. The server authorizes no new public request.'
        : 'A new identifier was issued. The previous public URL no longer resolves.'

  return { operation, message, warning }
}

export function toPublicDashboardView(state: PublicDashboardState): SitePublicDashboardViewModel {
  if (state.config.kind === 'loading') {
    return { kind: 'loading', message: 'Loading public dashboard settings.' }
  }

  if (state.config.kind === 'failed') {
    if (state.config.error.kind === 'authentication' || state.config.error.kind === 'forbidden') {
      return { kind: 'access-error', error: state.config.error }
    }

    return { kind: 'error', error: state.config.error }
  }

  const configuration = state.config.configuration
  const status = publicDashboardStatus(configuration)

  return {
    kind: 'ready',
    status,
    config: publicDashboardConfig(configuration),
    operations: publicDashboardOperations(status),
    command: state.command,
    notice: state.notice,
    stale: state.config.kind === 'stale',
    configError: state.config.kind === 'stale' ? state.config.error : null,
    refreshing: state.config.kind === 'ready' ? state.config.refreshing : false,
    busy: state.command.kind === 'submitting',
    announcement: buildAnnouncement(state),
  }
}

function buildAnnouncement(state: PublicDashboardState): string {
  if (state.notice !== null) return state.notice.message

  if (state.command.kind === 'submitting') {
    return `Public dashboard ${state.command.operation} in progress.`
  }

  if (state.command.kind === 'failed') return state.command.error.message

  if (state.config.kind === 'stale') return state.config.error.message

  return ''
}

interface ErrorDetails {
  readonly code?: unknown
  readonly status?: unknown
  readonly statusCode?: unknown
  readonly data?: unknown
  readonly error?: unknown
  readonly cause?: unknown
  readonly response?: unknown
}

function readErrorDetails(cause: unknown) {
  const candidates: unknown[] = [cause]

  if (isRecord(cause)) candidates.push(cause.data, cause.error, cause.cause, cause.response)

  let code: string | undefined
  let status: number | undefined

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue

    if (code === undefined && isStringValue(candidate.code)) code = candidate.code

    if (status === undefined && isNumberValue(candidate.status)) status = candidate.status

    if (status === undefined && isNumberValue(candidate.statusCode)) status = candidate.statusCode
  }

  return { code, status }
}

function isRecord(value: unknown): value is ErrorDetails {
  return typeof value === 'object' && value !== null
}
