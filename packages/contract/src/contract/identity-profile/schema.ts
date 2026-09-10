import * as v from 'valibot'
import { SCreated, SDateTime, SId, SScalarMap } from '../../schema/index.ts'
import { SCollectionContext } from '../collection-policy/transport.ts'

export const SProfileStatus = v.picklist(['active', 'deletion-requested', 'deleting', 'deleted'])
export const PROFILE_TRAITS_MAX_SERIALIZED_BYTES = 16 * 1024
export const PROFILE_EPOCH_HISTORY_MAX = 32
export const PROFILE_EPOCH_NUMBER_MAX = 2_147_483_647
const PROFILE_TRAITS_SIZE_ERROR = `Serialized traits must not exceed ${PROFILE_TRAITS_MAX_SERIALIZED_BYTES} UTF-8 bytes.`
const PROFILE_TRAIT_RESERVED_KEYS = new Set([
  'aliases',
  'backupcleanup',
  'createdat',
  'deletionstatus',
  'derivedcleanup',
  'firstseenat',
  'identifieduserid',
  'identityhistory',
  'lastseenat',
  'profile',
  'profileepoch',
  'profileid',
  'redaction',
  'siteid',
  'status',
  'traits',
  'updatedat',
])
const PROFILE_TRAIT_PROHIBITED_KEY_PARTS = [
  'accesstoken',
  'apikey',
  'bankaccount',
  'bearer',
  'biometric',
  'cardnumber',
  'clientsecret',
  'creditcard',
  'credential',
  'cvv',
  'cvc',
  'diagnos',
  'ethnicorigin',
  'ethnicity',
  'genderidentity',
  'genetic',
  'health',
  'iban',
  'medical',
  'passcode',
  'password',
  'payment',
  'philosophicalbelief',
  'political',
  'privatekey',
  'race',
  'religion',
  'religiousbelief',
  'refreshtoken',
  'routingnumber',
  'secret',
  'securitycode',
  'sexlife',
  'sexualorientation',
  'socialsecurity',
  'ssn',
  'taxid',
  'token',
  'tradeunion',
  'unionmembership',
]
export const SDeletionCleanupStatus = v.strictObject({
  status: v.picklist(['not-required', 'pending', 'complete']),
  updatedAt: SDateTime,
})
export const SProfileTraits = v.pipe(
  SScalarMap,
  v.check((value) => Object.keys(value).length <= 64, 'Expected at most 64 traits.'),
  v.check(
    (value) => hasAllowedProfileTraitKeys(value),
    'Traits contain a prohibited or reserved key.',
  ),
  v.check(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).byteLength <=
      PROFILE_TRAITS_MAX_SERIALIZED_BYTES,
    PROFILE_TRAITS_SIZE_ERROR,
  ),
)

export function isProfileTraitKeyAllowed(key: string): boolean {
  const normalized = key.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
  if (PROFILE_TRAIT_RESERVED_KEYS.has(normalized)) return false
  return !PROFILE_TRAIT_PROHIBITED_KEY_PARTS.some((part) => normalized.includes(part))
}

export function hasAllowedProfileTraitKeys(
  value: Readonly<Record<string, unknown>> | undefined,
): boolean {
  return (
    value === undefined ||
    Object.entries(value).every(([key, trait]) => trait === null || isProfileTraitKeyAllowed(key))
  )
}

export function isProfileTraitsPayloadOversized(value: unknown): boolean {
  const parsed = v.safeParse(SScalarMap, value)
  return (
    parsed.success &&
    Object.keys(parsed.output).length <= 64 &&
    new TextEncoder().encode(JSON.stringify(parsed.output)).byteLength >
      PROFILE_TRAITS_MAX_SERIALIZED_BYTES
  )
}
const SProfileEpochFields = {
  epoch: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(PROFILE_EPOCH_NUMBER_MAX)),
  startedAt: SDateTime,
}
export const SProfileEpoch = v.variant('status', [
  v.strictObject({ ...SProfileEpochFields, status: v.literal('active'), endedAt: v.null() }),
  v.strictObject({ ...SProfileEpochFields, status: v.literal('redacted'), endedAt: SDateTime }),
])
const SIdentityHistory = v.pipe(
  v.array(SProfileEpoch),
  v.minLength(1),
  v.maxLength(PROFILE_EPOCH_HISTORY_MAX),
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
        profileEpoch: v.pipe(
          v.number(),
          v.integer(),
          v.minValue(1),
          v.maxValue(PROFILE_EPOCH_NUMBER_MAX),
        ),
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
