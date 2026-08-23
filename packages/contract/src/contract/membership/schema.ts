import * as v from 'valibot'
import { SCreated, SId } from '../../schema/index.ts'

export const SMembershipRole = v.picklist(['owner', 'admin', 'member'])
export const SMembershipMemberRole = v.picklist(['admin', 'member'])
export const SMembership = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({ organizationId: SId, userId: SId, role: SMembershipRole }),
    SCreated,
  ]),
)
export const SMembershipTargetFields = v.strictObject({ organizationId: SId, userId: SId })
export const SMembershipOrganizationFields = v.pick(SMembershipTargetFields, ['organizationId'])
export const SMembershipChangeRoleFields = v.strictObject(
  v.entriesFromObjects([SMembershipTargetFields, v.strictObject({ role: SMembershipMemberRole })]),
)
