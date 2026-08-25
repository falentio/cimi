import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SMembershipTargetFields } from '../schema.ts'

export const SMembershipRemoveInput = SMembershipTargetFields
export type SMembershipRemoveInput = v.InferOutput<typeof SMembershipRemoveInput>
export const SMembershipRemoveOutput = v.void()
export type SMembershipRemoveOutput = v.InferOutput<typeof SMembershipRemoveOutput>

export const removeMember = oc
  .route({
    method: 'POST',
    path: '/membership/removeMember',
    operationId: 'removeMember',
    summary: 'Remove a member',
    description:
      'Remove another member from an Organization while protecting the owner membership.',
    tags: ['membership'],
    successStatus: 204,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    OWNER_PROTECTED: { status: 409 },
  })
  .input(SMembershipRemoveInput)
  .output(SMembershipRemoveOutput)
