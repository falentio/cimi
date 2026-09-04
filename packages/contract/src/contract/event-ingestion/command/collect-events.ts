import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SId } from '../../../schema/index.ts'
import { SCollectionContext } from '../../collection-policy/transport.ts'
import {
  EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS,
  EVENT_ACCEPTANCE_PENDING_MAX_EVENTS,
  EVENT_ACCEPTANCE_WINDOW_MS,
} from '../acceptance.ts'
import { SBatchEventResponse } from '../schema.ts'

export const COLLECT_EVENTS_MAX_RAW_REQUEST_BYTES = 256 * 1024
const SCollectEventsEnvelope = v.strictObject({
  ingestionIdentifier: SId,
  collectionContext: v.optional(SCollectionContext),
  events: v.pipe(v.array(v.unknown()), v.minLength(1), v.maxLength(100)),
})
export const SCollectEventsInput = v.pipe(
  SCollectEventsEnvelope,
  v.check(
    ({ ingestionIdentifier, events }) =>
      events.every((event) => {
        if (typeof event !== 'object' || event === null || Array.isArray(event)) return true
        return (
          !('ingestionIdentifier' in event) || event['ingestionIdentifier'] === ingestionIdentifier
        )
      }),
    'Every Event must use the batch Ingestion Identifier when provided.',
  ),
  v.check(
    ({ events }) =>
      events.every(
        (event) =>
          typeof event !== 'object' ||
          event === null ||
          Array.isArray(event) ||
          !('collectionContext' in event),
      ),
    'Collection context is scoped to the batch envelope.',
  ),
)
export type SCollectEventsInput = v.InferOutput<typeof SCollectEventsInput>
export const SCollectEventsOutput = SBatchEventResponse
export type SCollectEventsOutput = v.InferOutput<typeof SCollectEventsOutput>

export const collectEvents = oc
  .route({
    method: 'POST',
    path: '/event-ingestion/collectEvents',
    operationId: 'collectEvents',
    summary: 'Collect a batch of events',
    description: `Accept a bounded non-atomic batch of telemetry Events. New normalized candidates share a FIFO SQLite acceptance coalescer with a ${EVENT_ACCEPTANCE_WINDOW_MS} ms window, a ${EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS}-candidate flush limit, and ${EVENT_ACCEPTANCE_PENDING_MAX_EVENTS} pending-candidate capacity. Candidates may span flushes while preserving input order; successful responses wait for durable SQLite commit. Normal item outcomes remain HTTP 200; queue or flush failure returns top-level SERVICE_UNAVAILABLE with no result body. The transport adapter measures the raw UTF-8 request body before JSON parsing against the published byte limit; collectionContext applies to the whole batch.`,
    tags: ['event-ingestion'],
    successStatus: 200,
  })
  .meta({ auth: 'public', admission: 'ingestion' })
  .errors({
    BAD_REQUEST: {},
    NOT_FOUND: {},
    PAYLOAD_TOO_LARGE: {},
    TOO_MANY_REQUESTS: {},
    SERVICE_UNAVAILABLE: {},
  })
  .input(SCollectEventsInput)
  .output(SCollectEventsOutput)
