import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { readActiveProfileTraits, readProfileTrait } from '../profiles.ts'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'

describe('reporting profile traits', () => {
  it('only exposes active profile traits to report evaluation', () => {
    using fixture = createSiteDrizzleFixture()
    const now = new Date('2026-09-05T00:00:00.000Z')
    fixture.db
      .insert(schema.TIdentityProfile)
      .values([
        {
          profileId: 'prf-active',
          siteId: 'ste_1',
          identifiedUserId: 'usr-active',
          status: 'active',
          profileEpoch: 1,
          traits: { plan: 'pro', account: { tier: 'enterprise' } },
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          profileId: 'prf-deleted',
          siteId: 'ste_1',
          identifiedUserId: 'usr-deleted',
          status: 'deleted',
          profileEpoch: null,
          traits: null,
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run()

    const profiles = readActiveProfileTraits(fixture.db, 'ste_1')
    expect(profiles.has('usr-deleted')).toBe(false)
    expect(readProfileTrait(profiles.get('usr-active'), 'trait.plan')).toBe('pro')
    expect(readProfileTrait(profiles.get('usr-active'), 'trait.account.tier')).toBe('enterprise')
  })
})
