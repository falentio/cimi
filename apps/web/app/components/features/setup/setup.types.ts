import type { ComputedRef } from 'vue'
import type { CimiOrpc } from '~/plugins/orpc'

export type Installation = Awaited<
  ReturnType<CimiOrpc['installation']['getInstallationStatus']['call']>
>
export type Health = Awaited<ReturnType<CimiOrpc['health']['health']['call']>>
export type InitializeResponse = Awaited<
  ReturnType<CimiOrpc['installation']['initializeInstallation']['call']>
>

export type SetupInstallation = Pick<
  Installation,
  | 'status'
  | 'dataDirectoryReady'
  | 'activeOperation'
  | 'cleanupPending'
  | 'derivedCleanup'
  | 'backupCleanup'
  | 'updatedAt'
>

export type SetupHealth = Pick<
  Health,
  'status' | 'controlStore' | 'analyticsStore' | 'cleanupPending' | 'version' | 'checkedAt'
>

export type SetupOperation = NonNullable<SetupInstallation['activeOperation']>
export type InitializedInstallation = Omit<SetupInstallation, 'status'> & {
  status: Exclude<SetupInstallation['status'], 'uninitialized'>
}

export type SetupFailure =
  | {
      readonly kind: 'authentication-required'
      readonly code: 'UNAUTHORIZED'
      readonly httpStatus: 401
      readonly message: 'Sign in as an installation administrator to continue.'
      readonly action: 'sign-in'
    }
  | {
      readonly kind: 'admin-required'
      readonly code: 'FORBIDDEN'
      readonly httpStatus: 403
      readonly message: 'Your account is not an installation administrator.'
      readonly action: 'contact-admin'
    }
  | {
      readonly kind: 'conflict'
      readonly code: 'CONFLICT'
      readonly httpStatus: 409
      readonly message: 'The installation is busy with another lifecycle operation. Refresh and try again.'
      readonly action: 'refresh'
    }
  | {
      readonly kind: 'upgrade-rejected'
      readonly code: 'INCOMPATIBLE_BACKUP' | 'INSUFFICIENT_STORAGE'
      readonly httpStatus: 422 | 507
      readonly message: string
      readonly action: 'resolve-and-retry'
    }
  | {
      readonly kind: 'retryable'
      readonly code: string | undefined
      readonly httpStatus: number | undefined
      readonly message: string
      readonly action: 'retry'
    }
  | {
      readonly kind: 'confirmation-required'
      readonly message: 'Type UPGRADE exactly to start an installation upgrade.'
      readonly action: 'edit-confirmation'
    }

export type InstallationResource =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly installation: SetupInstallation }
  | { readonly kind: 'refreshing'; readonly installation: SetupInstallation }
  | {
      readonly kind: 'stale-failure'
      readonly installation: SetupInstallation
      readonly error: SetupFailure
    }
  | { readonly kind: 'not-found'; readonly httpStatus: 404 }
  | { readonly kind: 'unauthorized'; readonly httpStatus: 401 }
  | { readonly kind: 'forbidden'; readonly httpStatus: 403 }
  | { readonly kind: 'failure'; readonly error: SetupFailure }

export type HealthResource =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly health: SetupHealth }
  | { readonly kind: 'refreshing'; readonly health: SetupHealth }
  | {
      readonly kind: 'stale-failure'
      readonly health: SetupHealth
      readonly error: SetupFailure
    }
  | { readonly kind: 'failure'; readonly error: SetupFailure }

export type HealthView =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'report'
      readonly report: SetupHealth
      readonly title: string
      readonly description: string
      readonly action: 'none' | 'refresh'
    }
  | {
      readonly kind: 'stale-report'
      readonly report: SetupHealth
      readonly error: SetupFailure
      readonly title: string
      readonly description: string
      readonly action: 'refresh'
    }
  | { readonly kind: 'failure'; readonly error: SetupFailure }

export type InitializationOutcome =
  | {
      readonly kind: 'created'
      readonly httpStatus: 201
      readonly installation: SetupInstallation
    }
  | {
      readonly kind: 'reused'
      readonly httpStatus: 200
      readonly installation: SetupInstallation
    }

