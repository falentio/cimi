import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SDateTime, SId } from '../../../schema/index.ts'
import { SIdentifyFields } from '../schema.ts'

export const SIdentifyInput = SIdentifyFields
export type SIdentifyInput = v.InferOutput<typeof SIdentifyInput>
export const SIdentifyOutput = v.strictObject({
  identifiedUserId: SId,
  status: v.literal('active'),
  updatedAt: SDateTime,
})
export type SIdentifyOutput = v.InferOutput<typeof SIdentifyOutput>

export const identify = oc
  .route({ method: 'POST', path: '/identify' })
  .meta({ auth: 'public' })
  .errors({ BAD_REQUEST: {}, NOT_FOUND: {}, PAYLOAD_TOO_LARGE: {}, TOO_MANY_REQUESTS: {} })
  .input(SIdentifyInput)
  .output(SIdentifyOutput)
