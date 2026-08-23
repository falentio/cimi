import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { PSafePolicy, SCollectionPolicySiteFields } from '../schema.ts'

export const SCollectionPolicyGetInput = SCollectionPolicySiteFields
export type SCollectionPolicyGetInput = v.InferOutput<typeof SCollectionPolicyGetInput>
export const SCollectionPolicyGetOutput = PSafePolicy
export type SCollectionPolicyGetOutput = v.InferOutput<typeof SCollectionPolicyGetOutput>

export const getCollectionPolicy = oc
  .route({
    method: 'GET',
    path: '/getCollectionPolicy',
    operationId: 'getCollectionPolicy',
    summary: 'Get collection policy',
    description: 'Return the effective collection policy and any Site-level override.',
    tags: ['collection-policy'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors(ERead)
  .input(SCollectionPolicyGetInput)
  .output(SCollectionPolicyGetOutput)
