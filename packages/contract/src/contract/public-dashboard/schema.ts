import * as v from 'valibot'
import { SDate, SDateTime, SId, SNonNegativeNumber, SScalar } from '../../schema/index.ts'

const SPublicDashboardFilterCommonFields = {
  operator: v.picklist(['equals', 'not_equals', 'contains', 'greater_than', 'less_than']),
  values: v.pipe(v.array(SScalar), v.minLength(1), v.maxLength(20)),
}
const SPublicDashboardFilter = v.variant('scope', [
  v.strictObject({
    scope: v.literal('event'),
    field: v.picklist(['kind', 'name', 'pagePath', 'referrer']),
    ...SPublicDashboardFilterCommonFields,
  }),
  v.strictObject({
    scope: v.literal('session'),
    field: v.picklist(['device', 'browser', 'os', 'country']),
    ...SPublicDashboardFilterCommonFields,
  }),
  v.strictObject({
    scope: v.literal('visitor'),
    field: v.picklist(['identityKind']),
    ...SPublicDashboardFilterCommonFields,
  }),
])

export const SPublicDashboardConfig = v.strictObject({
  siteId: SId,
  enabled: v.boolean(),
  publicDashboardIdentifier: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  updatedAt: SDateTime,
})
export const SPublicDashboardSiteFields = v.strictObject({ siteId: SId })
export const SPublicDashboardQueryFields = v.pipe(
  v.strictObject({
    publicDashboardIdentifier: SId,
    fromDate: SDate,
    toDate: SDate,
    granularity: v.literal('hour'),
    metric: v.picklist(['visitors', 'sessions', 'pageviews', 'bounce_rate']),
    dimension: v.picklist(['time', 'page', 'referrer', 'device', 'browser', 'os', 'country']),
    filters: v.optional(v.pipe(v.array(SPublicDashboardFilter), v.maxLength(10))),
  }),
  v.check(({ fromDate, toDate }) => {
    const from = Date.parse(`${fromDate}T00:00:00Z`)
    const to = Date.parse(`${toDate}T23:59:59Z`)
    return to >= from && to - from < 90 * 24 * 60 * 60 * 1000
  }, 'Public dashboard date range must be ordered and at most 90 days.'),
)
export const SPublicDashboardBucket = v.strictObject({
  key: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  at: v.nullable(SDateTime),
  value: v.nullable(SNonNegativeNumber),
})