export type InitializationView =
  | { readonly kind: 'available' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'success'; readonly outcome: InitializationOutcome }
  | { readonly kind: 'failure'; readonly error: SetupFailure }

export const MAX_POLL_ATTEMPTS = 20 as const

export type PollingView =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'active'
      readonly attempt: number
      readonly maxAttempts: typeof MAX_POLL_ATTEMPTS
    }
  | {
      readonly kind: 'exhausted'
      readonly attempts: typeof MAX_POLL_ATTEMPTS
      readonly maxAttempts: typeof MAX_POLL_ATTEMPTS
    }

export type LifecycleView =
  | {
      readonly kind: 'idle'
      readonly installationStatus: InitializedInstallation['status']
    }
  | {
      readonly kind: 'running'
      readonly operation: SetupOperation
      readonly polling: PollingView
    }
  | {
      readonly kind: 'failed'
      readonly operation: SetupOperation
    }

export type UpgradeView =
  | { readonly kind: 'available' }
  | { readonly kind: 'blocked'; readonly reason: 'operation-active' | 'installation-not-ready' }
  | { readonly kind: 'confirming' }
  | { readonly kind: 'confirmation-required'; readonly error: SetupFailure }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'polling' }
  | { readonly kind: 'completed' }
  | { readonly kind: 'failure'; readonly error: SetupFailure }

export type SetupNotice =
  | {
      readonly kind: 'initialized'
      readonly httpStatus: 201
      readonly message: 'Installation initialized.'
    }
  | {
      readonly kind: 'reused'
      readonly httpStatus: 200
      readonly message: 'Existing installation reused; no data was overwritten.'
    }

export type SetupViewModel =
  | {
      readonly kind: 'loading'
      readonly installation: Extract<InstallationResource, { kind: 'loading' }>
      readonly health: HealthView
    }
  | {
      readonly kind: 'auth-required'
      readonly installation: Extract<InstallationResource, { kind: 'unauthorized' }>
      readonly health: HealthView
    }
  | {
      readonly kind: 'admin-required'
      readonly installation: Extract<InstallationResource, { kind: 'forbidden' }>
      readonly health: HealthView
    }
  | {
      readonly kind: 'not-initialized'
      readonly installation:
        | Extract<InstallationResource, { kind: 'not-found' }>
        | {
            readonly kind: 'known-uninitialized'
            readonly installation: SetupInstallation & { status: 'uninitialized' }
          }
      readonly health: HealthView
      readonly initialization: InitializationView
    }
  | {
      readonly kind: 'installation-failure'
      readonly installation: Extract<InstallationResource, { kind: 'failure' | 'stale-failure' }>
      readonly health: HealthView
    }
  | {
      readonly kind: 'operational'
      readonly installation:
        | { readonly kind: 'ready'; readonly installation: InitializedInstallation }
        | { readonly kind: 'refreshing'; readonly installation: InitializedInstallation }
        | {
            readonly kind: 'stale-failure'
            readonly installation: InitializedInstallation
            readonly error: SetupFailure
          }
      readonly health: HealthView
      readonly lifecycle: LifecycleView
      readonly upgrade: UpgradeView
      readonly notice: SetupNotice | undefined
    }

export interface QuerySnapshot<T> {
  readonly data: T | undefined
  readonly error: unknown
  readonly isLoading: boolean
}

export interface DeriveSetupViewInput {
  readonly installation: InstallationResource
  readonly health: HealthResource
  readonly initialization: InitializationView
  readonly upgrade: UpgradeView
  readonly polling: PollingView
  readonly notice: SetupNotice | undefined
}

export interface SetupController {
  readonly view: Readonly<ComputedRef<SetupViewModel>>
  refresh(): Promise<void>
  initialize(): Promise<InitializationOutcome>
  beginUpgrade(): void
  cancelUpgrade(): void
  submitUpgrade(confirmation: string): Promise<void>
}
