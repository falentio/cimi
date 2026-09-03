import * as v from 'valibot'
import { schema } from '@cimi/contract'
import type { CreateApiAppDependencies } from './index.ts'

export type HealthStatus = 'healthy' | 'degraded' | 'recovering' | 'maintenance' | 'unavailable'
export type StoreHealth = 'ready' | 'degraded' | 'rebuilding' | 'unavailable'
export type InstallationStatus =
  | 'uninitialized'
  | 'ready'
  | 'degraded'
  | 'maintenance'
  | 'recovering'

export interface HealthSnapshot {
  status?: HealthStatus
  installationStatus?: InstallationStatus
  controlStore?: StoreHealth
  analyticsStore?: StoreHealth
  cleanupPending?: boolean
}

export interface HealthLifecycle {
  getSnapshot(): Promise<HealthSnapshot>
}

export interface InstallationHealthInput {
  installationStatus: InstallationStatus
  controlStore: StoreHealth
  analyticsStore: StoreHealth
  cleanupPending: boolean
}

const INSTALLATION_STATUSES: readonly string[] = [
  'uninitialized',
  'ready',
  'degraded',
  'maintenance',
  'recovering',
]

export function resolveInstallationHealth(input: InstallationHealthInput): HealthStatus {
  if (input.controlStore !== 'ready') return 'unavailable'
  if (input.installationStatus === 'recovering') return 'recovering'
  if (input.installationStatus === 'maintenance') return 'maintenance'
  if (input.analyticsStore !== 'ready' || input.cleanupPending) return 'degraded'
  return 'healthy'
}

export function resolveHealthStatus(
  installationStatus: InstallationStatus,
  controlStore: StoreHealth,
  analyticsStore: StoreHealth,
  cleanupPending: boolean,
): HealthStatus {
  return resolveInstallationHealth({
    installationStatus,
    controlStore,
    analyticsStore,
    cleanupPending,
  })
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
  const cleanupPending = lifecycle.cleanupPending ?? false

  return v.parse(schema.SHealth, {
    status: resolveInstallationHealth({
      installationStatus:
        lifecycle.installationStatus ?? toInstallationStatus(lifecycle.status) ?? 'ready',
      controlStore,
      analyticsStore,
      cleanupPending,
    }),
    controlStore,
    analyticsStore,
    cleanupPending,
    version: '0.0.1',
    checkedAt: new Date().toISOString(),
  })
}

async function getLifecycleSnapshot(
  lifecycle: HealthLifecycle | undefined,
): Promise<HealthSnapshot> {
  if (!lifecycle) return {}

  try {
    return await lifecycle.getSnapshot()
  } catch {
    return { installationStatus: 'recovering' }
  }
}

function toInstallationStatus(status: HealthStatus | undefined): InstallationStatus | undefined {
  if (status === undefined) return undefined
  return INSTALLATION_STATUSES.includes(status) ? (status as InstallationStatus) : undefined
}
