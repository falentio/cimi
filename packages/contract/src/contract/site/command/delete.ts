import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SSiteIdFields } from '../schema.ts'

export const SSiteDeleteInput = SSiteIdFields
export type SSiteDeleteInput = v.InferOutput<typeof SSiteDeleteInput>
export const SSiteDeleteOutput = v.strictObject({
  accepted: v.literal(true),
  status: v.literal('deleting'),
})
export type SSiteDeleteOutput = v.InferOutput<typeof SSiteDeleteOutput>

export const deleteSite = oc
  .route({
    method: 'POST',
    path: '/deleteSite',
    operationId: 'deleteSite',
    summary: 'Delete a site',
    description:
      'Quiesce and delete a Site and its Site-scoped configuration through the asynchronous lifecycle.',
    tags: ['site'],
    successStatus: 202,
  })
  .meta({ auth: 'owner' })
  .errors({ ...ECommand, CONFLICT: { status: 409 } })
  .input(SSiteDeleteInput)
  .output(SSiteDeleteOutput)
