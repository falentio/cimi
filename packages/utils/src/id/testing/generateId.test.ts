import { describe, expect, it } from 'vitest'

import { createIdGenerator, generateId } from '../index.ts'
import type { EntityId } from '../index.ts'

describe('generateId', () => {
  it('returns a typed, fixed-width entity id', () => {
    const siteId = generateId('ste')
    const typedSiteId: EntityId<'ste'> = siteId

    expect(typedSiteId).toMatch(/^ste_[a-z2-7]{26}$/)
    expect(typedSiteId.slice('ste_'.length)).toHaveLength(26)
    expect(typedSiteId.slice('ste_'.length)).toMatch(/^[a-z2-7]+$/)
  })

  it('generates distinct ids across repeated calls', () => {
    const first = generateId('ste')
    const second = generateId('ste')

    expect(first).not.toBe(second)
  })

  it('generates distinct ids across an entropy pool refill', () => {
    const ids = Array.from({ length: 5_000 }, () => generateId('ste'))

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toMatch(/^ste_[a-z2-7]{26}$/)
    expect(ids.at(-1)).toMatch(/^ste_[a-z2-7]{26}$/)
  })

  it('rejects prefixes that cannot safely identify an entity', () => {
    expect(() => generateId('')).toThrowError(TypeError)
    expect(() => generateId('site_id')).toThrowError(TypeError)
    expect(() => generateId('site id')).toThrowError(TypeError)
    expect(() => generateId('site')).toThrowError(TypeError)
    expect(() => generateId('organization')).toThrowError(TypeError)
    expect(() => generateId('site-operation')).toThrowError(TypeError)
    expect(() => generateId('ste-opn')).toThrowError(TypeError)
    expect(() => generateId('st')).toThrowError(TypeError)
    expect(() => generateId('stee')).toThrowError(TypeError)
  })

  it('keeps different entity id prefixes incompatible', () => {
    const steId = generateId('ste')
    const userId: EntityId<'usr'> = generateId('usr')

    expect(steId).toMatch(/^ste_/)
    expect(userId).toMatch(/^usr_/)

    // @ts-expect-error Site ids must not be assignable to user ids.
    const invalidUserId: EntityId<'usr'> = steId
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

    expect(generate('ste')).toBe('ste_kdiqaaicamcakbqhbaequcymbu')
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
      generate('ste')
    }
    expect(randomCalls).toBe(1)

    generate('ste')
    expect(randomCalls).toBe(2)
  })
})
