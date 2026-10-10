import { describe, expect, it } from 'vitest'
import {
  formatOverviewBucketLabel,
  toOverviewMetrics,
  toOverviewTrend,
  toSiteTrafficView,
} from './site-overview.mapper'
import type { TrafficBreakdownPage, TrafficOverviewPeriod } from './site-overview.types'

function period(overrides: Partial<TrafficOverviewPeriod> = {}): TrafficOverviewPeriod {
  return {
    fromDate: '2026-05-21',
    toDate: '2026-05-27',
    visitors: 24_860,
    sessions: 18_942,
    eligibleSessions: 18_000,
    sessionsWithValidDuration: 17_500,
    pageviews: 62_104,
    bounceRate: 0.324,
    pagesPerSession: 3.28,
    averageSessionDurationSeconds: 138,
    trend: [
      {
        at: '2026-05-21T00:00:00.000Z',
        value: 100,
        complete: true,
        metric: 'visitors',
        grain: 'visitor',
        unit: 'count',
        denominator: null,
      },
      {
        at: '2026-05-22T00:00:00.000Z',
        value: 120,
        complete: true,
        metric: 'visitors',
        grain: 'visitor',
        unit: 'count',
        denominator: null,
      },
      {
        at: '2026-05-23T00:00:00.000Z',
        value: 140,
        complete: false,
        metric: 'visitors',
        grain: 'visitor',
        unit: 'count',
        denominator: null,
      },
    ],
    projectedAcceptanceSequence: 42,
    occurrenceTimeCoverageThrough: '2026-05-22T23:59:59.999Z',
    status: 'stale',
    ...overrides,
  }
}

function breakdownPage(): TrafficBreakdownPage {
  return {
    items: [
      {
        value: '/',
        metric: 'sessions',
        grain: 'session',
        count: 12_840,
        denominator: 18_942,
        percentage: 0.678,
      },
      {
        value: '/pricing',
        metric: 'sessions',
        grain: 'session',
        count: 8_214,
        denominator: 18_942,
        percentage: 0.434,
      },
    ],
    nextOffset: 2,
    hasMore: true,
    totalCount: 12,
    projectedAcceptanceSequence: 42,
    occurrenceTimeCoverageThrough: '2026-05-22T23:59:59.999Z',
    status: 'stale',
  }
}

describe('formatOverviewBucketLabel', () => {
  it('renders a UTC day and month from a bucket instant', () => {
    expect(formatOverviewBucketLabel('2026-05-21T00:00:00.000Z')).toBe('21 May')
  })

  it('returns an empty label for an unparsable instant', () => {
    expect(formatOverviewBucketLabel('not-a-date')).toBe('')
  })
})

describe('toOverviewMetrics', () => {
  it('renders each metric with the unit its contract unit implies', () => {
    const metrics = toOverviewMetrics(period(), null)
    const byId = new Map(metrics.map((metric) => [metric.id, metric]))

    expect(byId.get('visitors')?.value).toBe('24,860')
    expect(byId.get('bounce_rate')?.value).toBe('32.4%')
    expect(byId.get('pages_per_session')?.value).toBe('3.28')
    expect(byId.get('average_session_duration_seconds')?.value).toBe('2m 18s')
  })

  it('shows the denominator a rate is measured against', () => {
    const metrics = toOverviewMetrics(period(), null)
    const byId = new Map(metrics.map((metric) => [metric.id, metric]))

    expect(byId.get('bounce_rate')?.denominatorLabel).toBe('18,000 eligible sessions')
    expect(byId.get('pages_per_session')?.denominatorLabel).toBe('18,942 sessions')
    expect(byId.get('average_session_duration_seconds')?.denominatorLabel).toBe(
      '17,500 sessions with a duration',
    )
  })

  it('leaves a count metric without a denominator', () => {
    const byId = new Map(toOverviewMetrics(period(), null).map((metric) => [metric.id, metric]))

    expect(byId.get('visitors')?.denominatorLabel).toBeNull()
  })

  it('computes a change against the comparison period and flips polarity for bounce rate', () => {
    const metrics = toOverviewMetrics(period(), period({ visitors: 20_000, bounceRate: 0.4 }))
    const byId = new Map(metrics.map((metric) => [metric.id, metric]))

    expect(byId.get('visitors')?.change).toBe('+24.3%')
    expect(byId.get('visitors')?.changeKind).toBe('positive')
    expect(byId.get('bounce_rate')?.change).toBe('-19.0%')
    expect(byId.get('bounce_rate')?.changeKind).toBe('positive')
  })

  it('drops the change and the comparison caption when no comparison is requested', () => {
    const byId = new Map(toOverviewMetrics(period(), null).map((metric) => [metric.id, metric]))

    expect(byId.get('visitors')?.change).toBeNull()
    expect(byId.get('visitors')?.comparison).toBe('')
  })

  it('never adds a non-additive value across buckets', () => {
    const metrics = toOverviewMetrics(period(), null)
    const byId = new Map(metrics.map((metric) => [metric.id, metric]))

    expect(byId.get('sessions')?.value).toBe('18,942')
    expect(byId.get('visitors')?.value).not.toBe('360')
  })
})

