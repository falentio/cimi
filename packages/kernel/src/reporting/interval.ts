import {
  addCalendarDays,
  calendarDaysInclusive,
  compareCalendarDates,
  enumerateLocalBucketStarts,
  formatLocalCalendarDate,
  resolveLocalDateStart,
  type LocalWeekStart,
  type LocalCalendarDate,
} from '@cimi/utils'

import { ReportingAdmissionError, badReportingRequest, queryLimitExceeded } from './errors.ts'
import type {
  BucketDemand,
  BucketStart,
  InclusiveDateRange,
  PeriodKey,
  ProjectionGap,
  ResolvedPeriod,
  ResolvedPeriods,
  SiteReportingMetadata,
  Periodization,
} from './types.ts'
import {
  calendarDateParts,
  calendarDateValue,
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

export function resolvePeriodSequence(input: {
  readonly key: PeriodKey
  readonly metadata: SiteReportingMetadata
  readonly dates: InclusiveDateRange
  readonly periodization: Periodization
}): readonly ResolvedPeriod[] {
  const { metadata, dates, periodization } = input
  if (!Number.isInteger(periodization.maxPeriods) || periodization.maxPeriods < 1) {
    throw badReportingRequest('period-bound')
  }

  const from = calendarDateParts(dates.fromDate)
  const to = calendarDateParts(dates.toDate)
  if (compareCalendarDates(from, to) > 0) throw badReportingRequest('invalid-period')

  const first = startOfPeriod(from, periodization.kind, metadata.weekStartsOn)
  const periods: ResolvedPeriod[] = []
  for (let index = 0; ; index += 1) {
    if (index >= periodization.maxPeriods) throw badReportingRequest('period-bound')
    const periodFrom = addPeriod(first, index, periodization.kind)
    const nextFrom = addPeriod(first, index + 1, periodization.kind)
    const periodTo = addCalendarDays(nextFrom, -1)
    periods.push(
      resolvePeriod({
        key: input.key,
        dates: {
          fromDate: calendarDateValue(periodFrom),
          toDate: calendarDateValue(periodTo),
        },
        metadata,
        bucket: undefined,
      }),
    )
    if (compareCalendarDates(periodTo, to) >= 0) return periods
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

function startOfPeriod(
  date: LocalCalendarDate,
  kind: Periodization['kind'],
  weekStartsOn: LocalWeekStart,
): LocalCalendarDate {
  if (kind === 'day') return date
  if (kind === 'month') return { year: date.year, month: date.month, day: 1 }
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
  const weekStart = weekStartNumber(weekStartsOn)
  return addCalendarDays(date, -((weekday - weekStart + 7) % 7))
}

function addPeriod(
  date: LocalCalendarDate,
  amount: number,
  kind: Periodization['kind'],
): LocalCalendarDate {
  if (kind === 'day') return addCalendarDays(date, amount)
  if (kind === 'week') return addCalendarDays(date, amount * 7)
  const absoluteMonth = date.year * 12 + date.month - 1 + amount
  return {
    year: Math.floor(absoluteMonth / 12),
    month: (((absoluteMonth % 12) + 12) % 12) + 1,
    day: 1,
  }
}

function weekStartNumber(value: LocalWeekStart): number {
  switch (value) {
    case 'sunday':
      return 0
    case 'monday':
      return 1
    case 'tuesday':
      return 2
    case 'wednesday':
      return 3
    case 'thursday':
      return 4
    case 'friday':
      return 5
    case 'saturday':
      return 6
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
  if (starts.length > input.bucket.maxStarts) throw queryLimitExceeded('bucket-bound')
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
