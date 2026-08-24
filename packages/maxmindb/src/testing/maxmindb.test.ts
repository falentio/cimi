import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  city: vi.fn(),
  asn: vi.fn(),
}))

vi.mock('@maxmind/geoip2-node', () => ({
  Reader: {
    open: mocks.open,
  },
}))

import { createAsnLookup, createMaxMindDb } from '../index.ts'

const CITY_PATH = '/data/GeoLite2-City.mmdb'
const ASN_PATH = '/data/GeoLite2-ASN.mmdb'
const IP = '203.0.113.10'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.open.mockResolvedValueOnce({ city: mocks.city }).mockResolvedValueOnce({ asn: mocks.asn })
  mocks.city.mockReset()
  mocks.asn.mockReset()
})

describe('createMaxMindDb', () => {
  it('maps city data and resolves each requested IP once', async () => {
    mocks.city.mockImplementation((ip: string) => {
      if (ip === IP) {
        return {
          city: { names: { en: 'New York' } },
          country: { names: { en: 'United States' }, isoCode: 'US' },
          location: { latitude: 40.7128, longitude: -74.006, timeZone: 'America/New_York' },
          subdivisions: [{ isoCode: 'NY' }],
        }
      }

      throw new Error('address not found')
    })

    const maxmindb = await createMaxMindDb({ cityPath: CITY_PATH, asnPath: ASN_PATH })

    expect(mocks.open).toHaveBeenNthCalledWith(1, CITY_PATH, { cache: { max: 10000 } })
    expect(mocks.open).toHaveBeenNthCalledWith(2, ASN_PATH, { cache: { max: 10000 } })
    await expect(maxmindb.getLocation([IP, IP, '198.51.100.10'])).resolves.toEqual({
      [IP]: {
        city: 'New York',
        country: 'United States',
        countryIso: 'US',
        latitude: 40.7128,
        longitude: -74.006,
        region: 'NY',
        timeZone: 'America/New_York',
      },
      '198.51.100.10': null,
    })
    expect(mocks.city).toHaveBeenCalledTimes(2)
  })

  it('fails when the required city database cannot be loaded', async () => {
    mocks.open.mockReset()
    mocks.open.mockRejectedValueOnce(new Error('city database missing'))

    await expect(createMaxMindDb({ cityPath: CITY_PATH })).rejects.toThrow('city database missing')
  })

  it('disables ASN lookups when the optional database cannot be loaded', async () => {
    const onAsnLoadFailure = vi.fn()
    mocks.open.mockReset()
    mocks.open
      .mockResolvedValueOnce({ city: mocks.city })
      .mockRejectedValueOnce(new Error('asn database missing'))

    const maxmindb = await createMaxMindDb({
      cityPath: CITY_PATH,
      asnPath: ASN_PATH,
      onAsnLoadFailure,
    })

    expect(maxmindb.lookupAsn(IP)).toBeNull()
    expect(onAsnLoadFailure).toHaveBeenCalledWith(expect.any(Error), ASN_PATH)
  })

  it('rejects an unbounded or invalid reader cache size', async () => {
    await expect(createMaxMindDb({ cityPath: CITY_PATH, cacheSize: 0 })).rejects.toThrow(
      'cacheSize must be a positive integer',
    )
    await expect(createMaxMindDb({ cityPath: CITY_PATH, cacheSize: 1.5 })).rejects.toThrow(
      'cacheSize must be a positive integer',
    )
  })

  it('uses a caller-provided bounded reader cache size', async () => {
    await createMaxMindDb({ cityPath: CITY_PATH, cacheSize: 64 })

    expect(mocks.open).toHaveBeenCalledWith(CITY_PATH, { cache: { max: 64 } })
  })

  it('maps ASN data and treats failed lookups as unavailable', async () => {
    mocks.asn.mockImplementation((ip: string) => {
      if (ip === IP) {
        return {
          autonomousSystemNumber: 13335,
          autonomousSystemOrganization: 'Cloudflare',
        }
      }

      throw new Error('address not found')
    })

    const maxmindb = await createMaxMindDb({ cityPath: CITY_PATH, asnPath: ASN_PATH })

    expect(maxmindb.lookupAsn(IP)).toEqual({ asn: 13335, organization: 'Cloudflare' })
    expect(maxmindb.lookupAsn('198.51.100.10')).toBeNull()
    expect(maxmindb.lookupAsn('')).toBeNull()
  })
})

describe('createAsnLookup', () => {
  it('memoizes successful and unavailable results for one resolver', () => {
    const lookup = vi.fn((ip: string) =>
      ip === IP ? null : { asn: 13335, organization: 'Cloudflare' },
    )
    const memoizedLookup = createAsnLookup(lookup)

    expect(memoizedLookup(IP)).toBeNull()
    expect(memoizedLookup(IP)).toBeNull()
    expect(memoizedLookup('198.51.100.10')).toEqual({ asn: 13335, organization: 'Cloudflare' })
    expect(memoizedLookup('198.51.100.10')).toEqual({ asn: 13335, organization: 'Cloudflare' })
    expect(lookup).toHaveBeenCalledTimes(2)
  })
})
