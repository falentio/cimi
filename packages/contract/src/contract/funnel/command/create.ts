import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SFunnel, SFunnelDefinitionFields, SFunnelSiteFields } from '../schema.ts'

export const SFunnelCreateInput = v.strictObject(
  v.entriesFromObjects([SFunnelSiteFields, SFunnelDefinitionFields]),
)
export type SFunnelCreateInput = v.InferOutput<typeof SFunnelCreateInput>
export const SFunnelCreateOutput = SFunnel
export type SFunnelCreateOutput = v.InferOutput<typeof SFunnelCreateOutput>

export const createFunnel = oc
  .route({ method: 'POST', path: '/createFunnel' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SFunnelCreateInput)
  .output(SFunnelCreateOutput)
