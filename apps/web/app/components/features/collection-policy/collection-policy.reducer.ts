import type {
  CollectionDraft,
  CollectionFieldPatch,
  CollectionPolicyAction,
  CollectionPolicyResult,
  CollectionPolicyState,
  PolicyField,
  PolicyValues,
} from './collection-policy.types'
import {
  collectionBaseline,
  draftFromPolicy,
  isCollectionDraftDirty,
  policyValuesFromEffective,
} from './collection-policy.utils'

const POLICY_FIELD_ORDER: readonly PolicyField[] = [
  'anonymousCollection',
  'honorGpcDnt',
  'consentMode',
  'botPolicy',
  'captureQueryStrings',
  'urlPolicy',
  'propertyPolicy',
  'profileFilterKeys',
  'exclusions',
]

export function createInitialCollectionPolicyState(): CollectionPolicyState {
  return {
    policy: { kind: 'loading' },
    draft: null,
    editing: false,
    command: { kind: 'idle' },
    notice: null,
  }
}

export function reduceCollectionPolicy(
  state: CollectionPolicyState,
  action: CollectionPolicyAction,
): CollectionPolicyState {
  switch (action.kind) {
    case 'refresh-started':
      return { ...state, policy: beginRefresh(state.policy), notice: null }
    case 'policy-received':
      return adoptResult(state, action.result)
    case 'policy-failed':
      return {
        ...state,
        policy:
          state.policy.kind === 'ready' || state.policy.kind === 'stale'
            ? {
                kind: 'stale',
                result: state.policy.result,
                error: action.error,
                refreshing: false,
              }
            : { kind: 'failed', error: action.error },
      }
    case 'edit-begun': {
      const result = getResult(state)
      if (result === null || state.command.kind === 'submitting') return state
      return { ...state, editing: true, draft: draftFromPolicy(collectionBaseline(result)) }
    }
    case 'edit-cancelled': {
      const result = getResult(state)
      if (result === null || state.command.kind === 'submitting') return state
      return { ...state, editing: false, draft: draftFromPolicy(collectionBaseline(result)) }
    }
    case 'field-edited':
      if (state.draft === null) return state
      return { ...state, draft: applyPatch(state.draft, action.patch) }
    case 'submit-started':
      return {
        ...state,
        command: { kind: 'submitting', operation: action.operation },
        notice: null,
      }
    case 'submit-succeeded':
      return adoptCommittedLayer(state, action.operation, action.layer)
    case 'submit-failed':
      return {
        ...state,
        command: { kind: 'failed', operation: action.operation, error: action.error },
      }
    case 'refresh-warning':
      return {
        ...state,
        policy:
          state.policy.kind === 'ready' || state.policy.kind === 'stale'
            ? { ...state.policy, refreshing: false }
            : state.policy,
        notice: state.notice === null ? null : { ...state.notice, warning: action.error },
      }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

function applyPatch(draft: CollectionDraft, patch: CollectionFieldPatch): CollectionDraft {
  switch (patch.field) {
    case 'anonymousCollection':
      return { ...draft, anonymousCollection: patch.value }
    case 'honorGpcDnt':
      return { ...draft, honorGpcDnt: patch.value }
    case 'consentMode':
      return { ...draft, consentMode: patch.value }
    case 'botPolicy':
      return { ...draft, botPolicy: patch.value }
    case 'captureQueryStrings':
      return { ...draft, captureQueryStrings: patch.value }
    case 'urlPolicy':
      return { ...draft, urlPolicy: patch.value }
    case 'propertyPolicy':
      return { ...draft, propertyPolicy: patch.value }
    case 'profileFilterKeys':
      return { ...draft, profileFilterKeys: patch.value }
    case 'exclusions':
      return { ...draft, exclusions: patch.value }
    default: {
      const _exhaustive: never = patch
      return _exhaustive
    }
  }
}

function adoptResult(
  state: CollectionPolicyState,
  result: CollectionPolicyResult,
): CollectionPolicyState {
  const previous = getResult(state)
  const keepDraft =
    state.draft !== null &&
    previous !== null &&
    isCollectionDraftDirty(collectionBaseline(previous), state.draft)
  return {
    ...state,
    policy: { kind: 'ready', result, refreshing: false },
    draft: keepDraft ? state.draft : draftFromPolicy(collectionBaseline(result)),
    command: state.command.kind === 'failed' ? { kind: 'idle' } : state.command,
  }
}

/**
 * The write response is only the layer, so the committed layer is projected onto
 * the previous result immediately and the follow-up refresh confirms it.
 */
function adoptCommittedLayer(
  state: CollectionPolicyState,
  operation: 'save' | 'clear',
  layer: PolicyValues,
): CollectionPolicyState {
  const previous = getResult(state)
  if (previous === null) return state

  const result: CollectionPolicyResult =
    operation === 'clear'
      ? {
          installationDefault: previous.installationDefault,
          siteOverride: null,
          effective: {
            ...previous.effective,
            ...policyValuesFromEffective(previous.installationDefault),
          },
          source: provenanceFor('installation'),
        }
      : {
          installationDefault: previous.installationDefault,
          siteOverride: { ...previous.effective, ...layer },
          effective: { ...previous.effective, ...layer },
          source: provenanceFor('site'),
        }

  return {
    ...state,
    policy: { kind: 'ready', result, refreshing: false },
    draft: draftFromPolicy(collectionBaseline(result)),
    editing: false,
    command: { kind: 'idle' },
    notice: {
      kind: operation === 'save' ? 'committed' : 'cleared',
      message:
        operation === 'save'
          ? 'The Site collection override was saved and applies to this Site only.'
          : 'The Site collection override was cleared, so this Site inherits the installation default again.',
      warning: null,
    },
  }
}

function provenanceFor(source: 'installation' | 'site'): CollectionPolicyResult['source'] {
  const entries = POLICY_FIELD_ORDER.map((field) => [field, source] as const)
  return Object.fromEntries(entries) as CollectionPolicyResult['source']
}

function getResult(state: CollectionPolicyState): CollectionPolicyResult | null {
  return state.policy.kind === 'ready' || state.policy.kind === 'stale' ? state.policy.result : null
}

function beginRefresh(policy: CollectionPolicyState['policy']): CollectionPolicyState['policy'] {
  if (policy.kind === 'ready') return { ...policy, refreshing: true }
  if (policy.kind === 'stale') return { ...policy, refreshing: true }
  return policy
}
