import { parseUserAgent } from '@cimi/utils'
import type { EventInput } from './repository.ts'

export interface DerivedAttribution {
  readonly utmSource: string | null
  readonly utmMedium: string | null
  readonly utmCampaign: string | null
  readonly deviceType: string | null
  readonly browser: string | null
  readonly os: string | null
  readonly country: string | null
}

export function deriveAttribution(
  input: EventInput,
  userAgent: string | undefined,
): DerivedAttribution {
  const device = userAgent === undefined ? null : parseUserAgent(userAgent)
  return {
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
    deviceType: bound(device?.device.type, 64),
    browser: bound(device?.browser.name, 64),
    os: bound(device?.os.name, 64),
    country: null,
  }
}

function bound(value: string | undefined, max: number): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max)
}
