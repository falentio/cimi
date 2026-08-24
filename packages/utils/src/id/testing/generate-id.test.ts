import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EntityId } from '../index.ts'

const ENTROPY_BYTES = 14
const POOL_SIZE = 65_536
const ID_FRAGMENT_LENGTH = 26

async function loadIdModule() {
  vi.resetModules()
  return await import('../index.ts')
}

function mockRandomValues() {
  let call = 0
  return vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (call + index) % 256
    }
    call += 1
    return array
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('generateId', () => {
  it('returns a typed, fixed-width entity id', async () => {
    const now = Date.UTC(2026, 7, 24)
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const randomValues = mockRandomValues()
    const { generateId } = await loadIdModule()

    const siteId = generateId('site')
    const typedSiteId: EntityId<'site'> = siteId

    expect(typedSiteId).toBe('site_kdiqaaicamcakbqhbaequcymbu')
    expect(typedSiteId.slice('site_'.length)).toHaveLength(ID_FRAGMENT_LENGTH)
    expect(typedSiteId.slice('site_'.length)).toMatch(/^[a-z2-7]+$/)
    expect(randomValues).toHaveBeenCalledTimes(1)
    expect(randomValues.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array)
    expect(randomValues.mock.calls[0]?.[0].byteLength).toBe(POOL_SIZE)
  })

  it('reuses the entropy pool between ids', async () => {
    const randomValues = mockRandomValues()
    const { generateId } = await loadIdModule()

    const first = generateId('site')
    const second = generateId('site')

    expect(first).not.toBe(second)
    expect(randomValues).toHaveBeenCalledTimes(1)
  })

  it('refills the pool when fewer than 14 bytes remain', async () => {
    const randomValues = mockRandomValues()
    const { generateId } = await loadIdModule()

    for (let index = 0; index < Math.floor(POOL_SIZE / ENTROPY_BYTES); index += 1) {
      generateId('site')
    }
    expect(randomValues).toHaveBeenCalledTimes(1)

    generateId('site')
    expect(randomValues).toHaveBeenCalledTimes(2)
  })

  it('rejects prefixes that cannot safely identify an entity', async () => {
    const { generateId } = await loadIdModule()

    expect(() => generateId('')).toThrowError(TypeError)
    expect(() => generateId('site_id')).toThrowError(TypeError)
    expect(() => generateId('site id')).toThrowError(TypeError)
  })

  it('keeps different entity id prefixes incompatible', async () => {
    const { generateId } = await loadIdModule()

    const siteId = generateId('site')
    const userId: EntityId<'user'> = generateId('user')

    expect(siteId).toMatch(/^site_/)
    expect(userId).toMatch(/^user_/)

    // @ts-expect-error Site ids must not be assignable to user ids.
    const invalidUserId: EntityId<'user'> = siteId
    void invalidUserId
  })
})
