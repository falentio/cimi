import type { AnalyticsHealth, AnalyticsReadinessPort } from '@cimi/kernel'
import { readStoreHealth, type HealthLifecycle } from '../../health.ts'
import type { CreateApiAppDependencies } from '../../index.ts'

export interface ReportingReadinessDependencies {
  readonly health: Pick<CreateApiAppDependencies, 'db' | 'analytics' | 'dataDirectoryReady'>
  readonly lifecycle: HealthLifecycle
}

/**
 * Observes store readiness for the reporting admission kernel through the same probe the HTTP
 * admission gate uses, so the two cannot disagree about whether the analytics store is ready.
 */
export function createReportingReadinessPort(
  deps: ReportingReadinessDependencies,
): AnalyticsReadinessPort {
  return {
    async getHealth(): Promise<AnalyticsHealth> {
      const { controlStore, analyticsStore } = await readStoreHealth({
        ...deps.health,
        lifecycle: deps.lifecycle,
      })
      return { controlStore, analyticsStore }
    },
  }
}
