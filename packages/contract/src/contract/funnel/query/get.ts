import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery } from '../../../schema/index.ts'
import { SFunnel, SFunnelIdentityFields } from '../schema.ts'

export const SFunnelGetInput = SFunnelIdentityFields
export type SFunnelGetInput = v.InferOutput<typeof SFunnelGetInput>
export const SFunnelGetOutput = SFunnel
export type SFunnelGetOutput = v.InferOutput<typeof SFunnelGetOutput>

export const getFunnel = oc
  .route({ method: 'GET', path: '/getFunnel' })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SFunnelGetInput)
  .output(SFunnelGetOutput)
