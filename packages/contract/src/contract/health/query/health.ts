import { oc } from '../../../orpc/index.ts'
import { SSystemHealth } from '../schema.ts'

export const SSystemHealthOutput = SSystemHealth

/**
 * Reports API liveness and backing-store readiness.
 *
 * @errors
 * - `INTERNAL_SERVER_ERROR` — a backing store check failed unexpectedly.
 */
export const health = oc
  .route({ method: 'GET', path: '/system/health' })
  .meta({ auth: 'public' })
  .output(SSystemHealthOutput)
