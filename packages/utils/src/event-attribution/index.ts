import { isRecord } from '../canonical-json/index.ts'

export interface EventAttribution {
  readonly utmSource: string | null
  readonly utmMedium: string | null
  readonly utmCampaign: string | null
  readonly deviceType: string | null
  readonly browser: string | null
  readonly os: string | null
  readonly country: string | null
}

export function parseEventAttribution(payload: string | null | undefined): EventAttribution {
  if (payload === null || payload === undefined) return emptyEventAttribution()
  try {
    const parsed: unknown = JSON.parse(payload)
    if (!isRecord(parsed)) return emptyEventAttribution()
    return {
      utmSource: stringValue(parsed['utmSource']),
      utmMedium: stringValue(parsed['utmMedium']),
      utmCampaign: stringValue(parsed['utmCampaign']),
      deviceType: stringValue(parsed['deviceType']),
      browser: stringValue(parsed['browser']),
      os: stringValue(parsed['os']),
      country: stringValue(parsed['country']),
    }
  } catch {
    return emptyEventAttribution()
  }
}

export function mergeEventAttribution(
  primary: Partial<EventAttribution> | undefined,
  fallback: EventAttribution,
): EventAttribution {
  return {
    utmSource: primary?.utmSource ?? fallback.utmSource,
    utmMedium: primary?.utmMedium ?? fallback.utmMedium,
    utmCampaign: primary?.utmCampaign ?? fallback.utmCampaign,
    deviceType: primary?.deviceType ?? fallback.deviceType,
    browser: primary?.browser ?? fallback.browser,
    os: primary?.os ?? fallback.os,
    country: primary?.country ?? fallback.country,
  }
}

function emptyEventAttribution(): EventAttribution {
  return {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    deviceType: null,
    browser: null,
    os: null,
    country: null,
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
