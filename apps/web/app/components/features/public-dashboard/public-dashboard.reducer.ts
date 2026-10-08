import type {
  PublicDashboardAction,
  PublicDashboardConfig,
  PublicDashboardResource,
  PublicDashboardState,
} from './public-dashboard.types'
import { publicDashboardNotice } from './public-dashboard.utils'

export function createInitialPublicDashboardState(): PublicDashboardState {
  return {
    config: { kind: 'loading' },
    command: { kind: 'idle' },
    notice: null,
  }
}

export function reducePublicDashboard(
  state: PublicDashboardState,
  action: PublicDashboardAction,
): PublicDashboardState {
  switch (action.kind) {
    case 'refresh-started':
      return { ...state, config: beginRefresh(state.config), notice: null }
    case 'config-received':
      return adoptConfig(state, action.config)
    case 'config-absent':
      return adoptConfig(state, null)
    case 'config-failed':
      return {
        ...state,
        config:
          state.config.kind === 'ready' || state.config.kind === 'stale'
            ? {
                kind: 'stale',
                config: state.config.config,
                error: action.error,
                refreshing: false,
              }
            : { kind: 'failed', error: action.error },
      }
    case 'operation-requested':
      if (state.command.kind === 'submitting') return state

      return { ...state, command: { kind: 'confirming', operation: action.operation } }
    case 'operation-cancelled':
      return state.command.kind === 'confirming' ? { ...state, command: { kind: 'idle' } } : state
    case 'operation-started':
      return {
        ...state,
        command: { kind: 'submitting', operation: action.operation },
        notice: null,
      }
    case 'operation-succeeded':
      return {
        ...state,
        config: {
          kind: 'ready',
          config: resolveCommittedConfig(state.config, action.config),
          refreshing: false,
        },
        command: { kind: 'idle' },
        notice: publicDashboardNotice(action.operation, null),
      }
    case 'operation-failed':
      return {
        ...state,
        command: { kind: 'failed', operation: action.operation, error: action.error },
      }
    case 'notice-warning':
      return {
        ...state,
        config:
          state.config.kind === 'ready' || state.config.kind === 'stale'
            ? { ...state.config, refreshing: false }
            : state.config,
        notice: state.notice === null ? null : { ...state.notice, warning: action.error },
      }
    default: {
      const _exhaustive: never = action

      return _exhaustive
    }
  }
}

function adoptConfig(
  state: PublicDashboardState,
  config: PublicDashboardConfig | null,
): PublicDashboardState {
  return {
    ...state,
    config: { kind: 'ready', config, refreshing: false },
    command: state.command.kind === 'failed' ? { kind: 'idle' } : state.command,
  }
}

/**
 * Disable returns no body, so the committed state is the previous config with
 * the enabled flag cleared. Enable and rotate return the new config directly.
 */
function resolveCommittedConfig(
  current: PublicDashboardResource,
  committed: PublicDashboardConfig | null,
): PublicDashboardConfig | null {
  if (committed !== null) return committed

  const previous = current.kind === 'ready' || current.kind === 'stale' ? current.config : null

  return previous === null ? null : { ...previous, enabled: false }
}

function beginRefresh(config: PublicDashboardResource): PublicDashboardResource {
  if (config.kind === 'ready' || config.kind === 'stale') return { ...config, refreshing: true }

  return config
}
