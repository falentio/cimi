import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SFunnelIdentityFields } from '../schema.ts'

export const SFunnelArchiveInput = SFunnelIdentityFields
export type SFunnelArchiveInput = v.InferOutput<typeof SFunnelArchiveInput>
export const SFunnelArchiveOutput = v.strictObject({ archived: v.literal(true) })
export type SFunnelArchiveOutput = v.InferOutput<typeof SFunnelArchiveOutput>

export const archiveFunnel = oc
  .route({ method: 'POST', path: '/archiveFunnel' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SFunnelArchiveInput)
  .output(SFunnelArchiveOutput)
