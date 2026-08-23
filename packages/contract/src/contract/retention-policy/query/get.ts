import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SRetentionPolicyResult, SRetentionPolicySiteFields } from '../schema.ts'

export const SRetentionPolicyGetInput = SRetentionPolicySiteFields
export type SRetentionPolicyGetInput = v.InferOutput<typeof SRetentionPolicyGetInput>
export const SRetentionPolicyGetOutput = SRetentionPolicyResult
export type SRetentionPolicyGetOutput = v.InferOutput<typeof SRetentionPolicyGetOutput>

export const getRetentionPolicy = oc
  .route({ method: 'GET', path: '/getRetentionPolicy' })
  .meta({ auth: 'admin' })
  .errors(ERead)
  .input(SRetentionPolicyGetInput)
  .output(SRetentionPolicyGetOutput)
