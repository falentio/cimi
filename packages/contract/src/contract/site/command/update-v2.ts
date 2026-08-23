import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SSite, SSiteUpdateV2Fields } from '../schema.ts'

export const SSiteUpdateV2Input = SSiteUpdateV2Fields
export type SSiteUpdateV2Input = v.InferOutput<typeof SSiteUpdateV2Input>
export const SSiteUpdateV2Output = SSite
export type SSiteUpdateV2Output = v.InferOutput<typeof SSiteUpdateV2Output>

export const updateSiteV2 = oc
  .route({ method: 'POST', path: '/updateSiteV2' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SSiteUpdateV2Input)
  .output(SSiteUpdateV2Output)
