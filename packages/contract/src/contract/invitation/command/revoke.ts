import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SInvitationIdFields } from '../schema.ts'

export const SInvitationRevokeInput = SInvitationIdFields
export type SInvitationRevokeInput = v.InferOutput<typeof SInvitationRevokeInput>
export const SInvitationRevokeOutput = v.strictObject({ revoked: v.literal(true) })
export type SInvitationRevokeOutput = v.InferOutput<typeof SInvitationRevokeOutput>

export const revokeInvitation = oc
  .route({ method: 'POST', path: '/revokeInvitation' })
  .meta({ auth: 'admin' })
  .errors({ ...ECommand, INVITATION_CONSUMED: {} })
  .input(SInvitationRevokeInput)
  .output(SInvitationRevokeOutput)
