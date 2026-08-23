import * as v from 'valibot'
import { SCreated, SDateTime, SId, SScalarMap } from '../../schema/index.ts'

export const SProfileStatus = v.picklist(['active', 'deletion_requested', 'deleting', 'deleted'])
export const SProfile = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      siteId: SId,
      identifiedUserId: SId,
      traits: SScalarMap,
      aliases: v.array(SId),
      status: SProfileStatus,
      firstSeenAt: SDateTime,
      lastSeenAt: SDateTime,
    }),
    SCreated,
  ]),
)
export const SProfileIdentityFields = v.strictObject({ siteId: SId, identifiedUserId: SId })
export const SIdentifyFields = v.strictObject({
  ingestionIdentifier: SId,
  identifiedUserId: SId,
  traits: v.optional(SScalarMap),
  anonymousIdentityId: v.optional(SId),
})
