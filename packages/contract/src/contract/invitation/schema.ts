import * as v from 'valibot'
import { SCreated, SDateTime, SId } from '../../schema/index.ts'

export const SInvitationStatus = v.picklist(['pending', 'accepted', 'expired', 'revoked'])
export const SInvitationRole = v.picklist(['admin', 'member'])
export const SInvitation = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      organizationId: SId,
      role: SInvitationRole,
      expiresAt: SDateTime,
      status: SInvitationStatus,
    }),
    SCreated,
  ]),
)
export const SInvitationOrganizationFields = v.strictObject({
  organizationId: SId,
  role: SInvitationRole,
})
export const SInvitationOrganizationScopeFields = v.strictObject({ organizationId: SId })
export const SInvitationIdFields = v.strictObject({ invitationId: SId })
export const SInvitationToken = v.pipe(v.string(), v.minLength(1), v.maxLength(512))
export const SInvitationTokenFields = v.strictObject({
  token: SInvitationToken,
})
