import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import {
  createCalendarDate,
  createInstantMs,
  InMemoryLifecycleLock,
  ReportingAdmissionError,
  type LifecycleLock,
  type PublicDashboardAggregateRow,
  type PublicDashboardQueryPort,
  type ResolvedPeriod,
} from '@cimi/kernel'
import type { PublicDashboardRepository } from '../repository.ts'
import { PublicDashboardService } from '../service.ts'
import type { ReportAdmissionTicket } from '@cimi/kernel'
import type { PublicDashboardAdmission } from '../aggregate.ts'
import { PublicDashboardRateLimitError, type PublicDashboardRateLimiter } from '../protection.ts'

const currentPeriod: ResolvedPeriod = {
  key: 'current',
  dates: { fromDate: createCalendarDate('2026-09-01'), toDate: createCalendarDate('2026-09-01') },
  interval: { start: createInstantMs(0), endExclusive: createInstantMs(7_200_000) },
  calendarDays: 1,
  bucketStarts: [
    { at: createInstantMs(0), localLabel: '2026-09-01T00:00:00', offsetMinutes: 0 },
    { at: createInstantMs(3_600_000), localLabel: '2026-09-01T01:00:00', offsetMinutes: 0 },
  ],
}

const ticket: ReportAdmissionTicket = {
  periods: {
    current: currentPeriod,
    comparison: null,
  },
  evaluation: {
    current: { period: currentPeriod, sequence: null },
    comparison: null,
    interval: currentPeriod.interval,
  },
  freshness: {
    current: {
      status: 'current',
      projectedAcceptanceSequence: 12,
      occurrenceTimeCoverageThrough: createInstantMs(7_200_000),
    },
    comparison: null,
  },
  factWork: {
    units: 1,
    budget: 25_000_000,
    components: {
      baseFacts: 1,
      extraMetrics: 0,
      bucketWork: 2,
      dimensions: 0,
      filters: 0,
      distinctCounts: 0,
    },
  },
}

