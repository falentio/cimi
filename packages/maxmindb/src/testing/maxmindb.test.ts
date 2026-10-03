import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asn, City } from '@maxmind/geoip2-node'
import type { AsnReader, CityReader, ReaderOpener } from '../index.ts'

import { createAsnLookup, createMaxMindDb } from '../index.ts'

const CITY_PATH = '/data/GeoLite2-City.mmdb'

const ASN_PATH = '/data/GeoLite2-ASN.mmdb'

const IP = '203.0.113.10'

const cityResponses = new Map<string, City>()

const asnResponses = new Map<string, Asn>()

const opened: Array<{ path: string; cacheSize: number }> = []

let cityOpenFailures: Error[] = []

let asnOpenFailures: Error[] = []

function cityReaderFor(ip: string): City {
  const response = cityResponses.get(ip)

  if (!response) throw new Error('address not found')

  return response
}

function asnReaderFor(ip: string): Asn {
  const response = asnResponses.get(ip)

  if (!response) throw new Error('address not found')

  return response
}

const opener: ReaderOpener = {
  async openCityReader(path: string, cacheSize: number): Promise<CityReader> {
    opened.push({ path, cacheSize })
    const failure = cityOpenFailures.shift()

    if (failure) throw failure

    return { city: cityReaderFor }
  },
  async openAsnReader(path: string, cacheSize: number): Promise<AsnReader> {
    opened.push({ path, cacheSize })
    const failure = asnOpenFailures.shift()

    if (failure) throw failure

    return { asn: asnReaderFor }
  },
}

const options = { readerOpener: opener }

beforeEach(() => {
  cityResponses.clear()
  asnResponses.clear()
  opened.length = 0
  cityOpenFailures = []
  asnOpenFailures = []
  // SAFETY: test fixtures provide only the fields the lookup readers below read.
  cityResponses.set(IP, {
    city: { names: { en: 'New York' } },
    country: { names: { en: 'United States' }, isoCode: 'US' },
    location: { latitude: 40.7128, longitude: -74.006, timeZone: 'America/New_York' },
    subdivisions: [{ isoCode: 'NY' }],
  } as City)
  // SAFETY: test fixtures provide only the fields the lookup readers below read.
  asnResponses.set(IP, {
    autonomousSystemNumber: 13335,
    autonomousSystemOrganization: 'Cloudflare',
  } as Asn)
})

describe('createMaxMindDb', () => {
  it('maps city data and resolves each requested IP once', async () => {
    const maxmindb = await createMaxMindDb({ cityPath: CITY_PATH, asnPath: ASN_PATH, ...options })

    expect(opened).toEqual([
      { path: CITY_PATH, cacheSize: 10000 },
      { path: ASN_PATH, cacheSize: 10000 },
    ])
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
  })

  it('fails when the required city database cannot be loaded', async () => {
    cityOpenFailures = [new Error('city database missing')]

    await expect(createMaxMindDb({ cityPath: CITY_PATH, ...options })).rejects.toThrow(
      'city database missing',
    )
  })

  it('disables ASN lookups when the optional database cannot be loaded', async () => {
    const onAsnLoadFailure = vi.fn()
    asnOpenFailures = [new Error('asn database missing')]

    const maxmindb = await createMaxMindDb({
      cityPath: CITY_PATH,
      asnPath: ASN_PATH,
      onAsnLoadFailure,
      ...options,
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
    await createMaxMindDb({ cityPath: CITY_PATH, cacheSize: 64, ...options })

    expect(opened).toEqual([{ path: CITY_PATH, cacheSize: 64 }])
  })

  it('maps ASN data and treats failed lookups as unavailable', async () => {
    const maxmindb = await createMaxMindDb({ cityPath: CITY_PATH, asnPath: ASN_PATH, ...options })

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
