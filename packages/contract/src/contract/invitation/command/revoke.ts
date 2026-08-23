import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SInvitationIdFields } from '../schema.ts'

export const SInvitationRevokeInput = SInvitationIdFields
export type SInvitationRevokeInput = v.InferOutput<typeof SInvitationRevokeInput>
export const SInvitationRevokeOutput = v.void()
export type SInvitationRevokeOutput = v.InferOutput<typeof SInvitationRevokeOutput>

export const revokeInvitation = oc
  .route({
    method: 'POST',
    path: '/revokeInvitation',
    operationId: 'revokeInvitation',
    summary: 'Revoke an invitation',
    description: 'Revoke a pending Organization invitation without exposing its bearer token.',
    tags: ['invitation'],
    successStatus: 204,
  })
  .meta({ auth: 'admin' })
  .errors({ ...ECommand, INVITATION_CONSUMED: { status: 409 } })
  .input(SInvitationRevokeInput)
  .output(SInvitationRevokeOutput)
