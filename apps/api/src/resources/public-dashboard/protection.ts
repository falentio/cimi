export type PublicDashboardRateLimitScope = 'site' | 'ip'

export interface PublicDashboardRateLimitInput {
  readonly siteId: string
  readonly sourceIp: string
  readonly now: Date
}

export interface PublicDashboardRateLimitFailure {
  readonly scope: PublicDashboardRateLimitScope
  readonly limit: number
  readonly remaining: 0
  readonly resetAt: number
  readonly retryAfter: number
}

export interface PublicDashboardRateLimiter {
  consume(input: PublicDashboardRateLimitInput): void
}

interface Window {
  readonly startedAt: number
  count: number
}

const WINDOW_MS = 60_000
const SITE_LIMIT = 360
const IP_LIMIT = 600

export class InMemoryPublicDashboardRateLimiter implements PublicDashboardRateLimiter {
  private readonly siteWindows = new Map<string, Window>()
  private readonly ipWindows = new Map<string, Window>()

  consume(input: PublicDashboardRateLimitInput): void {
    const now = input.now.getTime()
    const site = this.readWindow(this.siteWindows, input.siteId, now)
    const ip = this.readWindow(this.ipWindows, input.sourceIp, now)
    const siteFailure = this.failure('site', site, SITE_LIMIT, now)
    if (siteFailure !== undefined) throw new PublicDashboardRateLimitError(siteFailure)
    const ipFailure = this.failure('ip', ip, IP_LIMIT, now)
    if (ipFailure !== undefined) throw new PublicDashboardRateLimitError(ipFailure)
    site.count += 1
    ip.count += 1
  }

  private readWindow(windows: Map<string, Window>, key: string, now: number): Window {
    const startedAt = Math.floor(now / WINDOW_MS) * WINDOW_MS
    const current = windows.get(key)
    if (current?.startedAt === startedAt) return current
    const next = { startedAt, count: 0 }
    windows.set(key, next)
    return next
  }

  private failure(
    scope: PublicDashboardRateLimitScope,
    window: Window,
    limit: number,
    now: number,
  ): PublicDashboardRateLimitFailure | undefined {
    if (window.count < limit) return undefined
    const resetAt = window.startedAt + WINDOW_MS
    return {
      scope,
      limit,
      remaining: 0,
      resetAt: Math.floor(resetAt / 1_000),
      retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
    }
  }
}

export class PublicDashboardRateLimitError extends Error {
  readonly failure: PublicDashboardRateLimitFailure

  constructor(failure: PublicDashboardRateLimitFailure) {
    super('Public dashboard rate limit exceeded')
    this.name = 'PublicDashboardRateLimitError'
    this.failure = failure
  }
}
