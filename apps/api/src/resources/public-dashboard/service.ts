import type { AuthUser } from '@cimi/auth'
import {
  SPublicDashboardConfigInput,
  SPublicDashboardConfigOutput,
  SPublicDashboardDisableInput,
  SPublicDashboardEnableInput,
  SPublicDashboardEnableOutput,
  SPublicDashboardQueryInput,
  SPublicDashboardQueryOutput,
  SPublicDashboardRotateInput,
  SPublicDashboardRotateOutput,
} from '@cimi/contract'
import { assertSiteManagementScope, type SiteScopeGuardDependencies } from '@cimi/guard'
import {
  compileTrafficFilterPlan,
  serviceUnavailable,
  type LifecycleLease,
  type LifecycleLock,
  type PublicDashboardQueryPort,
} from '@cimi/kernel'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import { toOrpcReportingError } from '../../errors.ts'
import { PublicDashboardAggregatePlanner, type PublicDashboardAdmission } from './aggregate.ts'
import { hashPublicDashboardIdentifier, mintPublicDashboardIdentifier } from './token.ts'
import {
  InMemoryPublicDashboardRateLimiter,
  PublicDashboardRateLimitError,
  type PublicDashboardRateLimiter,
} from './protection.ts'
import type { PublicDashboardRepository } from './repository.ts'

export interface PublicDashboardIdentifierFactory {
  mint(): { readonly identifier: string; readonly hash: string }
}

export interface PublicDashboardServiceDependencies {
  readonly repository: PublicDashboardRepository
  readonly lock: LifecycleLock
  readonly scope: SiteScopeGuardDependencies
  readonly admission?: PublicDashboardAdmission | undefined
  readonly query?: PublicDashboardQueryPort | undefined
  readonly rateLimiter?: PublicDashboardRateLimiter | undefined
  readonly clock?: (() => Date) | undefined
  readonly identifiers?: PublicDashboardIdentifierFactory | undefined
}

type ConfigInput = InferOutput<typeof SPublicDashboardConfigInput>
type ConfigOutput = InferOutput<typeof SPublicDashboardConfigOutput>
type EnableInput = InferOutput<typeof SPublicDashboardEnableInput>
type EnableOutput = InferOutput<typeof SPublicDashboardEnableOutput>
type DisableInput = InferOutput<typeof SPublicDashboardDisableInput>
type RotateInput = InferOutput<typeof SPublicDashboardRotateInput>
type RotateOutput = InferOutput<typeof SPublicDashboardRotateOutput>
type QueryInput = InferOutput<typeof SPublicDashboardQueryInput>
type QueryOutput = InferOutput<typeof SPublicDashboardQueryOutput>

export class PublicDashboardService {
  private readonly clock: () => Date
  private readonly identifiers: PublicDashboardIdentifierFactory
  private readonly rateLimiter: PublicDashboardRateLimiter
  private readonly cache = new Map<
    string,
    { readonly expiresAt: number; readonly output: QueryOutput }
  >()

  constructor(private readonly deps: PublicDashboardServiceDependencies) {
    this.clock = deps.clock ?? (() => new Date())
    this.identifiers = deps.identifiers ?? { mint: mintPublicDashboardIdentifier }
    this.rateLimiter = deps.rateLimiter ?? new InMemoryPublicDashboardRateLimiter()
  }

  async getConfig(input: ConfigInput, user: AuthUser | undefined): Promise<ConfigOutput> {
    await this.assertCanManage(input.siteId, user)
    const config = await this.deps.repository.findBySiteId(input.siteId)
    if (config === undefined) throw new ORPCError('NOT_FOUND')
    return config
  }

  async enable(input: EnableInput, user: AuthUser | undefined): Promise<EnableOutput> {
    await this.assertCanManage(input.siteId, user)
    const identifier = this.identifiers.mint()
    return this.withConfigurationLock(async () => {
      const result = await this.deps.repository.enable({
        siteId: input.siteId,
        identifier: identifier.identifier,
        identifierHash: identifier.hash,
        now: this.clock(),
      })
      return mutationConfig(result)
    })
  }

