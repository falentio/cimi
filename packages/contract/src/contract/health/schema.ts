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
export const SIngestionDiagnostics = v.strictObject({
  queueDepth: v.pipe(v.number(), v.integer(), v.minValue(0)),
  activeBatchSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  pendingQueueSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  flushCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  committedCandidates: v.pipe(v.number(), v.integer(), v.minValue(0)),
  queueWaitMsTotal: v.pipe(v.number(), v.minValue(0)),
  commitLatencyMsTotal: v.pipe(v.number(), v.minValue(0)),
  responseLatencyMsTotal: v.pipe(v.number(), v.minValue(0)),
  responseCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  saturationCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  failureCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  lastSafeSequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  walBytes: v.nullable(v.pipe(v.number(), v.minValue(0))),
})
const SSystemHealthFields = v.strictObject({
  status: SHealthStatus,
  controlStore: SStoreHealth,
  analyticsStore: SStoreHealth,
  cleanupPending: v.boolean(),
  ingestion: v.optional(SIngestionDiagnostics),
  version: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  checkedAt: SDateTime,
})
const isAllowedHealthState = ({
  status,
  controlStore,
  analyticsStore,
  cleanupPending,
}: v.InferOutput<typeof SSystemHealthFields>) => {
  if (status === 'healthy') {
    return controlStore === 'ready' && analyticsStore === 'ready' && !cleanupPending
  }
  if (status === 'degraded') {
    return controlStore === 'ready' && (analyticsStore !== 'ready' || cleanupPending)
  }
  if (status === 'recovering' || status === 'maintenance') {
    return controlStore === 'ready'
  }
  return controlStore !== 'ready'
}

export const SHealth = v.pipe(
  SSystemHealthFields,
  v.check(isAllowedHealthState, 'Health status and store states are not a valid combination.'),
)

export const SSystemHealth = SHealth
