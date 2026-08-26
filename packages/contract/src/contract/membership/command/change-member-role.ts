import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SMembership, SMembershipChangeRoleFields } from '../schema.ts'

export const SMembershipChangeRoleInput = SMembershipChangeRoleFields
export type SMembershipChangeRoleInput = v.InferOutput<typeof SMembershipChangeRoleInput>
export const SMembershipChangeRoleOutput = SMembership
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
    OWNER_PROTECTED: {},
  })
  .input(SMembershipChangeRoleInput)
  .output(SMembershipChangeRoleOutput)
