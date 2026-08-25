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
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    OWNER_PROTECTED: { status: 409 },
  })
  .input(SMembershipChangeRoleInput)
  .output(SMembershipChangeRoleOutput)
