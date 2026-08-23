import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SFunnel, SFunnelDefinitionFields, SFunnelIdentityFields } from '../schema.ts'

export const SFunnelUpdateInput = v.strictObject(
  v.entriesFromObjects([SFunnelIdentityFields, SFunnelDefinitionFields]),
)
export type SFunnelUpdateInput = v.InferOutput<typeof SFunnelUpdateInput>
export const SFunnelUpdateOutput = SFunnel
export type SFunnelUpdateOutput = v.InferOutput<typeof SFunnelUpdateOutput>

export const updateFunnel = oc
  .route({
    method: 'POST',
    path: '/updateFunnel',
    operationId: 'updateFunnel',
    summary: 'Update a funnel',
    description: 'Update an existing Funnel definition.',
    tags: ['funnel'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SFunnelUpdateInput)
  .output(SFunnelUpdateOutput)
