import type { CreateApiAppDependencies } from './index.ts'

export type HealthStatus = 'healthy' | 'degraded' | 'recovering' | 'maintenance' | 'unavailable'
export type StoreHealth = 'ready' | 'degraded' | 'rebuilding' | 'unavailable'

export interface HealthSnapshot {
  status?: HealthStatus
  controlStore?: StoreHealth
  analyticsStore?: StoreHealth
  cleanupPending?: boolean
}

export interface HealthLifecycle {
  getSnapshot(): Promise<HealthSnapshot>
}

export async function systemHealthHandler(deps: CreateApiAppDependencies): Promise<{
  status: HealthStatus
  controlStore: StoreHealth
  analyticsStore: StoreHealth
  cleanupPending: boolean
  version: string
  checkedAt: string
}> {
  let controlDatabase = false
  try {
    const result = deps.db.$client.prepare('select 1').get()
    controlDatabase = Boolean(result)
  } catch {
    controlDatabase = false
  }

  let analyticsDatabase = false
  try {
    analyticsDatabase = await deps.analytics.ready()
  } catch {
    analyticsDatabase = false
  }

  const lifecycle = await getLifecycleSnapshot(deps.lifecycle)
  const controlStore = controlDatabase ? (lifecycle.controlStore ?? 'ready') : 'unavailable'
  const analyticsStore = analyticsDatabase ? (lifecycle.analyticsStore ?? 'ready') : 'unavailable'

  return {
    status: resolveHealthStatus(lifecycle.status, controlStore, analyticsStore),
    controlStore,
    analyticsStore,
    cleanupPending: lifecycle.cleanupPending ?? false,
    version: '0.0.1',
    checkedAt: new Date().toISOString(),
  }
}

async function getLifecycleSnapshot(
  lifecycle: HealthLifecycle | undefined,
): Promise<HealthSnapshot> {
  if (!lifecycle) return {}

  try {
    return await lifecycle.getSnapshot()
  } catch {
    return { status: 'recovering' }
  }
}

function resolveHealthStatus(
  requestedStatus: HealthStatus | undefined,
  controlStore: StoreHealth,
  analyticsStore: StoreHealth,
): HealthStatus {
  if (requestedStatus && requestedStatus !== 'healthy') return requestedStatus
  if (controlStore !== 'ready') return 'unavailable'
  if (analyticsStore !== 'ready') return 'degraded'
  return 'healthy'
}
