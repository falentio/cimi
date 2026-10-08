import type {
  PublicDashboardAction,
  PublicDashboardConfiguration,
  PublicDashboardOperation,
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
      return adoptConfiguration(state, { kind: 'configured', config: action.config })
    case 'config-absent':
      return adoptConfiguration(state, { kind: 'unconfigured' })
    case 'config-failed':
      return {
        ...state,
        config:
          state.config.kind === 'ready' || state.config.kind === 'stale'
            ? {
                kind: 'stale',
                configuration: state.config.configuration,
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
    case 'identifier-issued':
      return commit(state, { kind: 'configured', config: action.config }, action.operation)
    case 'access-revoked': {
      const configuration = loadedConfiguration(state.config)

      return configuration === null ? state : commit(state, revoke(configuration), 'disable')
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

function commit(
  state: PublicDashboardState,
  configuration: PublicDashboardConfiguration,
  operation: PublicDashboardOperation,
): PublicDashboardState {
  return {
    ...state,
    config: { kind: 'ready', configuration, refreshing: false },
    command: { kind: 'idle' },
    notice: publicDashboardNotice(operation, null),
  }
}

function adoptConfiguration(
  state: PublicDashboardState,
  configuration: PublicDashboardConfiguration,
): PublicDashboardState {
  return {
    ...state,
    config: { kind: 'ready', configuration, refreshing: false },
    command: state.command.kind === 'failed' ? { kind: 'idle' } : state.command,
  }
}

function loadedConfiguration(config: PublicDashboardResource): PublicDashboardConfiguration | null {
  return config.kind === 'ready' || config.kind === 'stale' ? config.configuration : null
}

function revoke(configuration: PublicDashboardConfiguration): PublicDashboardConfiguration {
  if (configuration.kind === 'unconfigured') return configuration

  return { kind: 'configured', config: { ...configuration.config, enabled: false } }
}

function beginRefresh(config: PublicDashboardResource): PublicDashboardResource {
  if (config.kind === 'ready' || config.kind === 'stale') return { ...config, refreshing: true }

  return config
}
