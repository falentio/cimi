import * as v from 'valibot'
import { SDateTime, SId, SScalarMap, SCursor } from '../../schema/index.ts'

export const SEventKind = v.picklist([
  'page_view',
  'custom_event',
  'outbound',
  'performance',
  'error',
])
export const SEventSiteFields = v.strictObject({ siteId: SId, eventKind: v.optional(SEventKind) })
export const SEventOverview = v.strictObject({
  from: SDateTime,
  to: SDateTime,
  eventKind: SEventKind,
  total: v.number(),
  uniqueVisitors: v.number(),
  uniqueSessions: v.number(),
})
export const SEventTimeseries = v.strictObject({
  buckets: v.array(v.strictObject({ at: SDateTime, count: v.number() })),
})
export const SEvent = v.strictObject({
  eventId: SId,
  kind: SEventKind,
  name: v.nullable(v.string()),
  occurredAt: SDateTime,
  createdAt: SDateTime,
  pagePath: v.nullable(v.string()),
  properties: v.nullable(SScalarMap),
})
export const SEventPageResult = v.strictObject({
  items: v.array(SEvent),
  nextCursor: v.nullable(SCursor),
})
export const SEventBreakdowns = v.strictObject({
  items: v.array(v.strictObject({ field: v.string(), value: v.string(), count: v.number() })),
  nextCursor: v.nullable(SCursor),
})
