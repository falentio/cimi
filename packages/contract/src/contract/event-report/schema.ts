import * as v from 'valibot'
import {
  SDate,
  SDateTime,
  MAX_MINUTE_REPORT_BUCKETS,
  SEventKind,
  SFiniteNumber,
  SGranularity,
  SId,
  SNonNegativeInteger,
  SOffsetPage,
  SReportFreshness,
  SScalar,
  SScalarKey,
  SName,
  isValidReportRange,
} from '../../schema/index.ts'

export const SEventSiteFields = v.strictObject({ siteId: SId, eventKind: v.optional(SEventKind) })
const SEventReportFilterCommonFields = {
  operator: v.picklist(['equals', 'not_equals', 'contains', 'greater_than', 'less_than']),
  values: v.pipe(v.array(SScalar), v.minLength(1), v.maxLength(20)),
}
const SEventReportFilterField = v.union([
  v.picklist(['kind', 'name', 'pagePath', 'referrer', 'destination', 'unit', 'code']),
  v.pipe(v.string(), v.regex(/^property\.[A-Za-z0-9_.-]{1,63}$/)),
])
export const SEventReportFilter = v.strictObject({
  scope: v.literal('event'),
  field: SEventReportFilterField,
  ...SEventReportFilterCommonFields,
})
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
          v.strictObject({ at: SDateTime, count: SNonNegativeInteger, complete: v.boolean() }),
        ),
        v.maxLength(MAX_MINUTE_REPORT_BUCKETS),
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
  occurredAt: SDateTime,
  createdAt: SDateTime,
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
            field: v.picklist([
              'kind',
              'name',
              'pagePath',
              'referrer',
              'destination',
              'unit',
              'code',
            ]),
            value: v.pipe(v.string(), v.maxLength(512)),
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
