import type { Asn, City } from '@maxmind/geoip2-node'
import { Reader } from '@maxmind/geoip2-node'

const DEFAULT_CACHE_SIZE = 10_000

export type LocationResponse = {
  city?: string | undefined
  country?: string | undefined
  region?: string | undefined
  countryIso?: string | undefined
  latitude?: number | undefined
  longitude?: number | undefined
  timeZone?: string | undefined
} | null

export interface AsnInfo {
  asn: number
  organization: string
}

export type AsnLookup = (ip: string) => AsnInfo | null

export interface CreateMaxMindDbOptions {
  cityPath: string
  asnPath?: string
  cacheSize?: number
  onAsnLoadFailure?: (error: unknown, path: string) => void
}

export interface MaxMindDb {
  getLocation(ips: readonly string[]): Promise<Record<string, LocationResponse>>
  lookupAsn(ip: string): AsnInfo | null
}

interface CityReader {
  city(ip: string): City
}

interface AsnReader {
  asn(ip: string): Asn
}

export async function createMaxMindDb(options: CreateMaxMindDbOptions): Promise<MaxMindDb> {
  const cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE
  if (!Number.isInteger(cacheSize) || cacheSize < 1) {
    throw new RangeError('cacheSize must be a positive integer')
  }

  const [cityReader, asnReader] = await Promise.all([
    loadCityReader(options.cityPath, cacheSize),
    loadAsnReader(options.asnPath, cacheSize, options.onAsnLoadFailure),
  ])

  return {
    getLocation: (ips) => getLocation(cityReader, ips),
    lookupAsn: (ip) => lookupAsn(asnReader, ip),
  }
}

export function createAsnLookup(lookup: AsnLookup): AsnLookup {
  const resolved = new Map<string, AsnInfo | null>()

  return (ip) => {
    const cached = resolved.get(ip)
    if (cached !== undefined) return cached

    const info = lookup(ip)
    resolved.set(ip, info)
    return info
  }
}

async function loadCityReader(path: string, cacheSize: number): Promise<CityReader> {
  return (await Reader.open(path, { cache: { max: cacheSize } })) as CityReader
}

async function loadAsnReader(
  path: string | undefined,
  cacheSize: number,
  onFailure: CreateMaxMindDbOptions['onAsnLoadFailure'],
): Promise<AsnReader | null> {
  if (!path) return null

  try {
    return (await Reader.open(path, { cache: { max: cacheSize } })) as AsnReader
  } catch (error) {
    onFailure?.(error, path)
    return null
  }
}

async function getLocation(
  reader: CityReader,
  ips: readonly string[],
): Promise<Record<string, LocationResponse>> {
  const results: Record<string, LocationResponse> = {}

  for (const ip of new Set(ips)) {
    try {
      results[ip] = extractLocationData(reader.city(ip))
    } catch {
      results[ip] = null
    }
  }

  return results
}

function extractLocationData(response: City | null): LocationResponse {
  if (!response) return null

  return {
    city: response.city?.names?.en,
    country: response.country?.names?.en,
    countryIso: response.country?.isoCode,
    latitude: response.location?.latitude,
    longitude: response.location?.longitude,
    timeZone: response.location?.timeZone,
    region: response.subdivisions?.[0]?.isoCode,
  }
}

function lookupAsn(reader: AsnReader | null, ip: string): AsnInfo | null {
  if (!reader || !ip) return null

  try {
    const response = reader.asn(ip)
    if (typeof response.autonomousSystemNumber !== 'number') return null

    return {
      asn: response.autonomousSystemNumber,
      organization: response.autonomousSystemOrganization ?? '',
    }
  } catch {
    return null
  }
}
