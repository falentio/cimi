import * as v from 'valibot'

import { SName } from '@cimi/utils'
import { toORPCErrorMap } from './errors.ts'

export {
  canonicalizeHostname,
  SHostname,
  SIanaTimezone,
  SId,
  SName,
  SWeekStart,
  type Hostname,
  type IanaTimezone,
  type Id,
  type Name,
  type WeekStart,
} from '@cimi/utils'
export {
  ERRORS,
  ERROR_CATALOG,
  getErrorDefinition,
  toORPCErrorMap,
  type ContractErrorCode,
  type ContractErrorDefinition,
} from './errors.ts'

export const isWithinSerializedByteLimit = (value: unknown, maxBytes: number) => {
  const serialized = JSON.stringify(value)
  return serialized !== undefined && new TextEncoder().encode(serialized).byteLength <= maxBytes
}
const isValidCalendarDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}
export const SDateTime = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/),
  v.check((value) => {
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|[+-](\d{2}):(\d{2}))$/,
    )
    if (!match) return false
    const [
      ,
      yearString,
      monthString,
      dayString,
      hourString,
      minuteString,
      secondString,
      offsetHourString,
      offsetMinuteString,
    ] = match
    const year = Number(yearString)
    const month = Number(monthString)
    const day = Number(dayString)
    const hour = Number(hourString)
    const minute = Number(minuteString)
    const second = Number(secondString)
    const offsetHour = offsetHourString === undefined ? undefined : Number(offsetHourString)
    const offsetMinute = offsetMinuteString === undefined ? undefined : Number(offsetMinuteString)
    return (
      isValidCalendarDate(year, month, day) &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59 &&
      (offsetHour === undefined || offsetHour <= 23) &&
      (offsetMinute === undefined || offsetMinute <= 59)
    )
  }, 'Expected a valid ISO date-time.'),
)
export const SUtcDateTime = v.pipe(
  SDateTime,
  v.check((value) => value.endsWith('Z'), 'Expected a UTC date-time.'),
)
export const SDate = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/),
  v.check((value) => {
    const [yearString, monthString, dayString] = value.split('-')
    const year = Number(yearString)
    const month = Number(monthString)
    const day = Number(dayString)
    return isValidCalendarDate(year, month, day)
  }, 'Expected a valid calendar date.'),
)
export const SPageSize = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))
export const SOffset = v.pipe(v.number(), v.integer(), v.minValue(0))
const SQueryNumber = v.union([
  v.number(),
  v.pipe(
    v.string(),
    v.check((value) => value.trim() !== ''),
    v.toNumber(),
  ),
])
const SQueryPageSize = v.pipe(SQueryNumber, v.integer(), v.minValue(1), v.maxValue(100))
const SQueryOffset = v.pipe(SQueryNumber, v.integer(), v.minValue(0))
export const SOffsetPaginationInput = v.strictObject({
  offset: v.optional(SQueryOffset),
  limit: v.optional(SQueryPageSize),
})
export const SOffsetPage = v.strictObject({
  nextOffset: v.nullable(SOffset),
  hasMore: v.boolean(),
  totalCount: v.pipe(v.number(), v.finite(), v.integer(), v.minValue(0)),
})
export const SNonNegativeInteger = v.pipe(v.number(), v.finite(), v.integer(), v.minValue(0))
export const SFiniteNumber = v.pipe(v.number(), v.finite())
export const SNonNegativeNumber = v.pipe(SFiniteNumber, v.minValue(0))
export const SRate = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1))
export const SPageItems = <T extends v.GenericSchema>(schema: T) =>
  v.pipe(v.array(schema), v.maxLength(100))
export const MAX_MINUTE_REPORT_BUCKETS = 1_800
export const MAX_PUBLIC_DASHBOARD_BUCKETS = 2_161
export const SScalar = v.union([
  v.pipe(v.string(), v.maxLength(512)),
  v.pipe(v.number(), v.finite()),
  v.boolean(),
  v.null(),
])
export const SScalarKey = v.pipe(v.string(), v.minLength(1), v.maxLength(64))
export const SScalarMap = v.record(SScalarKey, SScalar)

