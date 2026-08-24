import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EIngestion } from '../../../schema/index.ts'
import {
  EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS,
  EVENT_ACCEPTANCE_PENDING_MAX_EVENTS,
  EVENT_ACCEPTANCE_WINDOW_MS,
} from '../acceptance.ts'
import { SAcceptedEvent, SEvent } from '../schema.ts'

export const COLLECT_EVENT_MAX_RAW_REQUEST_BYTES = 64 * 1024
export const SCollectEventInput = SEvent
export type SCollectEventInput = v.InferOutput<typeof SCollectEventInput>
export const SCollectEventOutput = SAcceptedEvent
export type SCollectEventOutput = v.InferOutput<typeof SCollectEventOutput>

export const collectEvent = oc
  .route({
    method: 'POST',
    path: '/collectEvent',
    operationId: 'collectEvent',
    summary: 'Collect an event',
    description: `Accept one telemetry Event for processing. New normalized candidates share a FIFO SQLite acceptance coalescer with a ${EVENT_ACCEPTANCE_WINDOW_MS} ms window, a ${EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS}-candidate flush limit, and ${EVENT_ACCEPTANCE_PENDING_MAX_EVENTS} pending-candidate capacity. Successful responses wait for durable SQLite commit; queue admission is not acknowledgment and DuckDB materialization remains asynchronous. The transport adapter measures the raw UTF-8 request body before JSON parsing against the published byte limit.`,
    tags: ['event-ingestion'],
    successStatus: 200,
  })
  .meta({ auth: 'public' })
  .errors(EIngestion)
  .input(SCollectEventInput)
  .output(SCollectEventOutput)
