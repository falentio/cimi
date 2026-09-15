import type { TrafficMetricsFacts } from './traffic-types.ts'

export type TrafficMetric =
  | 'visitors'
  | 'sessions'
  | 'pageviews'
  | 'bounce_rate'
  | 'pages_per_session'
  | 'average_session_duration_seconds'

export type TrafficMetricGrain = 'visitor' | 'session' | 'event'
export type TrafficMetricUnit = 'count' | 'rate' | 'ratio' | 'seconds'

export interface TrafficMetricDefinition {
  readonly grain: TrafficMetricGrain
  readonly unit: TrafficMetricUnit
  readonly denominator: keyof TrafficMetricsFacts | null
  readonly value: (facts: TrafficMetricsFacts) => number
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

export const TRAFFIC_METRIC_CATALOG = {
  visitors: {
    grain: 'visitor',
    unit: 'count',
    denominator: null,
    value: (facts) => facts.visitors,
  },
  sessions: {
    grain: 'session',
    unit: 'count',
    denominator: null,
    value: (facts) => facts.sessions,
  },
  pageviews: {
    grain: 'event',
    unit: 'count',
    denominator: null,
    value: (facts) => facts.pageviews,
  },
  bounce_rate: {
    grain: 'session',
    unit: 'rate',
    denominator: 'eligibleSessions',
    value: (facts) => ratio(facts.bouncedSessions, facts.eligibleSessions),
  },
  pages_per_session: {
    grain: 'session',
    unit: 'ratio',
    denominator: 'sessions',
    value: (facts) => ratio(facts.pageviews, facts.sessions),
  },
  average_session_duration_seconds: {
    grain: 'session',
    unit: 'seconds',
    denominator: 'sessionsWithValidDuration',
    value: (facts) => ratio(facts.totalSessionDurationMs, facts.sessionsWithValidDuration) / 1000,
  },
} satisfies Readonly<Record<TrafficMetric, TrafficMetricDefinition>>

export function trafficMetricValue(metric: TrafficMetric, facts: TrafficMetricsFacts): number {
  return TRAFFIC_METRIC_CATALOG[metric].value(facts)
}

export function trafficMetricDenominator(
  metric: TrafficMetric,
  facts: TrafficMetricsFacts,
): number | null {
  const key = TRAFFIC_METRIC_CATALOG[metric].denominator
  return key === null ? null : facts[key]
}
