import { ORPCError } from '@orpc/server'
import type { IngestionProtection } from './service.ts'

const SITE_RATE_PER_SECOND = 100
const SITE_BURST = 500
const SOURCE_IP_RATE_PER_SECOND = 25
const SOURCE_IP_BURST = 100

interface Bucket {
  tokens: number
  updatedAt: number
}

export interface InMemoryIngestionProtectionDependencies {
  readonly siteRatePerSecond?: number
  readonly siteBurst?: number
  readonly sourceIpRatePerSecond?: number
  readonly sourceIpBurst?: number
}

export class InMemoryIngestionProtection implements IngestionProtection {
  private readonly siteRatePerSecond: number
  private readonly siteBurst: number
  private readonly sourceIpRatePerSecond: number
  private readonly sourceIpBurst: number
  private readonly buckets = new Map<string, Bucket>()

  constructor({
    siteRatePerSecond = SITE_RATE_PER_SECOND,
    siteBurst = SITE_BURST,
    sourceIpRatePerSecond = SOURCE_IP_RATE_PER_SECOND,
    sourceIpBurst = SOURCE_IP_BURST,
  }: InMemoryIngestionProtectionDependencies = {}) {
    for (const [name, value] of [
      ['siteRatePerSecond', siteRatePerSecond],
      ['siteBurst', siteBurst],
      ['sourceIpRatePerSecond', sourceIpRatePerSecond],
      ['sourceIpBurst', sourceIpBurst],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive`)
    }
    this.siteRatePerSecond = siteRatePerSecond
    this.siteBurst = siteBurst
    this.sourceIpRatePerSecond = sourceIpRatePerSecond
    this.sourceIpBurst = sourceIpBurst
  }

  async consume(input: Parameters<IngestionProtection['consume']>[0]): Promise<void> {
    const requests = [
      {
        key: `site:${input.siteId}`,
        ratePerSecond: this.siteRatePerSecond,
        burst: this.siteBurst,
      },
      ...(input.sourceIp === undefined
        ? []
        : [
            {
              key: `ip:${input.sourceIp}`,
              ratePerSecond: this.sourceIpRatePerSecond,
              burst: this.sourceIpBurst,
            },
          ]),
    ]
    const now = input.now.getTime()
    const updated = requests.map((request) => ({
      request,
      bucket: this.refill(request.key, request.ratePerSecond, request.burst, now),
    }))
    if (updated.some(({ bucket }) => bucket.tokens < input.units)) {
      throw new ORPCError('TOO_MANY_REQUESTS', { status: 429 })
    }
    for (const { bucket } of updated) bucket.tokens -= input.units
  }

  private refill(key: string, ratePerSecond: number, burst: number, now: number): Bucket {
    const current = this.buckets.get(key)
    if (current === undefined) {
      const bucket = { tokens: burst, updatedAt: now }
      this.buckets.set(key, bucket)
      return bucket
    }
    if (now - current.updatedAt > 60_000) {
      this.buckets.delete(key)
      const bucket = { tokens: burst, updatedAt: now }
      this.buckets.set(key, bucket)
      return bucket
    }
    const elapsedSeconds = Math.max(0, now - current.updatedAt) / 1_000
    current.tokens = Math.min(burst, current.tokens + elapsedSeconds * ratePerSecond)
    current.updatedAt = now
    return current
  }
}
