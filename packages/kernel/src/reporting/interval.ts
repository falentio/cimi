import {
  addCalendarDays,
  calendarDaysInclusive,
  compareCalendarDates,
  enumerateLocalBucketStarts,
  formatLocalCalendarDate,
  resolveLocalDateStart,
  type LocalCalendarDate,
} from '@cimi/utils'

import { ReportingAdmissionError, badReportingRequest } from './errors.ts'
import type {
  BucketDemand,
  BucketStart,
  InclusiveDateRange,
  ProjectionGap,
  ResolvedPeriod,
  ResolvedPeriods,
  SiteReportingMetadata,
} from './types.ts'
import {
  calendarDateParts,
  createInstantMs,
  instantFromDate,
  type CalendarDate,
  type HalfOpenInterval,
} from './types.ts'

export function resolveReportPeriods(input: {
  readonly metadata: SiteReportingMetadata
  readonly current: InclusiveDateRange
  readonly comparison?: InclusiveDateRange
  readonly bucket?: BucketDemand
}): ResolvedPeriods {
  try {
    const current = resolvePeriod({
      key: 'current',
      dates: input.current,
      metadata: input.metadata,
      bucket: input.bucket,
    })
    const comparison =
      input.comparison === undefined
        ? null
        : resolvePeriod({
            key: 'comparison',
            dates: input.comparison,
            metadata: input.metadata,
            bucket: input.bucket,
          })

    if (comparison !== null) {
      const comparisonToNext = formatLocalCalendarDate(
        addCalendarDays(calendarDateParts(comparison.dates.toDate), 1),
      )
      if (comparisonToNext !== current.dates.fromDate) {
        throw badReportingRequest('comparison-not-adjacent')
      }
      if (comparison.calendarDays !== current.calendarDays) {
        throw badReportingRequest('comparison-not-equal-length')
      }
    }

    return { current, comparison }
  } catch (error) {
    if (error instanceof ReportingAdmissionError) throw error
    throw badReportingRequest('invalid-period')
  }
}

export function findRelevantProjectionGap(
  gaps: readonly ProjectionGap[],
  periods: ResolvedPeriods,
): ProjectionGap | undefined {
  for (const gap of gaps) {
    if (gap.unbounded || !isBoundedGap(gap)) return gap
    if (periodsOverlapGap(periods.current.interval, gap)) return gap
    if (periods.comparison !== null && periodsOverlapGap(periods.comparison.interval, gap)) {
      return gap
    }
  }
  return undefined
}

function resolvePeriod(input: {
  readonly key: 'current' | 'comparison'
  readonly dates: InclusiveDateRange
  readonly metadata: SiteReportingMetadata
  readonly bucket: BucketDemand | undefined
}): ResolvedPeriod {
  const fromDate = calendarDateParts(input.dates.fromDate)
  const toDate = calendarDateParts(input.dates.toDate)
  if (compareCalendarDates(fromDate, toDate) > 0) {
    throw badReportingRequest('invalid-period')
  }

  const toDateExclusive = addCalendarDays(toDate, 1)
  const start = resolveLocalDateStart({
    date: fromDate,
    timeZone: input.metadata.reportingTimezone,
  })
  const endExclusive = resolveLocalDateStart({
    date: toDateExclusive,
    timeZone: input.metadata.reportingTimezone,
  })
  const interval: HalfOpenInterval = {
    start: instantFromDate(start),
    endExclusive: instantFromDate(endExclusive),
  }
  if (interval.endExclusive <= interval.start) throw badReportingRequest('invalid-period')

  return {
    key: input.key,
    dates: input.dates,
    interval,
    calendarDays: calendarDaysInclusive(fromDate, toDate),
    bucketStarts:
      input.bucket === undefined
        ? null
        : resolveBucketStarts({
            fromDate: input.dates.fromDate,
            toDateExclusive,
            metadata: input.metadata,
            bucket: input.bucket,
          }),
  }
}

function resolveBucketStarts(input: {
  readonly fromDate: CalendarDate
  readonly toDateExclusive: LocalCalendarDate
  readonly metadata: SiteReportingMetadata
  readonly bucket: BucketDemand
}): readonly BucketStart[] {
  if (!Number.isInteger(input.bucket.maxStarts) || input.bucket.maxStarts < 0) {
    throw badReportingRequest('bucket-bound')
  }
  const starts = enumerateLocalBucketStarts({
    fromDate: calendarDateParts(input.fromDate),
    toDateExclusive: input.toDateExclusive,
    timeZone: input.metadata.reportingTimezone,
    granularity: input.bucket.granularity,
    weekStartsOn: input.metadata.weekStartsOn,
    maxStarts: input.bucket.maxStarts,
  })
  if (starts.length > input.bucket.maxStarts) throw badReportingRequest('bucket-bound')
  return starts.map((start) => ({
    at: createInstantMs(start.instant.getTime()),
    localLabel: `${formatLocalCalendarDate(start.local)}T${String(start.local.hour).padStart(2, '0')}:${String(start.local.minute).padStart(2, '0')}:00`,
    offsetMinutes: start.offsetMinutes,
  }))
}

function isBoundedGap(gap: ProjectionGap): boolean {
  return (
    gap.occurrenceFrom !== null &&
    gap.occurrenceTo !== null &&
    Number.isFinite(gap.occurrenceFrom) &&
    Number.isFinite(gap.occurrenceTo) &&
    gap.occurrenceTo > gap.occurrenceFrom
  )
}

function periodsOverlapGap(interval: HalfOpenInterval, gap: ProjectionGap): boolean {
  if (gap.occurrenceFrom === null || gap.occurrenceTo === null) return true
  return gap.occurrenceFrom < interval.endExclusive && interval.start < gap.occurrenceTo
}
