import * as v from 'valibot'
import { SDateTime, SId, SCursor } from '../../schema/index.ts'

export const STrafficSiteFields = v.strictObject({ siteId: SId })
export const SMetricPoint = v.strictObject({ at: SDateTime, value: v.number() })
export const STrafficOverview = v.strictObject({
  from: SDateTime,
  to: SDateTime,
  visitors: v.number(),
  sessions: v.number(),
  pageviews: v.number(),
  bounceRate: v.number(),
  pagesPerSession: v.number(),
  averageSessionDurationSeconds: v.number(),
  trend: v.array(SMetricPoint),
})
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
export const STrafficBreakdown = v.strictObject({
  items: v.array(v.strictObject({ value: v.string(), count: v.number(), percentage: v.number() })),
  nextCursor: v.nullable(SCursor),
})
