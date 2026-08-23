import * as v from 'valibot'
import { SDateTime, SId, SQueryFilter } from '../../schema/index.ts'

export const SPublicDashboardConfig = v.strictObject({
  siteId: SId,
  enabled: v.boolean(),
  publicDashboardIdentifier: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  updatedAt: SDateTime,
})
export const SPublicDashboardSiteFields = v.strictObject({ siteId: SId })
export const SPublicDashboardQueryFields = v.strictObject({
  publicDashboardIdentifier: SId,
  from: SDateTime,
  to: SDateTime,
  metric: v.picklist(['visitors', 'sessions', 'pageviews', 'bounce_rate']),
  dimension: v.picklist(['time', 'page', 'referrer', 'device', 'browser', 'os', 'country']),
  filters: v.optional(v.pipe(v.array(SQueryFilter), v.maxLength(10))),
})
export const SPublicDashboardBucket = v.strictObject({
  at: SDateTime,
  value: v.nullable(v.number()),
})
