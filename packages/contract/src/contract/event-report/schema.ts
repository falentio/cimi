import * as v from 'valibot'
import {
  EVENT_FIELDS,
  isCompatibleDirectEventFilter,
  isCompatibleEventFilterForKind,
  isCompatiblePropertyFilter,
  type EventKind,
} from '@cimi/utils'
import {
  SDate,
  SEventKind,
  SFiniteNumber,
  SGranularity,
  SId,
  SNonNegativeInteger,
  SOffsetPage,
  SReportFreshness,
  SScalar,
  SScalarKey,
  SFilterOperator,
  SFilterValues,
  SName,
  isValidReportRange,
} from '../../schema/index.ts'

export const SEventSiteFields = v.strictObject({ siteId: SId, eventKind: SEventKind })
const SEventReportFilterCommonFields = {
  operator: SFilterOperator,
  values: SFilterValues,
}
const SEventReportFilterField = v.union([
  v.picklist(EVENT_FIELDS),
  v.pipe(v.string(), v.regex(/^property\.[A-Za-z0-9_.-]{1,63}$/)),
])
const SEventPropertyFilter = v.pipe(
  v.strictObject({ field: SScalarKey, operator: SFilterOperator, values: SFilterValues }),
  v.check(
    (input) => isCompatiblePropertyFilter(input),
    'Event property filters require compatible typed values.',
  ),
)
const SEventMatchActionCommonFields = {
  propertyFilters: v.optional(v.pipe(v.array(SEventPropertyFilter), v.maxLength(20))),
}
export const SEventMatchAction = v.variant('kind', [
  v.strictObject({ kind: v.literal('page_view'), ...SEventMatchActionCommonFields }),
  v.strictObject({
    kind: v.literal('custom_event'),
    name: SName,
    ...SEventMatchActionCommonFields,
  }),
  v.strictObject({
    kind: v.literal('outbound'),
    name: v.optional(SName),
    ...SEventMatchActionCommonFields,
  }),
  v.strictObject({
    kind: v.literal('performance'),
    name: SName,
    ...SEventMatchActionCommonFields,
  }),
  v.strictObject({
    kind: v.literal('error'),
    name: SName,
    ...SEventMatchActionCommonFields,
  }),
])

const SEventValueFilter = v.pipe(
  v.strictObject({
    scope: v.literal('event'),
    field: SEventReportFilterField,
    ...SEventReportFilterCommonFields,
  }),
  v.check(
    (input) =>
      input.field.startsWith('property.')
        ? isCompatiblePropertyFilter(input)
        : isCompatibleDirectEventFilter(input),
    'Event report filters require compatible typed values.',
  ),
)
const SEventActionPresenceFilter = v.variant('operator', [
  v.strictObject({
    scope: v.literal('session'),
    operator: v.literal('has_done'),
    action: SEventMatchAction,
    range: v.literal('same_range'),
  }),
  v.strictObject({
    scope: v.literal('session'),
    operator: v.literal('has_not_done'),
    action: SEventMatchAction,
    range: v.literal('same_range'),
  }),
])
export const SEventReportFilter = v.union([SEventValueFilter, SEventActionPresenceFilter])
export type EventReportFilter = v.InferOutput<typeof SEventReportFilter>

export function areEventFiltersCompatibleWithKind(input: {
  readonly eventKind: EventKind
  readonly filters?: readonly EventReportFilter[] | undefined
}): boolean {
  return (input.filters ?? []).every(
    (filter) =>
      filter.scope !== 'event' ||
      filter.field.startsWith('property.') ||
      isCompatibleEventFilterForKind({
        eventKind: input.eventKind,
        field: filter.field,
        operator: filter.operator,
        values: filter.values,
      }),
  )
}

export const SEventAbsoluteDateTime = v.pipe(v.string(), v.isoTimestamp())
export const AUTHENTICATED_EVENT_BUCKET_LIMITS = {
  minute: 1_800,
  hour: 720,
  day: 366,
  week: 104,
  month: 36,
  year: 10,
} as const
export const MAX_AUTHENTICATED_EVENT_OUTPUT_BUCKETS = Math.max(
  ...Object.values(AUTHENTICATED_EVENT_BUCKET_LIMITS),
)

const getInclusiveDayCount = (fromDate: string, toDate: string) => {
  const from = Date.parse(`${fromDate}T00:00:00Z`)
  const to = Date.parse(`${toDate}T00:00:00Z`)
  return Number.isFinite(from) && Number.isFinite(to) && to >= from
    ? Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1
    : 0
}

export const isWithinAuthenticatedEventBucketLimit = (input: {
  fromDate: string
  toDate: string
  granularity: string
}) => {
  const days = getInclusiveDayCount(input.fromDate, input.toDate)

  switch (input.granularity) {
    case 'minute':
      return days === 1 && days * 1_440 <= AUTHENTICATED_EVENT_BUCKET_LIMITS.minute
    case 'hour':
      return days <= 30 && days * 24 <= AUTHENTICATED_EVENT_BUCKET_LIMITS.hour
    case 'day':
      return days <= AUTHENTICATED_EVENT_BUCKET_LIMITS.day
    case 'week':
      return Math.ceil(days / 7) <= AUTHENTICATED_EVENT_BUCKET_LIMITS.week
    case 'month':
      return Math.ceil(days / 31) <= AUTHENTICATED_EVENT_BUCKET_LIMITS.month
    case 'year':
      return Math.ceil(days / 366) <= AUTHENTICATED_EVENT_BUCKET_LIMITS.year
    default:
      return false
  }
}

