import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SMembershipOrganizationFields } from '../schema.ts'

export const SMembershipLeaveInput = SMembershipOrganizationFields
export type SMembershipLeaveInput = v.InferOutput<typeof SMembershipLeaveInput>
export const SMembershipLeaveOutput = v.void()
export type SMembershipLeaveOutput = v.InferOutput<typeof SMembershipLeaveOutput>

export const leaveOrganization = oc
  .route({
    method: 'POST',
    path: '/leaveOrganization',
    operationId: 'leaveOrganization',
    summary: 'Leave an organization',
    description:
      'Allow the current member to leave an Organization unless ownership protection prevents it.',
    tags: ['membership'],
    successStatus: 204,
  })
  .meta({ auth: 'authenticated' })
  .errors({ ...ERead, OWNER_PROTECTED: { status: 409 } })
  .input(SMembershipLeaveInput)
  .output(SMembershipLeaveOutput)
