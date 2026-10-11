import { describe, expect, it } from 'vitest'
import { parseUserAgent } from '@cimi/utils'
import { pickSessionAttribution } from './attribution.ts'

const REGISTRY_SIZE = 640

function picks(count: number): readonly ReturnType<typeof pickSessionAttribution>[] {
  return Array.from({ length: count }, (_unused, index) =>
    pickSessionAttribution(() => (index + 0.5) / count),
  )
}

describe('pickSessionAttribution', () => {
  it('returns every value the attribution breakdown reads', () => {
    for (const attribution of picks(REGISTRY_SIZE)) {
      expect(attribution.utmSource.length).toBeGreaterThan(0)
      expect(attribution.utmMedium.length).toBeGreaterThan(0)
      expect(attribution.deviceType.length).toBeGreaterThan(0)
      expect(attribution.browser.length).toBeGreaterThan(0)
      expect(attribution.os.length).toBeGreaterThan(0)
      expect(attribution.country).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('keeps the utm campaign on a subset, the way real traffic does', () => {
    const withCampaign = picks(REGISTRY_SIZE).filter(
      (attribution) => attribution.utmCampaign !== null,
    )

    expect(withCampaign.length).toBeGreaterThan(REGISTRY_SIZE * 0.2)
    expect(withCampaign.length).toBeLessThan(REGISTRY_SIZE * 0.8)
  })

  it('derives device, browser and os from the same parser the live pipeline uses', () => {
    for (const attribution of picks(REGISTRY_SIZE)) {
      const parsed = parseUserAgent(attribution.userAgent)

      expect(attribution.deviceType).toBe(parsed.device.type ?? 'desktop')
      expect(attribution.browser).toBe(parsed.browser.name)
      expect(attribution.os).toBe(parsed.os.name)
    }
  })

  it('spreads the sessions over more than one device, browser and operating system', () => {
    const attributions = picks(REGISTRY_SIZE)

    expect(new Set(attributions.map((attribution) => attribution.deviceType)).size).toBeGreaterThan(
      1,
    )
    expect(new Set(attributions.map((attribution) => attribution.browser)).size).toBeGreaterThan(1)
    expect(new Set(attributions.map((attribution) => attribution.os)).size).toBeGreaterThan(1)
    expect(new Set(attributions.map((attribution) => attribution.country)).size).toBeGreaterThan(1)
  })

  it('gives one session one attribution, so a visitor never changes browser mid-session', () => {
    const attribution = pickSessionAttribution(() => 0.42)
    const userAgent = attribution.userAgent

    expect(pickSessionAttribution(() => 0.42)).toEqual(attribution)
    expect(userAgent.length).toBeGreaterThan(0)
  })
})
