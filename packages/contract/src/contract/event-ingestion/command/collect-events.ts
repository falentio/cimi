import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EBatchIngestion, SId, isWithinSerializedByteLimit } from '../../../schema/index.ts'
import { SBatchEventResponse } from '../schema.ts'

const SCollectEventsEnvelope = v.strictObject({
  ingestionIdentifier: SId,
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
    (input) => isWithinSerializedByteLimit(input, 256 * 1024),
    'Batch payload must not exceed 256 KiB.',
  ),
)
export type SCollectEventsInput = v.InferOutput<typeof SCollectEventsInput>
export const SCollectEventsOutput = SBatchEventResponse
export type SCollectEventsOutput = v.InferOutput<typeof SCollectEventsOutput>

export const collectEvents = oc
  .route({
    method: 'POST',
    path: '/collectEvents',
    operationId: 'collectEvents',
    summary: 'Collect a batch of events',
    description: 'Accept a bounded non-atomic batch of telemetry Events for processing.',
    tags: ['event-ingestion'],
    successStatus: 200,
  })
  .meta({ auth: 'public' })
  .errors(EBatchIngestion)
  .input(SCollectEventsInput)
  .output(SCollectEventsOutput)
