import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SMembershipOrganizationFields } from '../schema.ts'

export const SMembershipLeaveInput = SMembershipOrganizationFields
export type SMembershipLeaveInput = v.InferOutput<typeof SMembershipLeaveInput>
export const SMembershipLeaveOutput = v.void()
export type SMembershipLeaveOutput = v.InferOutput<typeof SMembershipLeaveOutput>

export const leaveOrganization = oc
  .route({
    method: 'POST',
    path: '/membership/leaveOrganization',
    operationId: 'leaveOrganization',
    summary: 'Leave an organization',
    description:
      'Allow the current member to leave an Organization unless ownership protection prevents it.',
    tags: ['membership'],
    successStatus: 204,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: {},
    NOT_FOUND: {},
    CONFLICT: {},
    OWNER_PROTECTED: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SMembershipLeaveInput)
  .output(SMembershipLeaveOutput)
