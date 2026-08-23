import * as v from 'valibot'
import { SCreated, SId, SName } from '../../schema/index.ts'

export const SOrganization = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      name: SName,
      ownerUserId: SId,
      isPersonal: v.boolean(),
    }),
    SCreated,
  ]),
)
export const SOrganizationIdentityFields = v.strictObject({ organizationId: SId })
export const SOrganizationNameFields = v.strictObject({ organizationId: SId, name: SName })
