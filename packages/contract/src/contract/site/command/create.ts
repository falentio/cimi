import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SSite, SSiteOrganizationFields } from '../schema.ts'

export const SSiteCreateInput = SSiteOrganizationFields
export type SSiteCreateInput = v.InferOutput<typeof SSiteCreateInput>
export const SSiteCreateOutput = SSite
export type SSiteCreateOutput = v.InferOutput<typeof SSiteCreateOutput>

export const createSite = oc
  .route({ method: 'POST', path: '/createSite' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SSiteCreateInput)
  .output(SSiteCreateOutput)
