import * as v from 'valibot'
import { SCreated, SId } from '../../schema/index.ts'

export const SInvitationStatus = v.picklist(['pending', 'accepted', 'expired', 'revoked'])
export const SInvitationRole = v.picklist(['admin', 'member'])
export const SInvitation = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      organizationId: SId,
      role: SInvitationRole,
      expiresAt: v.string(),
      status: SInvitationStatus,
    }),
    SCreated,
  ]),
)
export const SInvitationOrganizationFields = v.strictObject({
  organizationId: SId,
  role: SInvitationRole,
})
export const SInvitationIdFields = v.strictObject({ invitationId: SId })
export const SInvitationTokenFields = v.strictObject({
  token: v.pipe(v.string(), v.minLength(1), v.maxLength(512)),
})
