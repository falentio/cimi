import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SId } from '../../../schema/index.ts'
import { SInvitationRole, SInvitationTokenFields } from '../schema.ts'

export const SInvitationAcceptInput = SInvitationTokenFields
export type SInvitationAcceptInput = v.InferOutput<typeof SInvitationAcceptInput>
export const SInvitationAcceptOutput = v.strictObject({
  organizationId: SId,
  userId: SId,
  role: SInvitationRole,
})
export type SInvitationAcceptOutput = v.InferOutput<typeof SInvitationAcceptOutput>

export const acceptInvitation = oc
  .route({ method: 'POST', path: '/acceptInvitation' })
  .meta({ auth: 'authenticated' })
  .errors({ ...ERead, CONFLICT: {} })
  .input(SInvitationAcceptInput)
  .output(SInvitationAcceptOutput)
