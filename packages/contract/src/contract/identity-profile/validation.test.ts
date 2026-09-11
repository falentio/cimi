import { describe, expect, it } from 'vitest'
import { safeParse } from 'valibot'
import {
  PROFILE_TRAITS_MAX_SERIALIZED_BYTES,
  SIdentifyFields,
  SProfile,
  SProfileTraits,
} from './schema.ts'
import { getProfile } from './query/get.ts'
import { listProfiles } from './query/list.ts'
import { getDeletionStatus } from './query/get-deletion-status.ts'

const timestamps = {
  firstSeenAt: '2026-08-23T00:00:00Z',
  lastSeenAt: '2026-08-23T01:00:00Z',
  createdAt: '2026-08-23T00:00:00Z',
  updatedAt: '2026-08-23T01:00:00Z',
}

const serializedBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength

const exactLimitTraits = () => {
  const traits = Object.fromEntries(
    Array.from({ length: 64 }, (_, index) => [`trait-${index}`, '']),
  ) as Record<string, string>

  for (const key of Object.keys(traits)) {
    while (
      traits[key]!.length < 512 &&
      serializedBytes(traits) < PROFILE_TRAITS_MAX_SERIALIZED_BYTES
    ) {
      traits[key] = `${traits[key]!}x`
    }
  }

  return traits
}

describe('identity profile schemas', () => {
  it('represents active Profile Epoch history', () => {
    expect({
      siteId: 'ste-1',
      identifiedUserId: 'user-1',
      traits: null,
      aliases: [],
      status: 'active',
      profileEpoch: 2,
      identityHistory: [
        {
          epoch: 1,
          status: 'redacted',
          startedAt: timestamps.firstSeenAt,
          endedAt: timestamps.lastSeenAt,
        },
        {
          epoch: 2,
          status: 'active',
          startedAt: timestamps.updatedAt,
          endedAt: null,
        },
      ],
      ...timestamps,
    }).toEqual(expect.schemaMatching(SProfile))
  })

  it('returns only status for every non-active profile state', () => {
    for (const status of ['deletion-requested', 'deleting', 'deleted'] as const) {
      expect({ status }).toEqual(expect.schemaMatching(SProfile))
      expect({ status, identifiedUserId: 'user-1' }).not.toEqual(expect.schemaMatching(SProfile))
    }
  })

  it('enforces the exact serialized Trait byte boundary at identify', () => {
    const traits = exactLimitTraits()
    expect(serializedBytes(traits)).toBe(PROFILE_TRAITS_MAX_SERIALIZED_BYTES)
    expect({
      ingestionIdentifier: 'ing-1',
      identifiedUserId: 'user-1',
      traits,
      collectionContext: { consent: 'granted', gpc: false, dnt: false },
    }).toEqual(expect.schemaMatching(SIdentifyFields))

    const oversizedTraits = { ...traits, 'trait-63': `${traits['trait-63']}x` }
    expect(serializedBytes(oversizedTraits)).toBe(PROFILE_TRAITS_MAX_SERIALIZED_BYTES + 1)
    expect({
      ingestionIdentifier: 'ing-1',
      identifiedUserId: 'user-1',
      traits: oversizedTraits,
    }).not.toEqual(expect.schemaMatching(SIdentifyFields))
  })

  it('rejects prohibited and reserved Trait keys while allowing removal markers', () => {
    for (const key of [
      'password',
      'access_token',
      'creditCardNumber',
      'ethnicity',
      'medicalHistory',
      'profileEpoch',
      'religiousBelief',
      'tradeUnionMembership',
      'identified-user-id',
    ]) {
      expect(safeParse(SProfileTraits, { [key]: 'value' }).success, key).toBe(false)
      expect(safeParse(SProfileTraits, { [key]: null }).success, key).toBe(true)
    }
    expect(safeParse(SProfileTraits, { email: 'person@example.com', name: 'Person' }).success).toBe(
      true,
    )
  })
})

describe('identity profile query admission metadata', () => {
  it('gates profile reads on analytics-read admission', () => {
    expect(listProfiles['~orpc'].meta).toMatchObject({
      auth: 'authenticated',
      admission: 'analytics-read',
    })
    expect(getProfile['~orpc'].meta).toMatchObject({
      auth: 'authenticated',
      admission: 'analytics-read',
    })
  })

  it('keeps deletion status readable during degraded analytics admission', () => {
    expect(getDeletionStatus['~orpc'].meta).toMatchObject({ auth: 'authenticated' })
    expect(getDeletionStatus['~orpc'].meta['admission']).toBeUndefined()
  })
})
