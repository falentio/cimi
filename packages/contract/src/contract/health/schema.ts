import * as v from 'valibot'
import { SDateTime } from '../../schema/index.ts'

export const SHealthStatus = v.picklist([
  'healthy',
  'degraded',
  'recovering',
  'maintenance',
  'unavailable',
])
export const SStoreHealth = v.picklist(['ready', 'degraded', 'rebuilding', 'unavailable'])
const SSystemHealthFields = v.strictObject({
  status: SHealthStatus,
  controlStore: SStoreHealth,
  analyticsStore: SStoreHealth,
  cleanupPending: v.boolean(),
  version: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  checkedAt: SDateTime,
})
export const SSystemHealth = v.pipe(
  SSystemHealthFields,
  v.check(
    ({ status, controlStore, analyticsStore }) =>
      status !== 'healthy' || (controlStore === 'ready' && analyticsStore === 'ready'),
    'Healthy status requires both stores to be ready.',
  ),
)
