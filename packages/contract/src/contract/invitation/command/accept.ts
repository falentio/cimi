import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SInvitationTokenFields } from '../schema.ts'
import { SMembershipNonOwner } from '../../membership/schema.ts'

export const SInvitationAcceptInput = SInvitationTokenFields
export type SInvitationAcceptInput = v.InferOutput<typeof SInvitationAcceptInput>
export const SInvitationAcceptOutput = SMembershipNonOwner
export type SInvitationAcceptOutput = v.InferOutput<typeof SInvitationAcceptOutput>

export const acceptInvitation = oc
  .route({
    method: 'POST',
    path: '/invitation/acceptInvitation',
    operationId: 'acceptInvitation',
    summary: 'Accept an invitation',
    description:
      'Consume a custom bearer token for an authenticated User and reconcile the invitation-defined Organization membership.',
    tags: ['invitation'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: {},
    NOT_FOUND: {},
    CONFLICT: {},
  })
  .input(SInvitationAcceptInput)
  .output(SInvitationAcceptOutput)
