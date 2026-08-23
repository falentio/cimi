import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SInvitationTokenFields } from '../schema.ts'
import { SMembership } from '../../membership/schema.ts'

export const SInvitationAcceptInput = SInvitationTokenFields
export type SInvitationAcceptInput = v.InferOutput<typeof SInvitationAcceptInput>
export const SInvitationAcceptOutput = SMembership
export type SInvitationAcceptOutput = v.InferOutput<typeof SInvitationAcceptOutput>

export const acceptInvitation = oc
  .route({
    method: 'POST',
    path: '/acceptInvitation',
    operationId: 'acceptInvitation',
    summary: 'Accept an invitation',
    description:
      'Consume an invitation token and create the invitation-defined Organization membership.',
    tags: ['invitation'],
  })
  .meta({ auth: 'authenticated' })
  .errors({ ...ERead, CONFLICT: { status: 409 } })
  .input(SInvitationAcceptInput)
  .output(SInvitationAcceptOutput)
