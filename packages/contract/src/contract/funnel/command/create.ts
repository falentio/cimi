import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SFunnel, SFunnelDefinitionFields, SFunnelSiteFields } from '../schema.ts'

export const SFunnelCreateInput = v.strictObject(
  v.entriesFromObjects([SFunnelSiteFields, SFunnelDefinitionFields]),
)
export type SFunnelCreateInput = v.InferOutput<typeof SFunnelCreateInput>
export const SFunnelCreateOutput = SFunnel
export type SFunnelCreateOutput = v.InferOutput<typeof SFunnelCreateOutput>

export const createFunnel = oc
  .route({
    method: 'POST',
    path: '/funnel/createFunnel',
    operationId: 'createFunnel',
    summary: 'Create a funnel',
    description: 'Persist a validated ordered Funnel definition for a Site.',
    tags: ['funnel'],
    successStatus: 201,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    CONFLICT: {},
  })
  .input(SFunnelCreateInput)
  .output(SFunnelCreateOutput)
