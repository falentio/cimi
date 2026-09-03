import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SMembershipChangeRoleFields, SMembershipNonOwner } from '../schema.ts'

export const SMembershipChangeRoleInput = SMembershipChangeRoleFields
export type SMembershipChangeRoleInput = v.InferOutput<typeof SMembershipChangeRoleInput>
export const SMembershipChangeRoleOutput = SMembershipNonOwner
export type SMembershipChangeRoleOutput = v.InferOutput<typeof SMembershipChangeRoleOutput>

export const changeMemberRole = oc
  .route({
    method: 'POST',
    path: '/membership/changeMemberRole',
    operationId: 'changeMemberRole',
    summary: 'Change a member role',
    description:
      "Change an existing Organization member's role without changing membership ownership rules.",
    tags: ['membership'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    CONFLICT: {},
    OWNER_PROTECTED: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SMembershipChangeRoleInput)
  .output(SMembershipChangeRoleOutput)
