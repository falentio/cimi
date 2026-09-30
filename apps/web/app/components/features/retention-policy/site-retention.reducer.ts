import type { SiteRetentionResult } from './retention-policy.types'
import {
  draftFromPolicy,
  isExactRetentionConfirmation,
  isRetentionDirty,
} from './retention-policy.utils'
import type {
  SiteRetentionAction,
  SiteRetentionBaseline,
  SiteRetentionResource,
  SiteRetentionState,
} from './site-retention.types'
import { siteRetentionNotice } from './site-retention.utils'

export function createInitialSiteRetentionState(): SiteRetentionState {
  return {
    retention: { kind: 'loading' },
    draft: null,
    command: { kind: 'idle' },
    notice: null,
  }
}

export function reduceSiteRetention(
  state: SiteRetentionState,
  action: SiteRetentionAction,
): SiteRetentionState {
  switch (action.kind) {
    case 'refresh-started':
      return {
        ...state,
        retention: beginRefresh(state.retention),
        notice: null,
      }
    case 'retention-received':
      return adoptResult(state, action.result)
    case 'retention-failed':
      return {
        ...state,
        retention:
          state.retention.kind === 'ready' || state.retention.kind === 'stale'
            ? {
                kind: 'stale',
                result: state.retention.result,
                error: action.error,
                refreshing: false,
              }
            : { kind: 'failed', error: action.error },
      }
    case 'field-edited':
      return {
        ...state,
        draft: {
          ...(state.draft ?? emptyDraft()),
          [action.field]: action.value,
        },
      }
    case 'save-requested': {
      const result = getResult(state)
      if (result === null) return state
      return {
        ...state,
        command: {
          kind: 'confirming',
          baseline: siteRetentionBaseline(result),
          current: result.effectivePolicy,
          proposal: action.proposal,
          impact: action.impact,
          acknowledgement: { kind: 'required', value: '', error: null },
        },
      }
    }
    case 'save-cancelled':
      return state.command.kind === 'confirming' ? { ...state, command: { kind: 'idle' } } : state
    case 'confirmation-edited':
      if (state.command.kind !== 'confirming') return state
      return {
        ...state,
        command: {
          ...state.command,
          acknowledgement: isExactRetentionConfirmation(action.value)
            ? { kind: 'accepted', value: action.value }
            : {
                kind: 'required',
                value: action.value,
                error: 'Type SHORTEN RETENTION exactly to apply a shortening.',
              },
        },
      }
    case 'save-started':
      return {
        ...state,
        command: {
          kind: 'submitting',
          baseline: action.baseline,
          current: action.baseline.effectivePolicy,
          proposal: action.proposal,
          shortening: action.shortening,
        },
        notice: null,
      }
    case 'save-succeeded':
      return {
        ...state,
        retention: { kind: 'ready', result: action.result, refreshing: false },
        draft: draftFromPolicy(action.result.effectivePolicy),
        command: { kind: 'idle' },
        notice: { kind: 'committed', message: siteRetentionNotice(action.proposal) },
      }
    case 'save-failed':
      return {
        ...state,
        command: {
          kind: 'failed',
          proposal: action.proposal,
          shortening: action.shortening,
          error: action.error,
        },
      }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

export function siteRetentionBaseline(result: SiteRetentionResult): SiteRetentionBaseline {
  return {
    updatedAt: result.updatedAt,
    effectivePolicy: result.effectivePolicy,
    installationDefault: result.installationDefault,
  }
}

function adoptResult(state: SiteRetentionState, result: SiteRetentionResult): SiteRetentionState {
  const previous = getResult(state)
  const draft =
    state.draft === null ||
    previous === null ||
    !isRetentionDirty(previous.effectivePolicy, state.draft)
      ? draftFromPolicy(result.effectivePolicy)
      : state.draft
  return {
    ...state,
    retention: { kind: 'ready', result, refreshing: false },
    draft,
    command: state.command.kind === 'failed' ? { kind: 'idle' } : state.command,
  }
}

function getResult(state: SiteRetentionState): SiteRetentionResult | null {
  return state.retention.kind === 'ready' || state.retention.kind === 'stale'
    ? state.retention.result
    : null
}

function beginRefresh(state: SiteRetentionResource): SiteRetentionResource {
  if (state.kind === 'ready' || state.kind === 'stale') return { ...state, refreshing: true }
  return state
}

function emptyDraft() {
  return { eventMonths: '', profileMonths: '', replayMonths: '' }
}
