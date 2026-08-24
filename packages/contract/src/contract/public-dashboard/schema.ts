import * as v from 'valibot'
import { SDate, SId, SNonNegativeInteger, SNonNegativeNumber, SScalar } from '../../schema/index.ts'

export const SPublicAbsoluteDateTime = v.pipe(v.string(), v.isoTimestamp())
export const SPublicUtcDateTime = v.pipe(
  SPublicAbsoluteDateTime,
  v.check((value) => value.endsWith('Z'), 'Expected a UTC timestamp.'),
)
export const MAX_PUBLIC_DASHBOARD_INTERVAL_STARTS = 2_161
export const MAX_PUBLIC_DASHBOARD_DIMENSION_ROWS = 100
const SRateLimitHeaderValue = v.pipe(v.string(), v.regex(/^\d+$/))

const SPublicDashboardFilterCommonFields = {
  operator: v.picklist(['equals', 'not_equals', 'contains', 'greater_than', 'less_than']),
  values: v.pipe(v.array(SScalar), v.minLength(1), v.maxLength(20)),
}
const SIdentityKind = v.picklist(['anonymous', 'identified'])
export const SPublicDashboardFilter = v.pipe(
  v.variant('scope', [
    v.strictObject({
      scope: v.literal('event'),
      field: v.picklist(['kind', 'name', 'pagePath', 'referrer']),
      ...SPublicDashboardFilterCommonFields,
    }),
    v.strictObject({
      scope: v.literal('session'),
      field: v.picklist([
        'device',
        'browser',
        'os',
        'country',
        'region',
        'city',
        'utmSource',
        'utmMedium',
        'utmCampaign',
      ]),
      ...SPublicDashboardFilterCommonFields,
    }),
    v.strictObject({
      scope: v.literal('visitor'),
      field: v.literal('identityKind'),
      operator: v.literal('equals'),
      values: v.pipe(v.array(SIdentityKind), v.minLength(1), v.maxLength(2)),
    }),
  ]),
  v.check(
    (input) =>
      input.scope === 'visitor' ||
      (input.field === 'kind'
        ? input.values.every((value) =>
            ['page_view', 'custom_event', 'outbound', 'performance', 'error'].includes(
              String(value),
            ),
          )
        : input.values.every((value) => typeof value === 'string')),
    'Public dashboard dimension filters require string values.',
  ),
)

export const SPublicDashboardConfig = v.strictObject({
  siteId: SId,
  enabled: v.boolean(),
  publicDashboardIdentifier: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  updatedAt: SPublicAbsoluteDateTime,
})
export const SPublicDashboardSiteFields = v.strictObject({ siteId: SId })
export const SPublicDashboardQueryFields = v.pipe(
  v.strictObject({
    publicDashboardIdentifier: SId,
    fromDate: SDate,
    toDate: SDate,
    granularity: v.literal('hour'),
    metric: v.picklist(['visitors', 'sessions', 'pageviews', 'events', 'bounce_rate']),
    dimension: v.picklist([
      'time',
      'page',
      'referrer',
      'utm',
      'device',
      'browser',
      'os',
      'country',
      'region',
      'city',
      'event_name',
      'identity_kind',
    ]),
    filters: v.optional(v.pipe(v.array(SPublicDashboardFilter), v.maxLength(10))),
  }),
  v.check(({ fromDate, toDate }) => {
    const from = Date.parse(`${fromDate}T00:00:00Z`)
    const to = Date.parse(`${toDate}T23:59:59Z`)
    return to >= from && to - from < 90 * 24 * 60 * 60 * 1000
  }, 'Public dashboard date range must be ordered and at most 90 days.'),
)
const SPublicDashboardBucketValueFields = {
  value: v.nullable(SNonNegativeNumber),
}
const SPublicDashboardDimensionKey = v.pipe(v.string(), v.minLength(1), v.maxLength(2048))
const SPublicDashboardTimeKey = v.pipe(
  SPublicDashboardDimensionKey,
  v.regex(/(?:Z|[+-]\d{2}:\d{2})$/, 'Time bucket keys must include an offset.'),
)
export const SPublicDashboardTimeBucket = v.strictObject({
  key: SPublicDashboardTimeKey,
  ...SPublicDashboardBucketValueFields,
  at: SPublicUtcDateTime,
})
export const SPublicDashboardDimensionBucket = v.strictObject({
  key: SPublicDashboardDimensionKey,
  ...SPublicDashboardBucketValueFields,
  at: v.null(),
})
export const SPublicDashboardBucket = v.union([
  SPublicDashboardTimeBucket,
  SPublicDashboardDimensionBucket,
])

export const SPublicRateLimitMetadata = v.strictObject({
  scope: v.picklist(['site', 'ip']),
  limit: SNonNegativeInteger,
  remaining: SNonNegativeInteger,
  resetAt: SPublicUtcDateTime,
})
export const SPublicRateLimitHeaders = v.strictObject({
  'retry-after': SRateLimitHeaderValue,
  'x-ratelimit-limit': SRateLimitHeaderValue,
  'x-ratelimit-remaining': SRateLimitHeaderValue,
  'x-ratelimit-reset': SRateLimitHeaderValue,
  'x-ratelimit-scope': v.picklist(['site', 'ip']),
})
export const SPublicRateLimitAdapterResponse = v.strictObject({
  status: v.literal(429),
  headers: SPublicRateLimitHeaders,
})
export type SPublicRateLimitMetadata = v.InferOutput<typeof SPublicRateLimitMetadata>
export type SPublicRateLimitHeaders = v.InferOutput<typeof SPublicRateLimitHeaders>
export type SPublicRateLimitAdapterResponse = v.InferOutput<typeof SPublicRateLimitAdapterResponse>
