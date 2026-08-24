import * as v from 'valibot'
import {
  SDate,
  SId,
  SNonNegativeInteger,
  SNonNegativeNumber,
  SOffsetPage,
  SReportFreshness,
  SRate,
  isValidReportRange,
} from '../../schema/index.ts'

export const STrafficSiteFields = v.strictObject({ siteId: SId })
export const STrafficAbsoluteDateTime = v.pipe(v.string(), v.isoTimestamp())
export const STrafficMetric = v.picklist([
  'visitors',
  'sessions',
  'pageviews',
  'bounce_rate',
  'pages_per_session',
  'average_session_duration_seconds',
])

const STrafficTrendPointCommon = {
  at: STrafficAbsoluteDateTime,
  value: SNonNegativeNumber,
  complete: v.boolean(),
}
export const SMetricPoint = v.variant('metric', [
  v.strictObject({
    ...STrafficTrendPointCommon,
    metric: v.literal('visitors'),
    grain: v.literal('visitor'),
    unit: v.literal('count'),
    denominator: v.null(),
  }),
  v.strictObject({
    ...STrafficTrendPointCommon,
    metric: v.literal('sessions'),
    grain: v.literal('session'),
    unit: v.literal('count'),
    denominator: v.null(),
  }),
  v.strictObject({
    ...STrafficTrendPointCommon,
    metric: v.literal('pageviews'),
    grain: v.literal('event'),
    unit: v.literal('count'),
    denominator: v.null(),
  }),
  v.strictObject({
    ...STrafficTrendPointCommon,
    metric: v.literal('bounce_rate'),
    grain: v.literal('session'),
    unit: v.literal('rate'),
    denominator: SNonNegativeInteger,
  }),
  v.strictObject({
    ...STrafficTrendPointCommon,
    metric: v.literal('pages_per_session'),
    grain: v.literal('session'),
    unit: v.literal('ratio'),
    denominator: SNonNegativeInteger,
  }),
  v.strictObject({
    ...STrafficTrendPointCommon,
    metric: v.literal('average_session_duration_seconds'),
    grain: v.literal('session'),
    unit: v.literal('seconds'),
    denominator: SNonNegativeInteger,
  }),
])

export const AUTHENTICATED_REPORT_BUCKET_LIMITS = {
  minute: 1_800,
  hour: 720,
  day: 366,
  week: 104,
  month: 36,
  year: 10,
} as const
export const MAX_AUTHENTICATED_REPORT_OUTPUT_BUCKETS = Math.max(
  ...Object.values(AUTHENTICATED_REPORT_BUCKET_LIMITS),
)

const getInclusiveDayCount = (fromDate: string, toDate: string) => {
  const from = Date.parse(`${fromDate}T00:00:00Z`)
  const to = Date.parse(`${toDate}T00:00:00Z`)
  return Number.isFinite(from) && Number.isFinite(to) && to >= from
    ? Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1
    : 0
}

export const isWithinAuthenticatedReportBucketLimit = (input: {
  fromDate: string
  toDate: string
  granularity: string
}) => {
  const days = getInclusiveDayCount(input.fromDate, input.toDate)

  switch (input.granularity) {
    case 'minute':
      return days === 1 && days * 1_440 <= AUTHENTICATED_REPORT_BUCKET_LIMITS.minute
    case 'hour':
      return days <= 30 && days * 24 <= AUTHENTICATED_REPORT_BUCKET_LIMITS.hour
    case 'day':
      return days <= AUTHENTICATED_REPORT_BUCKET_LIMITS.day
    case 'week':
      return Math.ceil(days / 7) <= AUTHENTICATED_REPORT_BUCKET_LIMITS.week
    case 'month':
      return Math.ceil(days / 31) <= AUTHENTICATED_REPORT_BUCKET_LIMITS.month
    case 'year':
      return Math.ceil(days / 366) <= AUTHENTICATED_REPORT_BUCKET_LIMITS.year
    default:
      return false
  }
}

const STrafficOverviewPeriod = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      fromDate: SDate,
      toDate: SDate,
      visitors: SNonNegativeInteger,
      sessions: SNonNegativeInteger,
      eligibleSessions: SNonNegativeInteger,
      sessionsWithValidDuration: SNonNegativeInteger,
      pageviews: SNonNegativeInteger,
      bounceRate: SRate,
      pagesPerSession: SNonNegativeNumber,
      averageSessionDurationSeconds: SNonNegativeNumber,
      trend: v.pipe(v.array(SMetricPoint), v.maxLength(MAX_AUTHENTICATED_REPORT_OUTPUT_BUCKETS)),
    }),
    SReportFreshness,
  ]),
)
export const STrafficOverview = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      STrafficOverviewPeriod,
      v.strictObject({ comparison: v.optional(v.nullable(STrafficOverviewPeriod)) }),
    ]),
  ),
  v.check(
    (input) =>
      isValidReportRange({
        fromDate: input.fromDate,
        toDate: input.toDate,
        comparison: input.comparison ?? undefined,
      }),
    'Report output periods must be ordered.',
  ),
)
export const STrafficBreakdownFields = v.strictObject({
  siteId: SId,
  dimension: v.picklist([
    'page',
    'entry_page',
    'exit_page',
    'referrer',
    'utm',
    'device',
    'browser',
    'os',
    'country',
    'region',
    'city',
  ]),
})
const STrafficBreakdownPage = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      items: v.pipe(
        v.array(
          v.strictObject({
            value: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
            metric: v.literal('sessions'),
            grain: v.literal('session'),
            count: SNonNegativeInteger,
            denominator: SNonNegativeInteger,
            percentage: SRate,
          }),
        ),
        v.maxLength(100),
      ),
    }),
    SOffsetPage,
    SReportFreshness,
  ]),
)
export const STrafficBreakdown = v.strictObject(
  v.entriesFromObjects([
    STrafficBreakdownPage,
    v.strictObject({ comparison: v.optional(v.nullable(STrafficBreakdownPage)) }),
  ]),
)
