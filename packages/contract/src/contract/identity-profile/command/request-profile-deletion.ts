import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SProfileIdentityFields } from '../schema.ts'

export const SRequestProfileDeletionInput = SProfileIdentityFields
export type SRequestProfileDeletionInput = v.InferOutput<typeof SRequestProfileDeletionInput>
export const SRequestProfileDeletionOutput = v.strictObject({
  accepted: v.literal(true),
  status: v.literal('deletion-requested'),
})
export type SRequestProfileDeletionOutput = v.InferOutput<typeof SRequestProfileDeletionOutput>

export const requestProfileDeletion = oc
  .route({
    method: 'POST',
    path: '/identity-profile/requestProfileDeletion',
    operationId: 'requestProfileDeletion',
    summary: 'Request profile deletion',
    description:
      'Request asynchronous hard deletion of a Site-scoped identity profile. A profile in deletion-requested, deleting, or deleted state returns CONFLICT and remains reserved through cleanup.',
    tags: ['identity-profile'],
    successStatus: 202,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    CONFLICT: {},
  })
  .input(SRequestProfileDeletionInput)
  .output(SRequestProfileDeletionOutput)
