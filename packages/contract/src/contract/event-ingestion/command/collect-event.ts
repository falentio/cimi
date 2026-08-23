import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EIngestion } from '../../../schema/index.ts'
import { SAcceptedEvent, SEvent } from '../schema.ts'

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
      'Accept one telemetry Event for processing using the event identifier for deduplication.',
    tags: ['event-ingestion'],
    successStatus: 202,
  })
  .meta({ auth: 'public' })
  .errors(EIngestion)
  .input(SCollectEventInput)
  .output(SCollectEventOutput)
