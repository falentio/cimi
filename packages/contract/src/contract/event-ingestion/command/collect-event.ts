import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EIngestion } from '../../../schema/index.ts'
import { SAcceptedEvent, SEvent } from '../schema.ts'

export const SCollectEventInput = SEvent
export type SCollectEventInput = v.InferOutput<typeof SCollectEventInput>
export const SCollectEventOutput = SAcceptedEvent
export type SCollectEventOutput = v.InferOutput<typeof SCollectEventOutput>

export const collectEvent = oc
  .route({ method: 'POST', path: '/collectEvent' })
  .meta({ auth: 'public' })
  .errors(EIngestion)
  .input(SCollectEventInput)
  .output(SCollectEventOutput)