describe('toOverviewTrend', () => {
  it('marks the last complete bucket as the boundary of the projected tail', () => {
    expect(toOverviewTrend(period(), null).currentTailIndex).toBe(1)
  })

  it('returns -1 when the contract marks every bucket incomplete', () => {
    const allIncomplete = period({
      trend: period().trend.map((point) => ({ ...point, complete: false })),
    })

    expect(toOverviewTrend(allIncomplete, null).currentTailIndex).toBe(-1)
  })

  it('aligns the comparison series by bucket position', () => {
    const trend = toOverviewTrend(period(), period())

    expect(trend.previous).toEqual([100, 120, 140])
    expect(trend.dates.at(0)?.current).toBe('21 May')
    expect(trend.dates.at(0)?.previous).toBe('21 May')
  })

  it('leaves the previous series empty without a comparison', () => {
    expect(toOverviewTrend(period(), null).previous).toEqual([])
  })
})

describe('toSiteTrafficView emptiness', () => {
  const noTraffic = period({
    visitors: 0,
    sessions: 0,
    pageviews: 0,
    trend: [],
  })

  function mapView(overview: TrafficOverviewPeriod) {
    return toSiteTrafficView({
      range: '30d',
      granularity: 'day',
      overview,
      comparison: null,
      breakdowns: new Map(),
      activeTabs: {},
    })
  }

  it('reports no traffic when every count is zero', () => {
    expect(mapView(noTraffic).hasTraffic).toBe(false)
  })

  it('reports traffic when any count is non-zero', () => {
    expect(mapView(period({ visitors: 1 })).hasTraffic).toBe(true)
  })

  it('still renders the six metric cards when there is no traffic', () => {
    expect(mapView(noTraffic).metrics).toHaveLength(6)
  })
})

describe('toSiteTrafficView', () => {
  it('renders every section the registry declares, including one with no page yet', () => {
    const view = toSiteTrafficView({
      range: '30d',
      granularity: 'day',
      overview: period(),
      comparison: null,
      breakdowns: new Map([['pages:pages', breakdownPage()]]),
      activeTabs: { pages: 'pages' },
    })

    expect(view.breakdowns.map((section) => section.id)).toEqual([
      'pages',
      'referrers',
      'countries',
      'devices',
    ])
    expect(view.breakdowns.at(0)?.rows).toHaveLength(2)
    expect(view.breakdowns.at(1)?.rows).toEqual([])
    expect(view.breakdowns.at(0)?.hasMore).toBe(true)
    expect(view.breakdowns.at(0)?.totalCount).toBe(12)
  })

  it('turns a row into the allowlisted filter that narrows the page to it', () => {
    const view = toSiteTrafficView({
      range: '30d',
      granularity: 'day',
      overview: period(),
      comparison: null,
      breakdowns: new Map([['pages:pages', breakdownPage()]]),
      activeTabs: { pages: 'pages' },
    })

    expect(view.breakdowns.at(0)?.rows.at(0)?.filter).toEqual({
      scope: 'event',
      field: 'pagePath',
      operator: 'equals',
      values: ['/'],
    })
  })

  it('renders a share as a percentage with one decimal', () => {
    const view = toSiteTrafficView({
      range: '30d',
      granularity: 'day',
      overview: period(),
      comparison: null,
      breakdowns: new Map([['pages:pages', breakdownPage()]]),
      activeTabs: { pages: 'pages' },
    })

    expect(view.breakdowns.at(0)?.rows.at(0)?.share).toBe(67.8)
  })

  it('carries freshness through so stale data is not mistaken for final data', () => {
    const view = toSiteTrafficView({
      range: '30d',
      granularity: 'day',
      overview: period(),
      comparison: null,
      breakdowns: new Map(),
      activeTabs: {},
    })

    expect(view.freshness).toEqual({
      status: 'stale',
      coverageThrough: '2026-05-22T23:59:59.999Z',
    })
  })
})