export const SSortDirection = v.picklist(['asc', 'desc'])
export const SIdentityKind = v.picklist(['visitor', 'identified_user'])
export const SGranularity = v.picklist(['minute', 'hour', 'day', 'week', 'month', 'year'])
export const SEventKind = v.picklist([
  'page_view',
  'custom_event',
  'outbound',
  'performance',
  'error',
])

export const SFilterOperator = v.picklist([
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
])
export const SAuthenticatedFilterOperator = v.picklist([
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  'has_done',
  'has_not_done',
])
export const SFilterValues = v.pipe(v.array(SScalar), v.minLength(1), v.maxLength(20))

export const SPropertyFilter = v.strictObject({
  field: SScalarKey,
  operator: SFilterOperator,
  values: SFilterValues,
})

const SReportFilterCommonFields = {
  operator: SFilterOperator,
  values: SFilterValues,
}
const SScopedAttributeFilter = v.variant('scope', [
  v.strictObject({
    scope: v.literal('event'),
    field: v.picklist(['kind', 'name', 'pagePath', 'referrer', 'destination', 'unit', 'code']),
    ...SReportFilterCommonFields,
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
      'entryPage',
      'exitPage',
      'utmSource',
      'utmMedium',
      'utmCampaign',
    ]),
    ...SReportFilterCommonFields,
  }),
  v.strictObject({
    scope: v.literal('visitor'),
    field: v.picklist(['identityKind']),
    ...SReportFilterCommonFields,
  }),
  v.strictObject({
    scope: v.literal('profile'),
    field: v.pipe(v.string(), v.regex(/^trait\.[A-Za-z0-9_.-]{1,63}$/)),
    ...SReportFilterCommonFields,
  }),
])

export const SEventAction = v.variant('kind', [
  v.strictObject({ kind: v.literal('page_view') }),
  v.strictObject({ kind: v.literal('custom_event'), name: SName }),
  v.strictObject({ kind: v.literal('outbound'), name: SName }),
  v.strictObject({ kind: v.literal('performance'), name: SName }),
  v.strictObject({ kind: v.literal('error'), name: SName }),
])
export const SHasDoneFilter = v.strictObject({
  scope: v.literal('visitor'),
  operator: v.picklist(['has_done', 'has_not_done']),
  action: SEventAction,
})
export const SAuthenticatedFilter = v.union([SScopedAttributeFilter, SHasDoneFilter])

export const SScopedQueryFilter = v.pipe(
  SAuthenticatedFilter,
  v.check((input) => {
    if (input.operator === 'has_done' || input.operator === 'has_not_done') return true
    if (!('values' in input)) return false
    if (input.scope === 'profile') return true
    if (input.scope === 'visitor') {
      return input.values.every((value) => value === 'visitor' || value === 'identified_user')
    }
    if (input.scope === 'event' && input.field === 'kind') {
      return input.values.every((value) =>
        ['page_view', 'custom_event', 'outbound', 'performance', 'error'].includes(String(value)),
      )
    }
    return input.values.every((value) => typeof value === 'string')
  }, 'Report filters require values compatible with the selected field.'),
)

export const SCursor = v.pipe(v.string(), v.minLength(1), v.maxLength(4096))
export const SPaginationInput = v.strictObject({
  cursor: v.optional(SCursor),
  limit: v.optional(SPageSize),
})
export const SQueryFilter = v.strictObject({
  field: SScalarKey,
  operator: SFilterOperator,
  values: SFilterValues,
})
export const queryFields = {
  from: SDateTime,
  to: SDateTime,
  filters: v.optional(v.pipe(v.array(SQueryFilter), v.maxLength(20))),
  sort: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
  direction: v.optional(SSortDirection),
  cursor: v.optional(SCursor),
  limit: v.optional(SPageSize),
}
export const SQueryInput = v.strictObject(queryFields)

export const SReportFields = {
  fromDate: SDate,
  toDate: SDate,
  comparison: v.optional(v.strictObject({ fromDate: SDate, toDate: SDate })),
  filters: v.optional(v.pipe(v.array(SScopedQueryFilter), v.maxLength(20))),
}
export const SReportFieldsSchema = v.strictObject(SReportFields)
export const SReportListFieldsSchema = v.strictObject({
  fromDate: SDate,
  toDate: SDate,
  filters: v.optional(v.pipe(v.array(SScopedQueryFilter), v.maxLength(20))),
})
const dateToDay = (date: string) => Date.parse(`${date}T00:00:00Z`)
const day = 86_400_000
const isOrderedDateRange = (fromDate: string, toDate: string) =>
  dateToDay(fromDate) <= dateToDay(toDate)
