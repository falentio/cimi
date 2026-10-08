import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { SiteId } from '@/components/features/site-settings/site-settings.types'
import type { CimiOrpc } from '~/plugins/orpc'

type GetCollectionPolicyCall = CimiOrpc['collectionPolicy']['getCollectionPolicy']['call']

type UpdateCollectionPolicyCall = CimiOrpc['collectionPolicy']['updateCollectionPolicy']['call']

export type CollectionPolicyResult = Awaited<ReturnType<GetCollectionPolicyCall>>

export type CollectionPolicyUpdateInput = Parameters<UpdateCollectionPolicyCall>[0]

export type PolicyField = keyof CollectionPolicyResult['source']

export type PolicyProvenance = CollectionPolicyResult['source'][PolicyField]

export type PolicyValues = Omit<CollectionPolicyResult['effective'], 'scope' | 'siteId'>

export type UrlPolicyValues = PolicyValues['urlPolicy']

export type EditablePropertyPolicy = Omit<
  PolicyValues['propertyPolicy'],
  'maxProperties' | 'maxValueLength'
> & {
  readonly maxProperties: number | null
  readonly maxValueLength: number | null
}

/**
 * The two bounded integers become `number | null` so an emptied input is a
 * validation error, not a `0`, which the contract itself would accept.
 */
export type EditableValue<K extends PolicyField> = K extends 'propertyPolicy'
  ? EditablePropertyPolicy
  : PolicyValues[K]

export type CollectionDraft = { readonly [K in PolicyField]: EditableValue<K> }

export type CollectionFieldPatch = {
  readonly [K in PolicyField]: { readonly field: K; readonly value: EditableValue<K> }
}[PolicyField]

export type CollectionOperation = 'save' | 'clear'

export type CollectionFieldKey =
  | PolicyField
  | 'urlPolicy.capturePath'
  | 'urlPolicy.captureReferrer'
  | 'urlPolicy.stripQueryStrings'
  | 'urlPolicy.stripSensitiveValues'
  | 'propertyPolicy.allowScalarProperties'
  | 'propertyPolicy.maxProperties'
  | 'propertyPolicy.maxValueLength'
  | 'propertyPolicy.reservedNames'
  | 'exclusions.hostnames'
  | 'exclusions.paths'
  | 'exclusions.countries'
  | 'exclusions.ipRanges'

export type CollectionValidation = {
  readonly fieldErrors: Readonly<Partial<Record<CollectionFieldKey, string>>>
}

export type ParsedCollectionDraft =
  | { readonly kind: 'valid'; readonly values: PolicyValues }
  | { readonly kind: 'invalid'; readonly validation: CollectionValidation }

export type CollectionPolicyFailure =
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
      readonly kind: 'retryable'
      readonly code: string | undefined
      readonly httpStatus: number | undefined
      readonly message: string
      readonly action: 'refresh' | 'retry'
    }

export type CollectionPolicyResource =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly result: CollectionPolicyResult
      readonly refreshing: boolean
    }
  | {
      readonly kind: 'stale'
      readonly result: CollectionPolicyResult
      readonly error: CollectionPolicyFailure
      readonly refreshing: boolean
    }
  | { readonly kind: 'failed'; readonly error: CollectionPolicyFailure }

export type CollectionCommand =
  | { readonly kind: 'idle' }
  | { readonly kind: 'submitting'; readonly operation: CollectionOperation }
  | {
      readonly kind: 'failed'
      readonly operation: CollectionOperation
      readonly error: CollectionPolicyFailure
    }

export type CollectionNotice = {
  readonly kind: 'committed' | 'cleared'
  readonly message: string
  readonly warning: CollectionPolicyFailure | null
}

export type CollectionPolicyState = {
  readonly policy: CollectionPolicyResource
  readonly draft: CollectionDraft | null
  readonly editing: boolean
  readonly command: CollectionCommand
  readonly notice: CollectionNotice | null
}

export type CollectionPolicyAction =
  | { readonly kind: 'refresh-started' }
  | { readonly kind: 'policy-received'; readonly result: CollectionPolicyResult }
  | { readonly kind: 'policy-failed'; readonly error: CollectionPolicyFailure }
  | { readonly kind: 'edit-begun' }
  | { readonly kind: 'edit-cancelled' }
  | { readonly kind: 'field-edited'; readonly patch: CollectionFieldPatch }
  | { readonly kind: 'submit-started'; readonly operation: CollectionOperation }
  | {
      readonly kind: 'submit-succeeded'
      readonly operation: CollectionOperation
      readonly layer: PolicyValues
    }
  | {
      readonly kind: 'submit-failed'
      readonly operation: CollectionOperation
      readonly error: CollectionPolicyFailure
    }
  | { readonly kind: 'refresh-warning'; readonly error: CollectionPolicyFailure }

export type CollectionExclusionSummary = {
  readonly label: string
  readonly count: number
}

export type CollectionPolicySummary = {
  readonly anonymousStance: string
  readonly signalRespect: string
  readonly consentStance: string
  readonly botStance: string
  readonly urlCapture: readonly string[]
  readonly propertyCapture: readonly string[]
  readonly exclusions: readonly CollectionExclusionSummary[]
}

export type CollectionPolicyChange = {
  readonly field: PolicyField
  readonly label: string
  readonly detail: string
}

export type CollectionPolicyEditorView = {
  readonly mode: 'view' | 'edit'
  readonly draft: CollectionDraft
  readonly effective: PolicyValues
  readonly source: CollectionPolicyResult['source']
  readonly hasOverride: boolean
  readonly validation: ParsedCollectionDraft
  readonly dirty: boolean
  readonly changes: readonly CollectionPolicyChange[]
  readonly summary: CollectionPolicySummary
  readonly saving: boolean
  readonly operation: CollectionOperation | null
  readonly canEdit: boolean
  readonly canSubmit: boolean
  readonly canClear: boolean
  readonly disabledReason: string | null
  readonly serverError: CollectionPolicyFailure | null
}

export type CollectionPolicyViewModel =
  | { readonly kind: 'loading'; readonly message: string }
  | {
      readonly kind: 'access-error'
      readonly error: Extract<CollectionPolicyFailure, { kind: 'authentication' | 'forbidden' }>
    }
  | { readonly kind: 'error'; readonly error: CollectionPolicyFailure }
  | {
      readonly kind: 'ready'
      readonly editor: CollectionPolicyEditorView
      readonly notice: CollectionNotice | null
      readonly stale: boolean
      readonly resourceError: CollectionPolicyFailure | null
      readonly refreshing: boolean
      readonly announcement: string
    }

export interface SiteCollectionPolicyOptions {
  readonly siteId: MaybeRefOrGetter<SiteId | undefined>
}

export interface SiteCollectionPolicyController {
  readonly view: Readonly<ComputedRef<CollectionPolicyViewModel>>
  refresh(): Promise<void>
  beginEdit(): void
  cancelEdit(): void
  edit(patch: CollectionFieldPatch): void
  save(): Promise<void>
  clearOverride(): Promise<void>
}
