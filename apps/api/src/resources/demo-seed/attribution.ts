import { parseUserAgent } from '@cimi/utils'

/**
 * One session keeps one attribution for its whole life: a visitor does not change browser or
 * operating system mid-session, and utm describes the click that started the session.
 */
export interface SessionAttribution {
  readonly userAgent: string
  readonly utmSource: string
  readonly utmMedium: string
  readonly utmCampaign: string | null
  readonly deviceType: string
  readonly browser: string
  readonly os: string
  readonly country: string
}

interface Campaign {
  readonly utmSource: string
  readonly utmMedium: string
  readonly utmCampaign: string | null
}

const USER_AGENTS: readonly string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
]

const CAMPAIGNS: readonly Campaign[] = [
  { utmSource: 'google', utmMedium: 'organic', utmCampaign: null },
  { utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'spring-sale' },
  { utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'retargeting' },
  { utmSource: 'newsletter', utmMedium: 'email', utmCampaign: 'product-update' },
  { utmSource: 'newsletter', utmMedium: 'email', utmCampaign: null },
  { utmSource: 'twitter', utmMedium: 'social', utmCampaign: null },
  { utmSource: 'linkedin', utmMedium: 'social', utmCampaign: 'hiring' },
  { utmSource: 'github', utmMedium: 'referral', utmCampaign: 'readme' },
]

const COUNTRIES: readonly string[] = ['US', 'DE', 'GB', 'FR', 'IN', 'BR', 'JP', 'CA']

/**
 * The parser omits the desktop form factor instead of naming it, and the live pipeline reads that
 * omission as null, which would leave the device breakdown empty on every desktop session.
 */
const DESKTOP_DEVICE_TYPE = 'desktop'

const ATTRIBUTIONS: readonly SessionAttribution[] = buildAttributions()

export function pickSessionAttribution(random: () => number): SessionAttribution {
  return ATTRIBUTIONS[Math.floor(random() * ATTRIBUTIONS.length)]!
}

function buildAttributions(): readonly SessionAttribution[] {
  return USER_AGENTS.flatMap((userAgent) => {
    const parsed = parseUserAgent(userAgent)

    const client = {
      userAgent,
      deviceType: attributedText(parsed.device.type ?? DESKTOP_DEVICE_TYPE, userAgent),
      browser: attributedText(parsed.browser.name, userAgent),
      os: attributedText(parsed.os.name, userAgent),
    }

    return CAMPAIGNS.flatMap((campaign) =>
      COUNTRIES.map((country) => ({ ...client, ...campaign, country })),
    )
  })
}

function attributedText(value: string | undefined, userAgent: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `The user agent registry holds an agent the parser cannot attribute: ${userAgent}`,
    )
  }

  return value
}
