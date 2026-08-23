import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SMembershipOrganizationFields } from '../schema.ts'

export const SMembershipLeaveInput = SMembershipOrganizationFields
export type SMembershipLeaveInput = v.InferOutput<typeof SMembershipLeaveInput>
export const SMembershipLeaveOutput = v.strictObject({ left: v.literal(true) })
export type SMembershipLeaveOutput = v.InferOutput<typeof SMembershipLeaveOutput>

export const leaveOrganization = oc
  .route({ method: 'POST', path: '/leaveOrganization' })
  .meta({ auth: 'authenticated' })
  .errors({ ...ERead, OWNER_PROTECTED: {} })
  .input(SMembershipLeaveInput)
  .output(SMembershipLeaveOutput)
