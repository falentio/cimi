import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SSite, SSiteUpdateFields } from '../schema.ts'

export const SSiteUpdateInput = SSiteUpdateFields
export type SSiteUpdateInput = v.InferOutput<typeof SSiteUpdateInput>
export const SSiteUpdateOutput = SSite
export type SSiteUpdateOutput = v.InferOutput<typeof SSiteUpdateOutput>

export const updateSite = oc
  .route({ method: 'POST', path: '/updateSite' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SSiteUpdateInput)
  .output(SSiteUpdateOutput)
