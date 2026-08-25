import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { PSafePolicy, SCollectionPolicyUpdateFields } from '../schema.ts'

export const SCollectionPolicyUpdateInput = SCollectionPolicyUpdateFields
export type SCollectionPolicyUpdateInput = v.InferOutput<typeof SCollectionPolicyUpdateInput>
export const SCollectionPolicyUpdateOutput = PSafePolicy
export type SCollectionPolicyUpdateOutput = v.InferOutput<typeof SCollectionPolicyUpdateOutput>

export const updateCollectionPolicy = oc
  .route({
    method: 'POST',
    path: '/collection-policy/updateCollectionPolicy',
    operationId: 'updateCollectionPolicy',
    summary: 'Update collection policy',
    description:
      'Update an installation default or a Site override. Authorization is selected by the scope discriminator: installation-admin for installation defaults, or Site-management authority for Site overrides.',
    tags: ['collection-policy'],
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
  .input(SCollectionPolicyUpdateInput)
  .output(SCollectionPolicyUpdateOutput)
