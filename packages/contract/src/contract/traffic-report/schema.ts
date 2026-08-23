import * as v from 'valibot'
import {
  SDate,
  SDateTime,
  MAX_MINUTE_REPORT_BUCKETS,
  SId,
  SNonNegativeInteger,
  SNonNegativeNumber,
  SOffsetPage,
  SReportFreshness,
  SRate,
  isValidReportRange,
} from '../../schema/index.ts'

export const STrafficSiteFields = v.strictObject({ siteId: SId })
export const SMetricPoint = v.strictObject({
  at: SDateTime,
  value: SNonNegativeNumber,
  complete: v.boolean(),
})
const STrafficOverviewPeriod = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      fromDate: SDate,
      toDate: SDate,
      visitors: SNonNegativeInteger,
      sessions: SNonNegativeInteger,
      pageviews: SNonNegativeInteger,
      bounceRate: SRate,
      pagesPerSession: SNonNegativeNumber,
      averageSessionDurationSeconds: SNonNegativeNumber,
      trend: v.pipe(v.array(SMetricPoint), v.maxLength(MAX_MINUTE_REPORT_BUCKETS)),
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
            count: SNonNegativeInteger,
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
