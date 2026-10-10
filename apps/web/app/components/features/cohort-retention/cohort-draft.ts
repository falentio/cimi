import { schema as contractSchema } from '@cimi/contract'
import type {
  CohortActionDraft,
  CohortCompleteAction,
  CohortDraft,
  SCohort,
  SCohortAction,
  SCohortCreateInput,
  SCohortIdentityKind,
  SCohortPeriodCadence,
  SCohortUpdateInput,
} from './cohort-retention.types'

export type { CohortActionDraft, CohortCompleteAction, CohortDraft } from './cohort-retention.types'

export type CohortDraftProblem =
  | 'name-required'
  | 'name-duplicated'
  | 'entry-action-required'
  | 'retention-action-required'
  | 'action-name-required'
  | 'actions-identical'
  | 'identity-kind-invalid'
  | 'period-invalid'

export interface CohortDraftProblems {
  readonly form: CohortDraftProblem | null
  readonly fields: ReadonlySet<CohortDraftProblem>
}

export type CohortCompleteDraft = CohortDraft & {
  readonly entryAction: CohortCompleteAction
  readonly retentionAction: CohortCompleteAction
  readonly identityKind: SCohortIdentityKind
  readonly period: SCohortPeriodCadence
}

const CONTRACT_ACTION_KINDS = [
  'page_view',
  'custom_event',
  'outbound',
  'performance',
  'error',
] as const

const COMPLETE_ACTION_KINDS: ReadonlySet<string> = new Set(CONTRACT_ACTION_KINDS)

export function emptyCohortDraft(): CohortDraft {
  return {
    name: '',
    entryAction: { kind: 'page_view' },
    retentionAction: { kind: 'custom_event', name: '' },
    identityKind: 'visitor',
    period: 'week',
  }
}

export function cohortDraftFromDefinition(cohort: SCohort): CohortDraft {
  return {
    name: cohort.name,
    entryAction: toActionDraft(cohort.entryAction),
    retentionAction: toActionDraft(cohort.retentionAction),
    identityKind: cohort.identityKind,
    period: cohort.period,
  }
}

export function isCompleteCohortActionDraft(
  action: CohortActionDraft,
): action is CohortCompleteAction {
  // The contract leaves an outbound action's name optional, so a blank one is complete.
  if (action.kind === 'page_view' || action.kind === 'outbound') return true

  if (!COMPLETE_ACTION_KINDS.has(action.kind)) return false

  return action.name.trim() !== ''
}

/** Widens an outbound action with no name to the contract's optional-name form. */
export function toCohortAction(action: CohortCompleteAction): SCohortAction {
  if (action.kind === 'outbound' && action.name.trim() === '') return { kind: 'outbound' }

  return action
}

export function isCompleteCohortDraft(draft: CohortDraft): draft is CohortCompleteDraft {
  return (
    isCompleteCohortActionDraft(draft.entryAction) &&
    isCompleteCohortActionDraft(draft.retentionAction) &&
    isIdentityKind(draft.identityKind) &&
    isPeriodCadence(draft.period)
  )
}

/**
 * Mirrors the contract's rules in the order the contract checks them, and reuses
 * the contract's own action comparison instead of a second copy of it.
 */
export function validateCohortDraft(input: {
  draft: CohortDraft
  definitions: readonly SCohort[]
  editingId: string | undefined
}): CohortDraftProblems {
  const { draft } = input
  const fields = new Set<CohortDraftProblem>()

  if (draft.name.trim() === '') fields.add('name-required')

  if (!COMPLETE_ACTION_KINDS.has(draft.entryAction.kind)) fields.add('entry-action-required')

  if (!COMPLETE_ACTION_KINDS.has(draft.retentionAction.kind)) {
    fields.add('retention-action-required')
  }

  if (missingActionName(draft.entryAction) || missingActionName(draft.retentionAction)) {
    fields.add('action-name-required')
  }

  const trimmedName = draft.name.trim()

  if (
    trimmedName !== '' &&
    input.definitions.some(
      (definition) => definition.id !== input.editingId && definition.name === trimmedName,
    )
  ) {
    fields.add('name-duplicated')
  }

  if (!isIdentityKind(draft.identityKind)) fields.add('identity-kind-invalid')

  if (!isPeriodCadence(draft.period)) fields.add('period-invalid')

  const completeActions =
    isCompleteCohortActionDraft(draft.entryAction) &&
    isCompleteCohortActionDraft(draft.retentionAction)

  if (
    completeActions &&
    !contractSchema.areDistinctCohortActions({
      entryAction: toCohortAction(draft.entryAction),
      retentionAction: toCohortAction(draft.retentionAction),
    })
  ) {
    fields.add('actions-identical')
  }

  return { form: null, fields }
}

export function toCohortDefinitionFields(input: {
  draft: CohortDraft
  siteId: string
}): SCohortCreateInput {
  const { draft } = input

  if (!isCompleteCohortDraft(draft)) {
    throw new Error('Finish the cohort definition before saving it.')
  }

  return {
    siteId: input.siteId,
    name: draft.name.trim(),
    entryAction: toCohortAction(draft.entryAction),
    retentionAction: toCohortAction(draft.retentionAction),
    identityKind: draft.identityKind,
    period: draft.period,
  }
}

/** Full replace: every definition field is rebuilt from the draft, never merged. */
export function toCohortUpdateFields(input: {
  draft: CohortDraft
  siteId: string
  cohortId: string
}): SCohortUpdateInput {
  return { ...toCohortDefinitionFields(input), cohortId: input.cohortId }
}

function missingActionName(action: CohortActionDraft): boolean {
  if (action.kind === 'page_view' || action.kind === 'outbound') return false

  return action.name.trim() === ''
}

function isIdentityKind(value: string): value is SCohortIdentityKind {
  return value === 'visitor' || value === 'identified_user'
}

function isPeriodCadence(value: string): value is SCohortPeriodCadence {
  return value === 'day' || value === 'week' || value === 'month'
}

function toActionDraft(action: SCohortAction): CohortActionDraft {
  if (action.kind === 'outbound') return { kind: 'outbound', name: action.name ?? '' }

  return action
}
