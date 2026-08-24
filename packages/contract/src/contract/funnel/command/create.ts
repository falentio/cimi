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
    path: '/createFunnel',
    operationId: 'createFunnel',
    summary: 'Create a funnel',
    description: 'Persist a validated ordered Funnel definition for a Site.',
    tags: ['funnel'],
    successStatus: 201,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    CONFLICT: { status: 409 },
  })
  .input(SFunnelCreateInput)
  .output(SFunnelCreateOutput)
