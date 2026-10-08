import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type {
  ConfirmationState,
  ParsedRetentionDraft,
  RetentionCleanupView,
  RetentionDraft,
  RetentionFailure,
  RetentionField,
  RetentionNotice,
  RetentionPolicy,
  RetentionProposal,
  ShorteningImpact,
  SiteRetentionResult,
} from './retention-policy.types'
import type { SiteId } from '../site-settings/site-settings.types'
import type { SiteRetentionClient } from './retention-policy.types'

export type { SiteRetentionResult } from './retention-policy.types'

export type SiteRetentionProvenance = 'site-override' | 'installation-default'

export type SiteRetentionBaseline = Pick<
  SiteRetentionResult,
  'updatedAt' | 'effectivePolicy' | 'installationDefault'
>

export type SiteRetentionResource =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly result: SiteRetentionResult; readonly refreshing: boolean }
  | {
      readonly kind: 'stale'
      readonly result: SiteRetentionResult
      readonly error: RetentionFailure
      readonly refreshing: boolean
    }
  | { readonly kind: 'failed'; readonly error: RetentionFailure }

export type SiteRetentionCommand =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'confirming'
      readonly baseline: SiteRetentionBaseline
      readonly current: RetentionPolicy
      readonly proposal: RetentionProposal
      readonly impact: ShorteningImpact
      readonly acknowledgement: ConfirmationState
    }
  | {
      readonly kind: 'submitting'
      readonly baseline: SiteRetentionBaseline
      readonly current: RetentionPolicy
      readonly proposal: RetentionProposal
      readonly shortening: boolean
    }
  | {
      readonly kind: 'failed'
      readonly proposal: RetentionProposal
      readonly shortening: boolean
      readonly error: RetentionFailure
    }

export type SiteRetentionState = {
  readonly retention: SiteRetentionResource
  readonly draft: RetentionDraft | null
  readonly command: SiteRetentionCommand
  readonly notice: RetentionNotice | null
}

export type SiteRetentionAction =
  | { readonly kind: 'refresh-started' }
  | { readonly kind: 'retention-received'; readonly result: SiteRetentionResult }
  | { readonly kind: 'retention-failed'; readonly error: RetentionFailure }
  | { readonly kind: 'field-edited'; readonly field: RetentionField; readonly value: string }
  | {
      readonly kind: 'save-requested'
      readonly proposal: RetentionProposal
      readonly impact: ShorteningImpact
    }
  | { readonly kind: 'save-cancelled' }
  | { readonly kind: 'confirmation-edited'; readonly value: string }
  | {
      readonly kind: 'save-started'
      readonly baseline: SiteRetentionBaseline
      readonly proposal: RetentionProposal
      readonly shortening: boolean
    }
  | {
      readonly kind: 'save-succeeded'
      readonly result: SiteRetentionResult
      readonly proposal: RetentionProposal
    }
  | {
      readonly kind: 'save-failed'
      readonly proposal: RetentionProposal
      readonly shortening: boolean
      readonly error: RetentionFailure
    }

export type SiteRetentionEditorView = {
  readonly draft: RetentionDraft
  readonly siteOverride: RetentionPolicy | null
  readonly installationDefault: RetentionPolicy
  readonly effective: RetentionPolicy
  readonly validation: ParsedRetentionDraft
  readonly dirty: boolean
  readonly shortening: boolean
  readonly saving: boolean
  readonly canAttemptSubmit: boolean
  readonly canSubmit: boolean
  readonly hasOverride: boolean
  readonly canClear: boolean
  readonly clearShortens: boolean
  readonly disabledReason: string | null
}

export type SiteRetentionViewModel =
  | { readonly kind: 'loading'; readonly message: string }
  | {
      readonly kind: 'access-error'
      readonly error: Extract<RetentionFailure, { kind: 'authentication' | 'forbidden' }>
    }
  | { readonly kind: 'error'; readonly error: RetentionFailure }
  | {
      readonly kind: 'ready'
      readonly result: SiteRetentionResult
      readonly policy: SiteRetentionEditorView
      readonly cleanup: RetentionCleanupView
      readonly provenance: SiteRetentionProvenance
      readonly command: SiteRetentionCommand
      readonly stale: boolean
      readonly retentionError: RetentionFailure | null
      readonly notice: RetentionNotice | null
      readonly refreshing: boolean
      readonly announcement: string
    }

export interface SiteRetentionOptions {
  readonly siteId: MaybeRefOrGetter<SiteId | undefined>
  readonly client?: SiteRetentionClient | undefined
}

export type SiteRetentionController = {
  readonly view: Readonly<ComputedRef<SiteRetentionViewModel>>
  refresh(): Promise<void>
  edit(field: RetentionField, value: string): void
  submit(policy: RetentionPolicy): Promise<void>
  clear(): Promise<void>
  cancelConfirmation(): void
  confirmShortening(confirmation: string): Promise<void>
}
