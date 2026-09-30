import type { ComputedRef } from 'vue'
import type { CimiOrpc } from '~/plugins/orpc'

type GetRetentionPolicyCall = CimiOrpc['retentionPolicy']['getRetentionPolicy']['call']
type UpdateRetentionPolicyCall = CimiOrpc['retentionPolicy']['updateRetentionPolicy']['call']

export type RetentionResult = Awaited<ReturnType<GetRetentionPolicyCall>>
export type InstallationRetentionResult = Extract<RetentionResult, { scope: 'installation' }>
export type RetentionPolicy = InstallationRetentionResult['installationDefault']
export type RetentionField = keyof RetentionPolicy
export type RetentionCleanup = InstallationRetentionResult['cleanup']
export type RetentionCleanupStatus = RetentionCleanup['derived']['status']
export type RetentionCleanupErrorCode = RetentionCleanup['derived']['errorCode']
export type RetentionGetInput = Parameters<GetRetentionPolicyCall>[0]
export type InstallationRetentionGetInput = Extract<RetentionGetInput, { scope: 'installation' }>
export type RetentionUpdateInput = Parameters<UpdateRetentionPolicyCall>[0]
export type InstallationRetentionUpdateInput = Extract<
  RetentionUpdateInput,
  { scope: 'installation' }
>
export type RetentionUpdateResult = Awaited<ReturnType<UpdateRetentionPolicyCall>>
export type InstallationRetentionUpdateResult = Extract<
  RetentionUpdateResult,
  { scope: 'installation' }
>
export type Installation = Awaited<
  ReturnType<CimiOrpc['installation']['getInstallationStatus']['call']>
>
export type InstallationOperation = NonNullable<Installation['activeOperation']>

export type RetentionDraft = {
  readonly eventMonths: string
  readonly profileMonths: string
  readonly replayMonths: string
}

export type RetentionValidation = {
  readonly fieldErrors: Readonly<Partial<Record<RetentionField, string>>>
  readonly formError: string | null
}

export type ParsedRetentionDraft =
  | { readonly kind: 'valid'; readonly policy: RetentionPolicy }
  | { readonly kind: 'invalid'; readonly validation: RetentionValidation }

export type RetentionFailure =
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
      readonly action: 'setup' | 'refresh'
    }
  | {
      readonly kind: 'bad-request'
      readonly code: 'BAD_REQUEST'
      readonly httpStatus: 400
      readonly message: string
      readonly action: 'edit'
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
      readonly kind: 'stale-confirmation'
      readonly code: 'STALE_CONFIRMATION'
      readonly httpStatus: undefined
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

export type RetentionResource =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly result: InstallationRetentionResult
      readonly refreshing: boolean
    }
  | {
      readonly kind: 'stale'
      readonly result: InstallationRetentionResult
      readonly error: RetentionFailure
      readonly refreshing: boolean
    }
  | { readonly kind: 'failed'; readonly error: RetentionFailure }

export type InstallationResource =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly installation: Installation
      readonly refreshing: boolean
    }
  | {
      readonly kind: 'stale'
      readonly installation: Installation
      readonly error: RetentionFailure
      readonly refreshing: boolean
    }
  | { readonly kind: 'failed'; readonly error: RetentionFailure }

export type RetentionLockView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unknown'; readonly message: string }
  | {
      readonly kind: 'held'
      readonly operationKind: InstallationOperation['kind']
      readonly operationLabel: string
    }
  | { readonly kind: 'cleanup-pending'; readonly message: string }
  | { readonly kind: 'not-ready'; readonly message: string }
  | { readonly kind: 'available' }

export type ShorteningImpact = {
  readonly event: { readonly from: number; readonly to: number } | null
  readonly profile: { readonly from: number; readonly to: number } | null
  readonly replay: { readonly from: number | null; readonly to: number | null } | null
}

export type ConfirmationState =
  | { readonly kind: 'required'; readonly value: string; readonly error: string | null }
  | { readonly kind: 'accepted'; readonly value: 'SHORTEN RETENTION' }

