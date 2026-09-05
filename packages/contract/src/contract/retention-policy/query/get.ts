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
    path: '/retention-policy/getRetentionPolicy',
    operationId: 'getRetentionPolicy',
    summary: 'Get retention policy',
    description: 'Return installation, Site override, and effective retention values.',
    tags: ['retention-policy'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    CONFLICT: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SRetentionPolicyGetInput)
  .output(SRetentionPolicyGetOutput)
