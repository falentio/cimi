import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { SiteId } from '@/components/features/site-settings/site-settings.types'
import type { CimiOrpc } from '~/plugins/orpc'

type GetConfigCall = CimiOrpc['publicDashboard']['getPublicDashboardConfig']['call']

type EnableCall = CimiOrpc['publicDashboard']['enablePublicDashboard']['call']

type DisableCall = CimiOrpc['publicDashboard']['disablePublicDashboard']['call']

type RotateCall = CimiOrpc['publicDashboard']['rotatePublicDashboardIdentifier']['call']

export interface PublicDashboardClient {
  readonly publicDashboard: {
    readonly getPublicDashboardConfig: { readonly call: GetConfigCall }
    readonly enablePublicDashboard: { readonly call: EnableCall }
    readonly disablePublicDashboard: { readonly call: DisableCall }
    readonly rotatePublicDashboardIdentifier: { readonly call: RotateCall }
  }
}

export type PublicDashboardConfig = Awaited<ReturnType<GetConfigCall>>

export type PublicDashboardOperation = 'enable' | 'disable' | 'rotate'

export type PublicDashboardStatus = 'unconfigured' | 'disabled' | 'enabled'

export type PublicDashboardFailure =
  | {
      readonly kind: 'authentication'
      readonly code: 'UNAUTHORIZED'
      readonly httpStatus: 401
      readonly message: string
      readonly action: 'sign-in'
    }
  | {
      readonly kind: 'forbidden'
      readonly code: 'FORBIDDEN'
      readonly httpStatus: 403
      readonly message: string
      readonly action: 'contact-admin'
    }
  | {
      readonly kind: 'not-found'
      readonly code: 'NOT_FOUND'
      readonly httpStatus: 404
      readonly message: string
      readonly action: 'refresh'
    }
  | {
      readonly kind: 'conflict'
      readonly code: 'CONFLICT'
      readonly httpStatus: 409
      readonly message: string
      readonly action: 'refresh'
    }
  | {
      readonly kind: 'server'
      readonly code: 'INTERNAL_SERVER_ERROR'
      readonly httpStatus: 500
      readonly message: string
      readonly action: 'refresh'
    }
  | {
      readonly kind: 'retryable'
      readonly code: string | undefined
      readonly httpStatus: number | undefined
      readonly message: string
      readonly action: 'refresh' | 'retry'
    }

/**
 * A null config is a Site with no stored public dashboard, which the server
 * reports as NOT_FOUND on read. The page treats that as "not configured yet"
 * rather than an error, because it is the only path to a first enable.
 */
export type PublicDashboardResource =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly config: PublicDashboardConfig | null
      readonly refreshing: boolean
    }
  | {
      readonly kind: 'stale'
      readonly config: PublicDashboardConfig | null
      readonly error: PublicDashboardFailure
      readonly refreshing: boolean
    }
  | { readonly kind: 'failed'; readonly error: PublicDashboardFailure }

export type PublicDashboardCommand =
  | { readonly kind: 'idle' }
  | { readonly kind: 'confirming'; readonly operation: PublicDashboardOperation }
  | { readonly kind: 'submitting'; readonly operation: PublicDashboardOperation }
  | {
      readonly kind: 'failed'
      readonly operation: PublicDashboardOperation
      readonly error: PublicDashboardFailure
    }

export type PublicDashboardNotice = {
  readonly operation: PublicDashboardOperation
  readonly message: string
  readonly warning: PublicDashboardFailure | null
}

export type PublicDashboardState = {
  readonly config: PublicDashboardResource
  readonly command: PublicDashboardCommand
  readonly notice: PublicDashboardNotice | null
}

export type PublicDashboardAction =
  | { readonly kind: 'refresh-started' }
  | { readonly kind: 'config-received'; readonly config: PublicDashboardConfig }
  | { readonly kind: 'config-absent' }
  | { readonly kind: 'config-failed'; readonly error: PublicDashboardFailure }
  | { readonly kind: 'operation-requested'; readonly operation: PublicDashboardOperation }
  | { readonly kind: 'operation-cancelled' }
  | { readonly kind: 'operation-started'; readonly operation: PublicDashboardOperation }
  | {
      readonly kind: 'operation-succeeded'
      readonly operation: PublicDashboardOperation
      readonly config: PublicDashboardConfig | null
    }
  | {
      readonly kind: 'operation-failed'
      readonly operation: PublicDashboardOperation
      readonly error: PublicDashboardFailure
    }
  | { readonly kind: 'notice-warning'; readonly error: PublicDashboardFailure }

export type PublicDashboardOperationCopy = {
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
}

export type PublicDashboardReadyView = {
  readonly kind: 'ready'
  readonly status: PublicDashboardStatus
  readonly config: PublicDashboardConfig | null
  readonly operations: readonly PublicDashboardOperation[]
  readonly command: PublicDashboardCommand
  readonly notice: PublicDashboardNotice | null
  readonly stale: boolean
  readonly configError: PublicDashboardFailure | null
  readonly refreshing: boolean
  readonly busy: boolean
  readonly announcement: string
}

export type SitePublicDashboardViewModel =
  | { readonly kind: 'loading'; readonly message: string }
  | {
      readonly kind: 'access-error'
      readonly error: Extract<PublicDashboardFailure, { kind: 'authentication' | 'forbidden' }>
    }
  | { readonly kind: 'error'; readonly error: PublicDashboardFailure }
  | PublicDashboardReadyView

export interface SitePublicDashboardOptions {
  readonly siteId: MaybeRefOrGetter<SiteId | undefined>
  readonly client?: PublicDashboardClient | undefined
}

export interface SitePublicDashboardController {
  readonly view: Readonly<ComputedRef<SitePublicDashboardViewModel>>
  refresh(): Promise<void>
  request(operation: PublicDashboardOperation): void
  cancel(): void
  confirm(): Promise<void>
}
