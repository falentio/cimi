import { parseUserAgent, type EventAttribution } from '@cimi/utils'
import type { EventInput } from './repository.ts'

export type DerivedAttribution = EventAttribution

export function deriveAttribution(
  input: EventInput,
  userAgent: string | undefined,
  country?: string,
): DerivedAttribution {
  const device = userAgent === undefined ? null : parseUserAgent(userAgent)
  return {
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
    deviceType: bound(device?.device.type, 64),
    browser: bound(device?.browser.name, 64),
    os: bound(device?.os.name, 64),
    country: bound(country, 64),
  }
}

function bound(value: string | undefined, max: number): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max)
}
