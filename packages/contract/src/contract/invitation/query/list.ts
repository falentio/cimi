import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOffsetPage, SOffsetPaginationInput, SPageItems } from '../../../schema/index.ts'
import { SInvitation, SInvitationOrganizationScopeFields } from '../schema.ts'

export const SInvitationListInput = v.strictObject(
  v.entriesFromObjects([SInvitationOrganizationScopeFields, SOffsetPaginationInput]),
)
export type SInvitationListInput = v.InferOutput<typeof SInvitationListInput>
export const SInvitationListOutput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ items: SPageItems(SInvitation) }), SOffsetPage]),
)
export type SInvitationListOutput = v.InferOutput<typeof SInvitationListOutput>

export const listInvitations = oc
  .route({
    method: 'GET',
    path: '/invitation/listInvitations',
    operationId: 'listInvitations',
    summary: 'List invitations',
    description: 'List token-free invitation records for an Organization.',
    tags: ['invitation'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
  })
  .input(SInvitationListInput)
  .output(SInvitationListOutput)
