import type {
  InstallationResource,
  InstallationRetentionResult,
  RetentionAction,
  RetentionResource,
  RetentionState,
} from './retention-policy.types'
import {
  draftFromPolicy,
  isExactRetentionConfirmation,
  isRetentionDirty,
} from './retention-policy.utils'

export function createInitialRetentionState(): RetentionState {
  return {
    retention: { kind: 'loading' },
    installation: { kind: 'loading' },
    draft: null,
    command: { kind: 'idle' },
    notice: null,
  }
}

export function reduceRetention(state: RetentionState, action: RetentionAction): RetentionState {
  switch (action.kind) {
    case 'refresh-started':
      return {
        ...state,
        retention: beginRetentionRefresh(state.retention),
        installation: beginInstallationRefresh(state.installation),
        notice: null,
      }
    case 'retention-received':
      return adoptRetentionResult(state, action.result)
    case 'installation-received':
      return {
        ...state,
        installation: {
          kind: 'ready',
          installation: action.installation,
          refreshing: false,
        },
      }
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
    case 'installation-failed':
      return {
        ...state,
        installation:
          state.installation.kind === 'ready' || state.installation.kind === 'stale'
            ? {
                kind: 'stale',
                installation: state.installation.installation,
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
      const current = getCurrentPolicy(state)
      if (current === null) return state
      return {
        ...state,
        command: {
          kind: 'confirming',
          baselineUpdatedAt: getUpdatedAt(state),
          current,
          candidate: action.candidate,
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
    case 'save-started': {
      const current = getCurrentPolicy(state)
      if (current === null) return state
      return {
        ...state,
        command: {
          kind: 'submitting',
          baselineUpdatedAt: action.baselineUpdatedAt,
          current,
          candidate: action.candidate,
          shortening: action.shortening,
        },
        notice: null,
      }
    }
    case 'save-succeeded':
      return {
        ...state,
        retention: { kind: 'ready', result: action.result, refreshing: false },
        draft: draftFromPolicy(action.result.installationDefault),
        command: { kind: 'idle' },
        notice: {
          kind: 'committed',
          message: 'Retention settings saved. Cleanup status below reflects the server response.',
        },
      }
    case 'save-failed':
      return {
        ...state,
        command: {
          kind: 'failed',
          candidate: action.candidate,
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

function adoptRetentionResult(
  state: RetentionState,
  result: InstallationRetentionResult,
): RetentionState {
  const previousResult = getRetentionResult(state)
  const draft =
    state.draft === null ||
    previousResult === null ||
    !isRetentionDirty(previousResult.installationDefault, state.draft)
      ? draftFromPolicy(result.installationDefault)
      : state.draft
  return {
    ...state,
    retention: { kind: 'ready', result, refreshing: false },
    draft,
    command: state.command.kind === 'failed' ? { kind: 'idle' } : state.command,
  }
}

function getRetentionResult(state: RetentionState): InstallationRetentionResult | null {
  return state.retention.kind === 'ready' || state.retention.kind === 'stale'
    ? state.retention.result
    : null
}

function getCurrentPolicy(state: RetentionState) {
  return getRetentionResult(state)?.installationDefault ?? null
}

function getUpdatedAt(state: RetentionState): InstallationRetentionResult['updatedAt'] {
  const result = getRetentionResult(state)
  if (result === null) throw new Error('Retention confirmation requires a loaded policy.')
  return result.updatedAt
}

function beginRetentionRefresh(state: RetentionResource): RetentionResource {
  if (state.kind === 'ready') return { ...state, refreshing: true }
  if (state.kind === 'stale') return { ...state, refreshing: true }
  return state
}

function beginInstallationRefresh(state: InstallationResource): InstallationResource {
  if (state.kind === 'ready') return { ...state, refreshing: true }
  if (state.kind === 'stale') return { ...state, refreshing: true }
  return state
}

function emptyDraft() {
  return { eventMonths: '', profileMonths: '', replayMonths: '' }
}
