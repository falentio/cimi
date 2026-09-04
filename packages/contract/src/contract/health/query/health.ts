import { oc } from '../../../orpc/index.ts'
import { SHealth } from '../schema.ts'

export const SHealthOutput = SHealth
export const SSystemHealthOutput = SHealthOutput

/**
 * Reports API liveness and backing-store readiness.
 *
 * @errors
 * - `INTERNAL_SERVER_ERROR` — a backing store check failed unexpectedly.
 */
export const health = oc
  .route({
    method: 'GET',
    path: '/system/health',
    operationId: 'health',
    summary: 'Get system health',
    description:
      'Report application and backing-store readiness without exposing secrets or provider internals.',
    tags: ['health'],
    successStatus: 200,
  })
  .meta({ auth: 'public', admission: 'exempt' })
  .errors({ INTERNAL_SERVER_ERROR: {} })
  .output(SHealthOutput)
