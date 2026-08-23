import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SMembership, SMembershipChangeRoleFields } from '../schema.ts'

export const SMembershipChangeRoleInput = SMembershipChangeRoleFields
export type SMembershipChangeRoleInput = v.InferOutput<typeof SMembershipChangeRoleInput>
export const SMembershipChangeRoleOutput = SMembership
export type SMembershipChangeRoleOutput = v.InferOutput<typeof SMembershipChangeRoleOutput>

export const changeMemberRole = oc
  .route({ method: 'POST', path: '/changeMemberRole' })
  .meta({ auth: 'admin' })
  .errors({ ...ECommand, OWNER_PROTECTED: {} })
  .input(SMembershipChangeRoleInput)
  .output(SMembershipChangeRoleOutput)
