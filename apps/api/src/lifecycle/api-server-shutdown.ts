import { createShutdownCoordinator, type ShutdownCoordinator } from './shutdown-coordinator.ts'

export function createApiServerShutdown(input: {
  readonly closeComposition: () => Promise<void>
  readonly closeAnalytics: () => Promise<void>
  readonly closeControlDb: () => void
}): ShutdownCoordinator {
  return createShutdownCoordinator([
    { label: 'API composition', close: input.closeComposition },
    { label: 'DuckDB analytics database', close: input.closeAnalytics },
    { label: 'SQLite control database', close: input.closeControlDb },
  ])
}