export type RetentionCommand =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'confirming'
      readonly baselineUpdatedAt: InstallationRetentionResult['updatedAt']
      readonly current: RetentionPolicy
      readonly candidate: RetentionPolicy
      readonly impact: ShorteningImpact
      readonly acknowledgement: ConfirmationState
    }
  | {
      readonly kind: 'submitting'
      readonly baselineUpdatedAt: InstallationRetentionResult['updatedAt']
      readonly current: RetentionPolicy
      readonly candidate: RetentionPolicy
      readonly shortening: boolean
    }
  | {
      readonly kind: 'failed'
      readonly candidate: RetentionPolicy
      readonly shortening: boolean
      readonly error: RetentionFailure
    }

export type RetentionNotice = {
  readonly kind: 'committed'
  readonly message: string
}

export type RetentionState = {
  readonly retention: RetentionResource
  readonly installation: InstallationResource
  readonly draft: RetentionDraft | null
  readonly command: RetentionCommand
  readonly notice: RetentionNotice | null
}

export type RetentionAction =
  | { readonly kind: 'refresh-started' }
  | { readonly kind: 'retention-received'; readonly result: InstallationRetentionResult }
  | { readonly kind: 'installation-received'; readonly installation: Installation }
  | { readonly kind: 'retention-failed'; readonly error: RetentionFailure }
  | { readonly kind: 'installation-failed'; readonly error: RetentionFailure }
  | { readonly kind: 'field-edited'; readonly field: RetentionField; readonly value: string }
  | {
      readonly kind: 'save-requested'
      readonly candidate: RetentionPolicy
      readonly impact: ShorteningImpact
    }
  | { readonly kind: 'save-cancelled' }
  | { readonly kind: 'confirmation-edited'; readonly value: string }
  | {
      readonly kind: 'save-started'
      readonly baselineUpdatedAt: InstallationRetentionResult['updatedAt']
      readonly candidate: RetentionPolicy
      readonly shortening: boolean
    }
  | { readonly kind: 'save-succeeded'; readonly result: InstallationRetentionResult }
  | {
      readonly kind: 'save-failed'
      readonly candidate: RetentionPolicy
      readonly shortening: boolean
      readonly error: RetentionFailure
    }

export type RetentionCleanupStageView = {
  readonly kind: 'derived' | 'backup'
  readonly label: 'Derived cleanup' | 'Historical backup cleanup'
  readonly status: RetentionCleanupStatus
  readonly statusLabel: string
  readonly startedAt: RetentionCleanup['derived']['startedAt']
  readonly completedAt: RetentionCleanup['derived']['completedAt']
  readonly blockedByDerivedCleanup: boolean
  readonly errorMessage: string | null
}

export type RetentionCleanupView = {
  readonly pending: RetentionCleanup['pending']
  readonly stages: readonly [RetentionCleanupStageView, RetentionCleanupStageView]
}

export type RetentionPolicyEditorView = {
  readonly draft: RetentionDraft
  readonly current: RetentionPolicy
  readonly effective: InstallationRetentionResult['effectivePolicy']
  readonly validation: ParsedRetentionDraft
  readonly dirty: boolean
  readonly saving: boolean
  readonly canAttemptSubmit: boolean
  readonly canSubmit: boolean
  readonly disabledReason: string | null
  readonly serverError: RetentionFailure | null
  readonly updatedAt: InstallationRetentionResult['updatedAt']
}

export type RetentionAdminViewModel =
  | { readonly kind: 'loading'; readonly message: string }
  | {
      readonly kind: 'access-error'
      readonly error: Extract<RetentionFailure, { kind: 'authentication' | 'forbidden' }>
    }
  | { readonly kind: 'not-initialized'; readonly message: string }
  | { readonly kind: 'error'; readonly error: RetentionFailure }
  | {
      readonly kind: 'ready'
      readonly result: InstallationRetentionResult
      readonly policy: RetentionPolicyEditorView
      readonly cleanup: RetentionCleanupView
      readonly lock: RetentionLockView
      readonly command: RetentionCommand
      readonly stale: boolean
      readonly retentionError: RetentionFailure | null
      readonly notice: RetentionNotice | null
      readonly refreshing: boolean
      readonly announcement: string
    }

export type RetentionController = {
  readonly view: Readonly<ComputedRef<RetentionAdminViewModel>>
  refresh(): Promise<void>
  edit(field: RetentionField, value: string): void
  submit(policy: RetentionPolicy): Promise<void>
  cancelConfirmation(): void
  confirmShortening(confirmation: string): Promise<void>
}
