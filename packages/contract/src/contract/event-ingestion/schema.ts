import * as v from 'valibot'
import { SDateTime, SId, SName, SScalarMap } from '../../schema/index.ts'

export const SEventKind = v.picklist([
  'page_view',
  'custom_event',
  'outbound',
  'performance',
  'error',
])
export const SEvent = v.strictObject({
  eventId: SId,
  ingestionIdentifier: SId,
  kind: SEventKind,
  name: v.optional(SName),
  occurrenceTime: v.optional(SDateTime),
  pagePath: v.optional(v.pipe(v.string(), v.maxLength(2048))),
  referrer: v.optional(v.pipe(v.string(), v.maxLength(2048))),
  identifiedUserId: v.optional(SId),
  properties: v.optional(SScalarMap),
})
export const SAcceptedEvent = v.strictObject({
  eventId: SId,
  status: v.picklist(['accepted', 'duplicate']),
  receiptTime: SDateTime,
})
