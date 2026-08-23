import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SSiteIdFields } from '../schema.ts'

export const SSiteDeleteInput = SSiteIdFields
export type SSiteDeleteInput = v.InferOutput<typeof SSiteDeleteInput>
export const SSiteDeleteOutput = v.strictObject({ accepted: v.literal(true) })
export type SSiteDeleteOutput = v.InferOutput<typeof SSiteDeleteOutput>

export const deleteSite = oc
  .route({ method: 'POST', path: '/deleteSite' })
  .meta({ auth: 'admin' })
  .errors({ ...ECommand, CONFLICT: {} })
  .input(SSiteDeleteInput)
  .output(SSiteDeleteOutput)
