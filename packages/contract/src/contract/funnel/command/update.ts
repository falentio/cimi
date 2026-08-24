import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
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
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    CONFLICT: { status: 409 },
  })
  .input(SFunnelUpdateInput)
  .output(SFunnelUpdateOutput)