  async disable(input: DisableInput, user: AuthUser | undefined): Promise<void> {
    await this.assertCanManage(input.siteId, user)
    await this.withConfigurationLock(async () => {
      const result = await this.deps.repository.disable({ siteId: input.siteId, now: this.clock() })
      if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
      if (result.status === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
    })
  }

  async rotate(input: RotateInput, user: AuthUser | undefined): Promise<RotateOutput> {
    await this.assertCanManage(input.siteId, user)
    const identifier = this.identifiers.mint()
    return this.withConfigurationLock(async () => {
      const result = await this.deps.repository.rotate({
        siteId: input.siteId,
        identifier: identifier.identifier,
        identifierHash: identifier.hash,
        now: this.clock(),
      })
      return mutationConfig(result)
    })
  }

  async resolveCurrent(identifier: string): Promise<PublicDashboardRepository.Config> {
    const config = await this.deps.repository.findByIdentifierHash(
      hashPublicDashboardIdentifier(identifier),
    )
    if (config === undefined) throw new ORPCError('NOT_FOUND')
    return config
  }

  async query(input: QueryInput, sourceIp = 'unknown'): Promise<QueryOutput> {
    let lease: LifecycleLease | undefined
    try {
      lease = await this.deps.lock.acquire('ingestion')
      if (lease === undefined) {
        await this.resolveCurrent(input.publicDashboardIdentifier)
        throw toOrpcReportingError(serviceUnavailable('lifecycle-locked'))
      }

      const config = await this.resolveCurrent(input.publicDashboardIdentifier)
      const query = this.deps.query
      const admission = this.deps.admission
      if (query === undefined || admission === undefined) {
        throw new ORPCError('SERVICE_UNAVAILABLE', { status: 503 })
      }
      if (hasSensitivePublicUrlValue(input.filters)) {
        throw new ORPCError('BAD_REQUEST', { status: 400 })
      }
      const filterResult = compileTrafficFilterPlan({
        filters: input.filters ?? [],
        profileFilterKeys: [],
      })
      if (!filterResult.ok) throw new ORPCError('BAD_REQUEST', { status: 400 })
      try {
        this.rateLimiter.consume({ siteId: config.siteId, sourceIp, now: this.clock() })
      } catch (error) {
        if (error instanceof PublicDashboardRateLimitError) {
          throw new ORPCError('TOO_MANY_REQUESTS', {
            status: 429,
            data: rateLimitResponse(error.failure),
          })
        }
        throw error
      }

      const planner = new PublicDashboardAggregatePlanner({ admission, query })
      const prepared = await planner.preflight({
        siteId: config.siteId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        metric: input.metric,
        dimension: input.dimension,
        filterPlan: filterResult.plan,
        filterCount: input.filters?.length ?? 0,
      })
      const cacheKey = JSON.stringify({
        identifier: input.publicDashboardIdentifier,
        fromDate: input.fromDate,
        toDate: input.toDate,
        granularity: input.granularity,
        metric: input.metric,
        dimension: input.dimension,
        filters: input.filters ?? [],
        period: prepared.query.period,
      })
      const cached = this.cache.get(cacheKey)
      if (cached !== undefined && cached.expiresAt > this.clock().getTime()) return cached.output

      const aggregate = await planner.execute(prepared)
      const output: QueryOutput = {
        ...aggregate,
        buckets:
          input.dimension === 'time'
            ? aggregate.buckets.map((bucket) => {
                if (bucket.at === null) throw new Error('Expected time bucket')
                return bucket
              })
            : aggregate.buckets.map((bucket) => {
                if (bucket.at !== null) throw new Error('Expected dimension bucket')
                return bucket
              }),
      }
      this.cache.set(cacheKey, { expiresAt: this.clock().getTime() + 300_000, output })
      return output
    } finally {
      await lease?.release()
    }
  }

  private async assertCanManage(siteId: string, user: AuthUser | undefined): Promise<void> {
    await assertSiteManagementScope(user, siteId, this.deps.scope)
    if (!(await this.deps.scope.siteScope.isActive(siteId))) throw new ORPCError('NOT_FOUND')
  }

  private async withConfigurationLock<T>(work: () => Promise<T>): Promise<T> {
    const lease = await this.deps.lock.acquire('site_deletion')
    if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
    try {
      return await work()
    } finally {
      await lease.release()
    }
  }
}

function rateLimitResponse(failure: {
  readonly scope: 'site' | 'ip'
  readonly limit: number
  readonly remaining: 0
  readonly resetAt: number
  readonly retryAfter: number
}) {
  return {
    status: 429 as const,
    headers: {
      'retry-after': String(failure.retryAfter),
      'x-ratelimit-limit': String(failure.limit),
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(failure.resetAt),
      'x-ratelimit-scope': failure.scope,
    },
  }
}

function mutationConfig(
  result: PublicDashboardRepository.Mutation,
): PublicDashboardRepository.Config {
  if (result.status === 'updated') return result.config
  if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
  throw new ORPCError('CONFLICT', { status: 409 })
}

function hasSensitivePublicUrlValue(filters: QueryInput['filters']): boolean {
  return (filters ?? []).some(
    (filter) =>
      filter.scope === 'event' &&
      (filter.field === 'pagePath' || filter.field === 'referrer') &&
      filter.values.some((value) => typeof value === 'string' && /[?#]/.test(value)),
  )
}
