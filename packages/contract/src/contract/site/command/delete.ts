import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SId } from '../../../schema/index.ts'
import { SSiteIdFields } from '../schema.ts'

export const SSiteDeleteInput = SSiteIdFields
export type SSiteDeleteInput = v.InferOutput<typeof SSiteDeleteInput>
export const SSiteDeleteOutput = v.strictObject({
  accepted: v.literal(true),
  status: v.literal('deleting'),
  operationId: SId,
})
export type SSiteDeleteOutput = v.InferOutput<typeof SSiteDeleteOutput>

export const deleteSite = oc
  .route({
    method: 'POST',
    path: '/deleteSite',
    operationId: 'deleteSite',
    summary: 'Delete a site',
    description: 'Quiesce a Site and begin its recoverable asynchronous deletion lifecycle.',
    tags: ['site'],
    successStatus: 202,
  })
  .meta({ auth: 'owner' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    CONFLICT: { status: 409 },
  })
  .input(SSiteDeleteInput)
  .output(SSiteDeleteOutput)
