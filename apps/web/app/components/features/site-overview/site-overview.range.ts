import type { OverviewRange, OverviewRangeGranularity } from './site-overview.types'

export interface OverviewRangeRequest {
  readonly fromDate: string
  readonly toDate: string
  readonly granularity: OverviewRangeGranularity
  readonly comparison: { readonly fromDate: string; readonly toDate: string } | undefined
}

interface CalendarDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

interface ResolvedPeriod {
  readonly fromDate: string
  readonly toDate: string
}

const DAY = 86_400_000

const RANGE_GRANULARITY: Readonly<Record<OverviewRange, OverviewRangeGranularity>> = {
  '7d': 'day',
  '30d': 'day',
  '90d': 'day',
  '12m': 'month',
}

const RANGE_DAYS: Readonly<Record<Exclude<OverviewRange, '12m'>, number>> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

const MONTHS_IN_YEAR = 12

export const overviewRangeOptions: readonly {
  readonly value: OverviewRange
  readonly label: string
}[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
]

export function overviewRangeGranularity(range: OverviewRange): OverviewRangeGranularity {
  return RANGE_GRANULARITY[range]
}

function parseDate(value: string): CalendarDate {
  const [year, month, day] = value.split('-').map(Number)

  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toUtc(value: string): Date {
  const { year, month, day } = parseDate(value)

  return new Date(Date.UTC(year, month - 1, day))
}

function shiftDays(value: string, days: number): string {
  return formatDate(new Date(toUtc(value).getTime() + days * DAY))
}

function firstDayOfMonthsAgo(value: string, months: number): string {
  const { year, month } = parseDate(value)
  const total = year * MONTHS_IN_YEAR + (month - 1) - months

  return formatDate(
    new Date(Date.UTC(Math.floor(total / MONTHS_IN_YEAR), total % MONTHS_IN_YEAR, 1)),
  )
}

function currentPeriod(range: OverviewRange, today: string): ResolvedPeriod {
  if (range === '12m') {
    return { fromDate: firstDayOfMonthsAgo(today, 11), toDate: today }
  }

  return { fromDate: shiftDays(today, -(RANGE_DAYS[range] - 1)), toDate: today }
}

function periodLengthDays(period: ResolvedPeriod): number {
  return Math.round((toUtc(period.toDate).getTime() - toUtc(period.fromDate).getTime()) / DAY)
}

/**
 * Resolves a range into the contract's date shape.
 *
 * The contract's isValidReportRange demands a comparison window that is the same length as the
 * current one and ends the day before it starts, so the comparison is derived from the resolved
 * current period instead of measured backwards from a fixed offset.
 */
export function resolveOverviewRangeRequest(
  range: OverviewRange,
  today: string,
  comparison: boolean,
): OverviewRangeRequest {
  const current = currentPeriod(range, today)
  const length = periodLengthDays(current)

  return {
    fromDate: current.fromDate,
    toDate: current.toDate,
    granularity: RANGE_GRANULARITY[range],
    comparison: comparison
      ? {
          fromDate: shiftDays(current.fromDate, -(length + 1)),
          toDate: shiftDays(current.fromDate, -1),
        }
      : undefined,
  }
}

export function countOverviewRangeDays(range: OverviewRange, today: string): number {
  return periodLengthDays(currentPeriod(range, today)) + 1
}
