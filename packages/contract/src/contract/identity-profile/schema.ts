import * as v from 'valibot'
import { SCreated, SDateTime, SId, SScalarMap } from '../../schema/index.ts'
import { SCollectionContext } from '../collection-policy/transport.ts'

export const SProfileStatus = v.picklist(['active', 'deletion-requested', 'deleting', 'deleted'])
export const PROFILE_TRAITS_MAX_SERIALIZED_BYTES = 16 * 1024
export const SDeletionCleanupStatus = v.strictObject({
  status: v.picklist(['not-required', 'pending', 'complete']),
  updatedAt: SDateTime,
})
export const SProfileTraits = v.pipe(
  SScalarMap,
  v.check((value) => Object.keys(value).length <= 64, 'Expected at most 64 traits.'),
  v.check(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).byteLength <=
      PROFILE_TRAITS_MAX_SERIALIZED_BYTES,
    `Serialized traits must not exceed ${PROFILE_TRAITS_MAX_SERIALIZED_BYTES} UTF-8 bytes.`,
  ),
)
const SProfileEpochFields = {
  epoch: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2_147_483_647)),
  startedAt: SDateTime,
}
export const SProfileEpoch = v.variant('status', [
  v.strictObject({ ...SProfileEpochFields, status: v.literal('active'), endedAt: v.null() }),
  v.strictObject({ ...SProfileEpochFields, status: v.literal('redacted'), endedAt: SDateTime }),
])
const SIdentityHistory = v.pipe(
  v.array(SProfileEpoch),
  v.minLength(1),
  v.maxLength(32),
  v.check(
    (history) => new Set(history.map((entry) => entry.epoch)).size === history.length,
    'Profile Epoch numbers must be unique.',
  ),
)
const SProfileLifecycleFields = {
  siteId: SId,
  identifiedUserId: SId,
  firstSeenAt: SDateTime,
  lastSeenAt: SDateTime,
}
const SRedactedProfile = (status: 'deletion-requested' | 'deleting' | 'deleted') =>
  v.strictObject({ status: v.literal(status) })
export const SProfile = v.variant('status', [
  v.strictObject(
    v.entriesFromObjects([
      v.strictObject({
        ...SProfileLifecycleFields,
        traits: v.nullable(SProfileTraits),
        aliases: v.pipe(v.array(SId), v.maxLength(128)),
        profileEpoch: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2_147_483_647)),
        identityHistory: SIdentityHistory,
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
  collectionContext: v.optional(SCollectionContext),
})
