import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SProfileIdentityFields } from '../schema.ts'

export const SRequestProfileDeletionInput = SProfileIdentityFields
export type SRequestProfileDeletionInput = v.InferOutput<typeof SRequestProfileDeletionInput>
export const SRequestProfileDeletionOutput = v.strictObject({
  accepted: v.literal(true),
  status: v.literal('deletion_requested'),
})
export type SRequestProfileDeletionOutput = v.InferOutput<typeof SRequestProfileDeletionOutput>

export const requestProfileDeletion = oc
  .route({
    method: 'POST',
    path: '/requestProfileDeletion',
    operationId: 'requestProfileDeletion',
    summary: 'Request profile deletion',
    description: 'Request asynchronous hard deletion of a Site-scoped identity profile.',
    tags: ['identity-profile'],
    successStatus: 202,
  })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SRequestProfileDeletionInput)
  .output(SRequestProfileDeletionOutput)
