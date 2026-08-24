import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SRetentionPolicyGetFields, SRetentionPolicyResult } from '../schema.ts'

export const SRetentionPolicyGetInput = SRetentionPolicyGetFields
export type SRetentionPolicyGetInput = v.InferOutput<typeof SRetentionPolicyGetInput>
export const SRetentionPolicyGetOutput = SRetentionPolicyResult
export type SRetentionPolicyGetOutput = v.InferOutput<typeof SRetentionPolicyGetOutput>

export const getRetentionPolicy = oc
  .route({
    method: 'GET',
    path: '/getRetentionPolicy',
    operationId: 'getRetentionPolicy',
    summary: 'Get retention policy',
    description: 'Return installation, Site override, and effective retention values.',
    tags: ['retention-policy'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SRetentionPolicyGetInput)
  .output(SRetentionPolicyGetOutput)
