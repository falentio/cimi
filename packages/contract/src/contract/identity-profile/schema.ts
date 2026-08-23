import * as v from 'valibot'
import { SCreated, SDateTime, SId, SScalarMap } from '../../schema/index.ts'

export const SProfileStatus = v.picklist(['active', 'deletion-requested', 'deleting', 'deleted'])
export const SProfileTraits = v.pipe(
  SScalarMap,
  v.check((value) => Object.keys(value).length <= 64, 'Expected at most 64 traits.'),
)
const SProfileLifecycleFields = {
  siteId: SId,
  identifiedUserId: SId,
  firstSeenAt: SDateTime,
  lastSeenAt: SDateTime,
}
const SRedactedProfile = (status: 'deletion-requested' | 'deleting' | 'deleted') =>
  v.strictObject(
    v.entriesFromObjects([
      v.strictObject({
        ...SProfileLifecycleFields,
        traits: v.null(),
        aliases: v.pipe(v.array(v.never()), v.maxLength(0)),
        status: v.literal(status),
      }),
      SCreated,
    ]),
  )
export const SProfile = v.variant('status', [
  v.strictObject(
    v.entriesFromObjects([
      v.strictObject({
        ...SProfileLifecycleFields,
        traits: v.nullable(SProfileTraits),
        aliases: v.pipe(v.array(SId), v.maxLength(128)),
        status: v.literal('active'),
      }),
      SCreated,
    ]),
  ),
  SRedactedProfile('deletion-requested'),
  SRedactedProfile('deleting'),
  SRedactedProfile('deleted'),
])
export const SProfileIdentityFields = v.strictObject({ siteId: SId, identifiedUserId: SId })
export const SIdentifyFields = v.strictObject({
  ingestionIdentifier: SId,
  identifiedUserId: SId,
  traits: v.optional(SProfileTraits),
  anonymousIdentityId: v.optional(SId),
})