function createAdmission(outcome: ReportAdmissionTicket | Error = ticket) {
  const requests: Parameters<PublicDashboardAdmission['admit']>[0][] = []
  const port: PublicDashboardAdmission = {
    admit: async (input) => {
      requests.push(input)
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  }
  return { port, requests }
}

function createQuery(
  options: {
    readonly rows?: readonly PublicDashboardAggregateRow[]
    readonly totalDistinctVisitors?: number
  } = {},
) {
  let aggregateCalls = 0
  const port: PublicDashboardQueryPort = {
    countDimensionValues: async () => 0,
    countDistinctVisitors: async () => options.totalDistinctVisitors ?? 5,
    aggregate: async () => {
      aggregateCalls += 1
      return options.rows ?? [{ groupKey: 0, value: 7, distinctVisitors: 5 }]
    },
  }
  return {
    port,
    get aggregateCalls() {
      return aggregateCalls
    },
  }
}

describe('PublicDashboardService.query', () => {
  it('suppresses each time bucket independently by distinct Visitors', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const admission = createAdmission()
    const query = createQuery({
      rows: [
        { groupKey: 0, value: 7, distinctVisitors: 5 },
        { groupKey: 1, value: 100, distinctVisitors: 4 },
      ],
    })
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock: new InMemoryLifecycleLock(),
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
    })

    await expect(
      service.query(
        {
          publicDashboardIdentifier: 'public-1',
          fromDate: '2026-09-01',
          toDate: '2026-09-01',
          granularity: 'hour',
          metric: 'visitors',
          dimension: 'time',
        },
        '203.0.113.10',
      ),
    ).resolves.toMatchObject({
      buckets: [
        { key: '2026-09-01T00:00:00Z', at: '1970-01-01T00:00:00.000Z', value: 7 },
        { key: '2026-09-01T01:00:00Z', at: '1970-01-01T01:00:00.000Z', value: null },
      ],
      status: 'current',
    })
  })

  it('maps an over-bounded derived hourly range to BAD_REQUEST', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const admission = createAdmission(
      new ReportingAdmissionError({ code: 'QUERY_LIMIT_EXCEEDED', reason: 'bucket-bound' }),
    )
    const query = createQuery()
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock: new InMemoryLifecycleLock(),
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
    })

    await expect(
      service.query(
        {
          publicDashboardIdentifier: 'public-1',
          fromDate: '2026-09-01',
          toDate: '2026-09-01',
          granularity: 'hour',
          metric: 'visitors',
          dimension: 'time',
        },
        '203.0.113.10',
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('fails closed when lifecycle contention hides the current identifier', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue(undefined)
    const lock: LifecycleLock = {
      acquire: () => undefined,
      isLocked: () => true,
    }
    const service = new PublicDashboardService({
      repository,
      lock,
      scope: { siteScope: {} as never, membership: {} as never },
    })

    await expect(
      service.query(
        {
          publicDashboardIdentifier: 'public-1',
          fromDate: '2026-09-01',
          toDate: '2026-09-01',
          granularity: 'hour',
          metric: 'visitors',
          dimension: 'time',
        },
        '203.0.113.10',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('suppresses the complete result when the narrowed total is below k', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const admission = createAdmission()
    const query = createQuery({ totalDistinctVisitors: 4 })
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock: new InMemoryLifecycleLock(),
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
    })

    await expect(
      service.query(
        {
          publicDashboardIdentifier: 'public-1',
          fromDate: '2026-09-01',
          toDate: '2026-09-01',
          granularity: 'hour',
          metric: 'visitors',
          dimension: 'time',
        },
        '203.0.113.10',
      ),
    ).resolves.toMatchObject({
      buckets: [
        { key: '2026-09-01T00:00:00Z', value: null },
        { key: '2026-09-01T01:00:00Z', value: null },
      ],
    })
    expect(query.aggregateCalls).toBe(0)
  })

  it('rejects public URL filters containing query strings or fragments', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const admission = createAdmission()
    const query = createQuery()
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock: new InMemoryLifecycleLock(),
      scope: { siteScope: {} as never, membership: {} as never },
    })

    await expect(
      service.query(
        {
          publicDashboardIdentifier: 'public-1',
          fromDate: '2026-09-01',
          toDate: '2026-09-01',
          granularity: 'hour',
          metric: 'visitors',
          dimension: 'time',
          filters: [
            {
              scope: 'event',
              field: 'pagePath',
              operator: 'equals',
              values: ['/pricing?email=private@example.com'],
            },
          ],
        },
        '203.0.113.10',
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(admission.requests).toHaveLength(0)
  })

  it('holds the analytics read lease for the complete public analytics read', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const admission = createAdmission()
    const query = createQuery()
    let releaseCount = 0
    const lock: LifecycleLock = {
      acquire: () => ({
        kind: 'analytics-read',
        mode: 'shared-read',
        release: () => {
          releaseCount += 1
        },
      }),
      isLocked: () => false,
    }
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock,
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
    })

    await expect(
      service.query(
        {
          publicDashboardIdentifier: 'public-1',
          fromDate: '2026-09-01',
          toDate: '2026-09-01',
          granularity: 'hour',
          metric: 'visitors',
          dimension: 'time',
        },
        '203.0.113.10',
      ),
    ).resolves.toBeDefined()
    expect(releaseCount).toBe(1)
  })

  it('completes a public analytics read while backup is active', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const admission = createAdmission()
    const query = createQuery()
    const lock = new InMemoryLifecycleLock()
    const backupLease = lock.acquire('backup')
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock,
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
    })

    await expect(
      service.query(
        {
          publicDashboardIdentifier: 'public-1',
          fromDate: '2026-09-01',
          toDate: '2026-09-01',
          granularity: 'hour',
          metric: 'visitors',
          dimension: 'time',
        },
        '203.0.113.10',
      ),
    ).resolves.toBeDefined()

    expect(lock.acquire('restore')).toBeUndefined()
    await backupLease?.release()
  })

  it('releases the analytics read lease when query execution fails', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const admission = createAdmission()
    const query: PublicDashboardQueryPort = {
      countDimensionValues: async () => 0,
      countDistinctVisitors: async () => 5,
      aggregate: async () => {
        throw new Error('aggregate failed')
      },
    }
    const lock = new InMemoryLifecycleLock()
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query,
      lock,
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
    })

    await expect(
      service.query(
        {
          publicDashboardIdentifier: 'public-1',
          fromDate: '2026-09-01',
          toDate: '2026-09-01',
          granularity: 'hour',
          metric: 'visitors',
          dimension: 'time',
        },
        '203.0.113.10',
      ),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

    const deletionLease = lock.acquire('site_deletion')
    expect(deletionLease).toBeDefined()
    await deletionLease?.release()
  })

  it('resolves the identifier before serving a cached response after revocation', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash
      .mockResolvedValueOnce({
        siteId: 'ste_1',
        enabled: true,
        publicDashboardIdentifier: 'public-1',
        updatedAt: '2026-09-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce(undefined)
    const admission = createAdmission()
    const query = createQuery()
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock: new InMemoryLifecycleLock(),
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
    })
    const input = {
      publicDashboardIdentifier: 'public-1',
      fromDate: '2026-09-01',
      toDate: '2026-09-01',
      granularity: 'hour' as const,
      metric: 'visitors' as const,
      dimension: 'time' as const,
    }

    await expect(service.query(input, '203.0.113.10')).resolves.toBeDefined()
    await expect(service.query(input, '203.0.113.10')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(query.aggregateCalls).toBe(1)
  })

  it.each(['site', 'ip'] as const)('returns complete %s rate-limit metadata', async (scope) => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const rateLimiter: PublicDashboardRateLimiter = {
      consume: () => {
        throw new PublicDashboardRateLimitError({
          scope,
          limit: scope === 'site' ? 360 : 600,
          remaining: 0,
          resetAt: 1_789_670_460,
          retryAfter: 30,
        })
      },
    }
    const admission = createAdmission()
    const query = createQuery()
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock: new InMemoryLifecycleLock(),
      rateLimiter,
      scope: { siteScope: {} as never, membership: {} as never },
    })

    await expect(
      service.query(
        {
          publicDashboardIdentifier: 'public-1',
          fromDate: '2026-09-01',
          toDate: '2026-09-01',
          granularity: 'hour',
          metric: 'visitors',
          dimension: 'time',
        },
        '203.0.113.10',
      ),
    ).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      data: {
        status: 429,
        headers: {
          'retry-after': '30',
          'x-ratelimit-limit': scope === 'site' ? '360' : '600',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1789670460',
          'x-ratelimit-scope': scope,
        },
      },
    })
  })

  it('passes the resolved source IP to the rate limiter', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const sourceIps: string[] = []
    const service = new PublicDashboardService({
      repository,
      admission: createAdmission().port,
      query: createQuery().port,
      lock: new InMemoryLifecycleLock(),
      rateLimiter: { consume: ({ sourceIp }) => sourceIps.push(sourceIp) },
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
    })

    await service.query(
      {
        publicDashboardIdentifier: 'public-1',
        fromDate: '2026-09-01',
        toDate: '2026-09-01',
        granularity: 'hour',
        metric: 'visitors',
        dimension: 'time',
      },
      '203.0.113.10',
    )

    expect(sourceIps).toEqual(['203.0.113.10'])
  })

  it('deletes an expired cached query before serving it', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const admission = createAdmission()
    const query = createQuery()
    let now = new Date('2026-09-01T00:00:00.000Z')
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock: new InMemoryLifecycleLock(),
      rateLimiter: { consume: () => undefined },
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => now,
    })
    const input = {
      publicDashboardIdentifier: 'public-1',
      fromDate: '2026-09-01',
      toDate: '2026-09-01',
      granularity: 'hour' as const,
      metric: 'visitors' as const,
      dimension: 'time' as const,
    }

    await service.query(input, '203.0.113.10')
    now = new Date(now.getTime() + 300_000)
    await service.query(input, '203.0.113.10')

    expect(query.aggregateCalls).toBe(2)
  })

  it('evicts the oldest cached query when the cache reaches its bound', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.findByIdentifierHash.mockResolvedValue({
      siteId: 'ste_1',
      enabled: true,
      publicDashboardIdentifier: 'public-1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const admission = createAdmission()
    const query = createQuery()
    const service = new PublicDashboardService({
      repository,
      admission: admission.port,
      query: query.port,
      lock: new InMemoryLifecycleLock(),
      rateLimiter: { consume: () => undefined },
      scope: { siteScope: {} as never, membership: {} as never },
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
    })
    const input = (index: number) => ({
      publicDashboardIdentifier: 'public-1',
      fromDate: '2026-09-01',
      toDate: '2026-09-01',
      granularity: 'hour' as const,
      metric: 'visitors' as const,
      dimension: 'time' as const,
      filters: [
        {
          scope: 'event' as const,
          field: 'pagePath' as const,
          operator: 'equals' as const,
          values: [`/page-${index}`],
        },
      ],
    })

    for (let index = 0; index <= 1024; index += 1) {
      await service.query(input(index), '203.0.113.10')
    }
    await service.query(input(0), '203.0.113.10')

    expect(query.aggregateCalls).toBe(1026)
  })
})