const isRangeWithinGranularity = (fromDate: string, toDate: string, granularity: string) => {
  if (!isOrderedDateRange(fromDate, toDate)) return false
  const days = (dateToDay(toDate) - dateToDay(fromDate)) / 86_400_000 + 1
  if (granularity === 'minute') return days <= 1
  if (granularity === 'hour') return days <= 30
  return true
}
export const isValidReportRange = (input: {
  fromDate: string
  toDate: string
  comparison?: { fromDate: string; toDate: string } | undefined
  [key: string]: unknown
}) =>
  isOrderedDateRange(input.fromDate, input.toDate) &&
  (input.comparison === undefined ||
    (isOrderedDateRange(input.comparison.fromDate, input.comparison.toDate) &&
      dateToDay(input.comparison.toDate) + day === dateToDay(input.fromDate) &&
      dateToDay(input.toDate) - dateToDay(input.fromDate) ===
        dateToDay(input.comparison.toDate) - dateToDay(input.comparison.fromDate)))
export const isValidGranularReportRange = (input: {
  fromDate: string
  toDate: string
  granularity: string
  comparison?: { fromDate: string; toDate: string } | undefined
  [key: string]: unknown
}) => {
  if (!isValidReportRange(input)) return false
  return (
    isRangeWithinGranularity(input.fromDate, input.toDate, input.granularity) &&
    (input.comparison === undefined ||
      isRangeWithinGranularity(
        input.comparison.fromDate,
        input.comparison.toDate,
        input.granularity,
      ))
  )
}
export const SReportInput = v.pipe(
  SReportFieldsSchema,
  v.check((input) => isValidReportRange(input), 'Report date ranges must be ordered.'),
)
export const SGranularReportFields = {
  ...SReportFields,
  granularity: SGranularity,
}
export const SGranularReportFieldsSchema = v.strictObject(SGranularReportFields)
export const SGranularReportInput = v.pipe(
  SGranularReportFieldsSchema,
  v.check(
    (input) => isValidGranularReportRange(input),
    'Report range is invalid for its granularity.',
  ),
)
export const SReportFreshness = v.strictObject({
  projectedAcceptanceSequence: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  occurrenceTimeCoverageThrough: v.nullable(SDateTime),
  status: v.picklist(['current', 'stale']),
})

export const SCreated = v.strictObject({
  createdAt: SDateTime,
  updatedAt: SDateTime,
})

export const EAuthenticatedRead = {
  ...toORPCErrorMap('UNAUTHORIZED', 'NOT_FOUND'),
}

export const EConfigurationRead = {
  ...EAuthenticatedRead,
} as const

export const EAdministratorRead = {
  ...toORPCErrorMap('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'),
}

export const EAnalyticsExecution = {
  ...toORPCErrorMap('UNAUTHORIZED', 'NOT_FOUND', 'SERVICE_UNAVAILABLE', 'QUERY_LIMIT_EXCEEDED'),
}

export const EAuthenticatedCommand = {
  ...toORPCErrorMap('UNAUTHORIZED', 'NOT_FOUND', 'CONFLICT'),
}

// These names remain stable for existing imports; new procedures should choose
// the narrow catalog that matches their documented behavior.
export const ERead = EAuthenticatedRead
export const EQuery = EAnalyticsExecution
export const ECommand = EAuthenticatedCommand

export const EIngestion = {
  ...toORPCErrorMap(
    'BAD_REQUEST',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'PAYLOAD_TOO_LARGE',
    'TOO_MANY_REQUESTS',
    'SERVICE_UNAVAILABLE',
  ),
}

export const EBatchIngestion = {
  ...toORPCErrorMap(
    'BAD_REQUEST',
    'NOT_FOUND',
    'PAYLOAD_TOO_LARGE',
    'TOO_MANY_REQUESTS',
    'SERVICE_UNAVAILABLE',
  ),
}