const SEventReportComparison = v.strictObject({ fromDate: SDate, toDate: SDate })
const SEventReportFields = {
  fromDate: SDate,
  toDate: SDate,
  comparison: v.optional(SEventReportComparison),
  filters: v.optional(v.pipe(v.array(SEventReportFilter), v.maxLength(20))),
}
export const SEventReportFieldsSchema = v.strictObject(SEventReportFields)
export const SEventGranularReportFieldsSchema = v.strictObject({
  ...SEventReportFields,
  granularity: SGranularity,
})
export const SEventReportListFieldsSchema = v.strictObject({
  fromDate: SDate,
  toDate: SDate,
  filters: v.optional(v.pipe(v.array(SEventReportFilter), v.maxLength(20))),
})
const SEventOverviewPeriod = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      fromDate: SDate,
      toDate: SDate,
      eventKind: SEventKind,
      total: SNonNegativeInteger,
      uniqueVisitors: SNonNegativeInteger,
      uniqueSessions: SNonNegativeInteger,
    }),
    SReportFreshness,
  ]),
)
export const SEventOverview = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      SEventOverviewPeriod,
      v.strictObject({ comparison: v.optional(v.nullable(SEventOverviewPeriod)) }),
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
const SEventTimeseriesPeriod = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      fromDate: SDate,
      toDate: SDate,
      buckets: v.pipe(
        v.array(
          v.strictObject({
            at: SEventAbsoluteDateTime,
            count: SNonNegativeInteger,
            complete: v.boolean(),
          }),
        ),
        v.maxLength(MAX_AUTHENTICATED_EVENT_OUTPUT_BUCKETS),
      ),
    }),
    SReportFreshness,
  ]),
)
export const SEventTimeseries = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      SEventTimeseriesPeriod,
      v.strictObject({ comparison: v.optional(v.nullable(SEventTimeseriesPeriod)) }),
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
const SEventOutputProperties = v.pipe(
  v.record(SScalarKey, SScalar),
  v.check((value) => Object.keys(value).length <= 64, 'Expected at most 64 properties.'),
)
const SEventOutputCommonFields = {
  eventId: SId,
  occurredAt: SEventAbsoluteDateTime,
  createdAt: SEventAbsoluteDateTime,
  referrer: v.nullable(v.pipe(v.string(), v.maxLength(2048))),
  properties: v.nullable(SEventOutputProperties),
}
export const SEvent = v.variant('kind', [
  v.strictObject({
    ...SEventOutputCommonFields,
    kind: v.literal('page_view'),
    pagePath: v.pipe(v.string(), v.maxLength(2048)),
  }),
  v.strictObject({
    ...SEventOutputCommonFields,
    kind: v.literal('custom_event'),
    name: SName,
    pagePath: v.nullable(v.pipe(v.string(), v.maxLength(2048))),
  }),
  v.strictObject({
    ...SEventOutputCommonFields,
    kind: v.literal('outbound'),
    name: v.nullable(SName),
    pagePath: v.nullable(v.pipe(v.string(), v.maxLength(2048))),
    destination: v.pipe(v.string(), v.maxLength(2048)),
  }),
  v.strictObject({
    ...SEventOutputCommonFields,
    kind: v.literal('performance'),
    name: SName,
    pagePath: v.nullable(v.pipe(v.string(), v.maxLength(2048))),
    value: SFiniteNumber,
    unit: v.nullable(v.pipe(v.string(), v.maxLength(64))),
  }),
  v.strictObject({
    ...SEventOutputCommonFields,
    kind: v.literal('error'),
    name: SName,
    pagePath: v.nullable(v.pipe(v.string(), v.maxLength(2048))),
    code: v.nullable(v.pipe(v.string(), v.maxLength(128))),
    message: v.nullable(v.pipe(v.string(), v.maxLength(512))),
  }),
])
export const SEventPageResult = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({ items: v.pipe(v.array(SEvent), v.maxLength(100)) }),
    SOffsetPage,
    SReportFreshness,
  ]),
)
const SEventBreakdownPage = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      items: v.pipe(
        v.array(
          v.strictObject({
            field: v.picklist(EVENT_FIELDS),
            value: v.pipe(v.string(), v.maxLength(2048)),
            count: SNonNegativeInteger,
          }),
        ),
        v.maxLength(100),
      ),
    }),
    SOffsetPage,
    SReportFreshness,
  ]),
)
export const SEventBreakdowns = v.strictObject(
  v.entriesFromObjects([
    SEventBreakdownPage,
    v.strictObject({ comparison: v.optional(v.nullable(SEventBreakdownPage)) }),
  ]),
)
