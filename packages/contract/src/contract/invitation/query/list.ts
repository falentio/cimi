import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead, SCursor, SPaginationInput } from '../../../schema/index.ts'
import { SInvitation, SInvitationOrganizationFields } from '../schema.ts'

export const SInvitationListInput = v.strictObject(
  v.entriesFromObjects([SInvitationOrganizationFields, SPaginationInput]),
)
export type SInvitationListInput = v.InferOutput<typeof SInvitationListInput>
export const SInvitationListOutput = v.strictObject({
  items: v.array(SInvitation),
  nextCursor: v.nullable(SCursor),
})
export type SInvitationListOutput = v.InferOutput<typeof SInvitationListOutput>

export const listInvitations = oc
  .route({ method: 'GET', path: '/listInvitations' })
  .meta({ auth: 'admin' })
  .errors(ERead)
  .input(SInvitationListInput)
  .output(SInvitationListOutput)
