import { describe, expect, it } from 'vitest'

import { createIdGenerator, generateId } from '../index.ts'
import type { EntityId } from '../index.ts'

describe('generateId', () => {
  it('returns a typed, fixed-width entity id', () => {
    const siteId = generateId('site')
    const typedSiteId: EntityId<'site'> = siteId

    expect(typedSiteId).toMatch(/^site_[a-z2-7]{26}$/)
    expect(typedSiteId.slice('site_'.length)).toHaveLength(26)
    expect(typedSiteId.slice('site_'.length)).toMatch(/^[a-z2-7]+$/)
  })

  it('generates distinct ids across repeated calls', () => {
    const first = generateId('site')
    const second = generateId('site')

    expect(first).not.toBe(second)
  })

  it('generates distinct ids across an entropy pool refill', () => {
    const ids = Array.from({ length: 5_000 }, () => generateId('site'))

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toMatch(/^site_[a-z2-7]{26}$/)
    expect(ids.at(-1)).toMatch(/^site_[a-z2-7]{26}$/)
  })

  it('rejects prefixes that cannot safely identify an entity', () => {
    expect(() => generateId('')).toThrowError(TypeError)
    expect(() => generateId('site_id')).toThrowError(TypeError)
    expect(() => generateId('site id')).toThrowError(TypeError)
  })

  it('keeps different entity id prefixes incompatible', () => {
    const siteId = generateId('site')
    const userId: EntityId<'user'> = generateId('user')

    expect(siteId).toMatch(/^site_/)
    expect(userId).toMatch(/^user_/)

    // @ts-expect-error Site ids must not be assignable to user ids.
    const invalidUserId: EntityId<'user'> = siteId
    void invalidUserId
  })
})

describe('createIdGenerator', () => {
  it('combines the day fragment and entropy into one fixed-width Base32 value', () => {
    let randomCalls = 0
    const now = Date.UTC(2026, 7, 24)
    const generate = createIdGenerator({
      now: () => now,
      getRandomValues: (bytes) => {
        randomCalls += 1
        bytes.forEach((_, index) => {
          bytes[index] = index % 256
        })
      },
    })

    expect(generate('site')).toBe('site_kdiqaaicamcakbqhbaequcymbu')
    expect(randomCalls).toBe(1)
  })

  it('uses one random pool fill until the pool cannot satisfy an id', () => {
    let randomCalls = 0
    const generate = createIdGenerator({
      getRandomValues: (bytes) => {
        randomCalls += 1
        bytes.fill(randomCalls)
      },
    })

    for (let index = 0; index < 4_681; index += 1) {
      generate('site')
    }
    expect(randomCalls).toBe(1)

    generate('site')
    expect(randomCalls).toBe(2)
  })
})
