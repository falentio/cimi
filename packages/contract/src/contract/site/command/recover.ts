import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SId } from '../../../schema/index.ts'
import { SSiteIdFields } from '../schema.ts'

export const SSiteRecoverInput = SSiteIdFields
export type SSiteRecoverInput = v.InferOutput<typeof SSiteRecoverInput>
export const SSiteRecoverOutput = v.strictObject({
  accepted: v.literal(true),
  status: v.literal('recovering'),
  operationId: SId,
})
export type SSiteRecoverOutput = v.InferOutput<typeof SSiteRecoverOutput>

export const recoverSite = oc
  .route({
    method: 'POST',
    path: '/recoverSite',
    operationId: 'recoverSite',
    summary: 'Recover a site',
    description:
      'Cancel recoverable Site deletion and restore the Site through the asynchronous lifecycle.',
    tags: ['site'],
    successStatus: 202,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    CONFLICT: { status: 409 },
  })
  .input(SSiteRecoverInput)
  .output(SSiteRecoverOutput)
