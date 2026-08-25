import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SRetentionPolicyResult, SRetentionPolicyUpdateFields } from '../schema.ts'

export const SRetentionPolicyUpdateInput = SRetentionPolicyUpdateFields
export type SRetentionPolicyUpdateInput = v.InferOutput<typeof SRetentionPolicyUpdateInput>
export const SRetentionPolicyUpdateOutput = SRetentionPolicyResult
export type SRetentionPolicyUpdateOutput = v.InferOutput<typeof SRetentionPolicyUpdateOutput>

export const updateRetentionPolicy = oc
  .route({
    method: 'POST',
    path: '/retention-policy/updateRetentionPolicy',
    operationId: 'updateRetentionPolicy',
    summary: 'Update retention policy',
    description:
      'Set or clear installation or Site retention values; lifecycle deletion remains asynchronous.',
    tags: ['retention-policy'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    CONFLICT: { status: 409 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SRetentionPolicyUpdateInput)
  .output(SRetentionPolicyUpdateOutput)
