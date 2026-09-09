import * as v from 'valibot'
import { SDateTime, SId, SName, SScalarKey } from '../../schema/index.ts'
import { SCollectionContext } from '../collection-policy/transport.ts'

const SEventProperty = v.union([
  v.pipe(v.string(), v.maxLength(512)),
  v.pipe(v.number(), v.finite()),
  v.boolean(),
  v.null(),
])
const SEventProperties = v.pipe(
  v.record(SScalarKey, SEventProperty),
  v.check((value) => Object.keys(value).length <= 64, 'Expected at most 64 properties.'),
  v.check(
    (value) =>
      !Object.keys(value).some((key) =>
        [
          'eventId',
          'ingestionIdentifier',
          'kind',
          'occurrenceTime',
          'pagePath',
          'referrer',
          'identifiedUserId',
          'properties',
          'receiptTime',
          'name',
          'destination',
          'value',
          'unit',
          'code',
          'message',
        ].includes(key),
      ),
    'Event properties must not use reserved envelope names.',
  ),
)
const SEventCommonFields = {
  eventId: SId,
  ingestionIdentifier: SId,
  occurrenceTime: v.optional(SDateTime),
  pagePath: v.optional(v.pipe(v.string(), v.maxLength(2048))),
  referrer: v.optional(v.pipe(v.string(), v.maxLength(2048))),
  identifiedUserId: v.optional(SId),
  properties: v.optional(SEventProperties),
  collectionContext: v.optional(SCollectionContext),
}

export const SEvent = v.variant('kind', [
  v.strictObject({
    ...SEventCommonFields,
    kind: v.literal('page_view'),
    pagePath: v.pipe(v.string(), v.maxLength(2048)),
  }),
  v.strictObject({
    ...SEventCommonFields,
    kind: v.literal('custom_event'),
    name: SName,
  }),
  v.strictObject({
    ...SEventCommonFields,
    kind: v.literal('outbound'),
    name: v.optional(SName),
    destination: v.pipe(v.string(), v.maxLength(2048)),
  }),
  v.strictObject({
    ...SEventCommonFields,
    kind: v.literal('performance'),
    name: SName,
    value: v.pipe(v.number(), v.finite()),
    unit: v.optional(v.pipe(v.string(), v.maxLength(64))),
  }),
  v.strictObject({
    ...SEventCommonFields,
    kind: v.literal('error'),
    name: SName,
    code: v.optional(v.pipe(v.string(), v.maxLength(128))),
    message: v.optional(v.pipe(v.string(), v.maxLength(512))),
  }),
])

export const SAcceptedEvent = v.strictObject({
  eventId: SId,
  status: v.picklist(['accepted', 'duplicate']),
  receiptTime: SDateTime,
})

export const SBatchEventResult = v.variant('status', [
  v.strictObject({
    status: v.literal('accepted'),
    eventId: SId,
    receiptTime: SDateTime,
  }),
  v.strictObject({ status: v.literal('duplicate'), eventId: SId, receiptTime: SDateTime }),
  v.strictObject({ status: v.literal('rejected'), eventId: SId, reason: v.literal('policy') }),
  v.strictObject({
    status: v.literal('itemError'),
    eventId: v.nullable(SId),
    code: v.picklist(['BAD_REQUEST', 'CONFLICT', 'PAYLOAD_TOO_LARGE']),
  }),
])
export const SBatchEventResponse = v.strictObject({
  results: v.pipe(v.array(SBatchEventResult), v.minLength(1), v.maxLength(100)),
})
