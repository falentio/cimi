import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { PSafePolicy, SCollectionPolicyUpdateFields } from '../schema.ts'

export const SCollectionPolicyUpdateInput = SCollectionPolicyUpdateFields
export type SCollectionPolicyUpdateInput = v.InferOutput<typeof SCollectionPolicyUpdateInput>
export const SCollectionPolicyUpdateOutput = PSafePolicy
export type SCollectionPolicyUpdateOutput = v.InferOutput<typeof SCollectionPolicyUpdateOutput>

export const updateCollectionPolicy = oc
  .route({ method: 'POST', path: '/updateCollectionPolicy' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SCollectionPolicyUpdateInput)
  .output(SCollectionPolicyUpdateOutput)
