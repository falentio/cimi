import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SSite, SSiteIdFields } from '../schema.ts'

export const SSiteGetInput = SSiteIdFields
export type SSiteGetInput = v.InferOutput<typeof SSiteGetInput>
export const SSiteGetOutput = SSite
export type SSiteGetOutput = v.InferOutput<typeof SSiteGetOutput>

export const getSite = oc
  .route({ method: 'GET', path: '/getSite' })
  .meta({ auth: 'authenticated' })
  .errors(ERead)
  .input(SSiteGetInput)
  .output(SSiteGetOutput)
