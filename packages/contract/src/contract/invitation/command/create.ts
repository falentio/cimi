import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SInvitation, SInvitationOrganizationFields } from '../schema.ts'

export const SInvitationCreateInput = SInvitationOrganizationFields
export type SInvitationCreateInput = v.InferOutput<typeof SInvitationCreateInput>
export const SInvitationCreateOutput = v.strictObject({
  invitation: SInvitation,
  token: v.string(),
})
export type SInvitationCreateOutput = v.InferOutput<typeof SInvitationCreateOutput>

export const createInvitation = oc
  .route({ method: 'POST', path: '/createInvitation' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SInvitationCreateInput)
  .output(SInvitationCreateOutput)
