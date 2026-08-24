import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EIngestion } from '../../../schema/index.ts'
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
    description:
      'Accept one telemetry Event for processing. The transport adapter measures the raw UTF-8 request body before JSON parsing against the published byte limit.',
    tags: ['event-ingestion'],
    successStatus: 200,
  })
  .meta({ auth: 'public' })
  .errors(EIngestion)
  .input(SCollectEventInput)
  .output(SCollectEventOutput)
