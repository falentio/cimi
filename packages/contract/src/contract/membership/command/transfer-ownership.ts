import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SMembershipOwner, SMembershipTargetFields } from '../schema.ts'

export const SMembershipTransferOwnershipInput = SMembershipTargetFields
export type SMembershipTransferOwnershipInput = v.InferOutput<
  typeof SMembershipTransferOwnershipInput
>
export const SMembershipTransferOwnershipOutput = SMembershipOwner
export type SMembershipTransferOwnershipOutput = v.InferOutput<
  typeof SMembershipTransferOwnershipOutput
>

export const transferOrganizationOwnership = oc
  .route({
    method: 'POST',
    path: '/membership/transferOrganizationOwnership',
    operationId: 'transferOrganizationOwnership',
    summary: 'Transfer organization ownership',
    description:
      'Transfer ownership from the authenticated Owner to an existing active Organization member.',
    tags: ['membership'],
    successStatus: 200,
  })
  .meta({ auth: 'owner' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    CONFLICT: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SMembershipTransferOwnershipInput)
  .output(SMembershipTransferOwnershipOutput)
