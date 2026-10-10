import {
  addCalendarDays,
  compareCalendarDates,
  enumerateLocalBucketStarts,
  parseLocalCalendarDate,
  type LocalWeekStart,
} from '@cimi/utils'
import { normalizeCohortFilters } from './cohort-filters'
import type {
  CohortDateRange,
  CohortQueryState,
  CohortReportBlockedReason,
  CohortReportFilter,
  CohortSelectionStatus,
  SCohort,
  SCohortPeriodCadence,
  SCohortReportInput,
} from './cohort-retention.types'

export const MAX_REPORT_PERIODS = 12

export const MAX_REPORT_FILTERS = 20

const DAYS_IN_MS = 86_400_000

export type CohortReportRequest =
  | { readonly kind: 'input'; readonly input: SCohortReportInput }
  | { readonly kind: 'blocked'; readonly reason: CohortReportBlockedReason }

/**
 * Counts the whole calendar buckets the inclusive range touches, with the same
 * primitive the server counts with. A thirteenth bucket is rejected, never
 * clamped, so an over-long range fails visibly instead of silently shortening.
 */
export function countReportPeriods(input: {
  readonly period: SCohortPeriodCadence
  readonly fromDate: string
  readonly toDate: string
  readonly weekStartsOn?: LocalWeekStart
}): number {
  const from = parseLocalCalendarDate(input.fromDate)
  const to = parseLocalCalendarDate(input.toDate)

  if (compareCalendarDates(from, to) > 0) return 0

  const starts = enumerateLocalBucketStarts({
    fromDate: from,
    toDateExclusive: addCalendarDays(to, 1),
    timeZone: 'UTC',
    granularity: input.period,
    weekStartsOn: input.weekStartsOn ?? 'monday',
    maxStarts: MAX_REPORT_PERIODS + 1,
  })

  return starts.length
}

export function countCohortPeriods(period: SCohortPeriodCadence, range: CohortDateRange): number {
  return countReportPeriods({ period, fromDate: range.fromDate, toDate: range.toDate })
}

export function parseCohortDate(value: string | undefined): string | null {
  if (value === undefined) return null

  try {
    return formatCalendarDate(parseLocalCalendarDate(value))
  } catch {
    return null
  }
}

export function shiftCohortPeriod(
  date: string,
  period: SCohortPeriodCadence,
  count: number,
): string {
  const shifted = parseLocalCalendarDate(date)

  if (period === 'day') return formatCalendarDate(addCalendarDays(shifted, count))

  if (period === 'week') return formatCalendarDate(addCalendarDays(shifted, count * 7))

  const totalMonths = shifted.year * 12 + (shifted.month - 1) + count
  const year = Math.floor(totalMonths / 12)
  const month = (((totalMonths % 12) + 12) % 12) + 1

  return formatCalendarDate({ year, month, day: Math.min(shifted.day, daysInMonth(year, month)) })
}

export function defaultCohortRange(period: SCohortPeriodCadence, today: string): CohortDateRange {
  return { fromDate: shiftCohortPeriod(today, period, -(MAX_REPORT_PERIODS - 1)), toDate: today }
}

export function clampCohortRange(
  range: CohortDateRange,
  period: SCohortPeriodCadence,
  today: string,
): CohortDateRange {
  const bounded =
    parseCohortDate(range.toDate) !== null && range.toDate > today
      ? { fromDate: range.fromDate, toDate: today }
      : range

  if (countCohortPeriods(period, bounded) <= MAX_REPORT_PERIODS) return bounded

  return defaultCohortRange(period, today)
}

/** The contract hard-codes comparison adjacency: the window ends the day before the range starts. */
export function buildCohortComparison(range: CohortDateRange): CohortDateRange {
  const spanDays = daysBetween(range.fromDate, range.toDate) + 1

  return {
    fromDate: shiftCohortPeriod(range.fromDate, 'day', -spanDays),
    toDate: shiftCohortPeriod(range.fromDate, 'day', -1),
  }
}

export function isCohortComparisonAllowed(
  range: CohortDateRange,
  comparison: CohortDateRange,
): boolean {
  return (
    daysBetween(range.fromDate, range.toDate) ===
      daysBetween(comparison.fromDate, comparison.toDate) &&
    daysBetween(comparison.toDate, range.fromDate) === 1
  )
}

/**
 * The only place the page's query state becomes a contract call. Structural
 * problems first, then the cadence bound, then the comparison rule.
 */
export function resolveCohortReportRequest(input: {
  siteId: string | undefined
  cohort: Pick<SCohort, 'id' | 'period'> | undefined
  selectionStatus: CohortSelectionStatus
  range: CohortDateRange | undefined
  comparison: boolean
  filters: readonly CohortReportFilter[]
  today?: () => string
}): CohortReportRequest {
  if (input.siteId === undefined || input.siteId.trim() === '') {
    return { kind: 'blocked', reason: { kind: 'site-unresolved' } }
  }

  if (input.cohort === undefined) {
    return { kind: 'blocked', reason: { kind: 'cohort-unselected' } }
  }

  const today = input.today?.()
  const range = input.range ?? defaultCohortRange(input.cohort.period, today ?? utcToday())
  const from = parseCohortDate(range.fromDate)
  const to = parseCohortDate(range.toDate)

  if (from === null || to === null || from > to) {
    return { kind: 'blocked', reason: { kind: 'range-invalid', range } }
  }

  if (countCohortPeriods(input.cohort.period, range) > MAX_REPORT_PERIODS) {
    return {
      kind: 'blocked',
      reason: { kind: 'range-over-periods', maxPeriods: MAX_REPORT_PERIODS },
    }
  }

  const filters = normalizeCohortFilters(input.filters)

  if (filters.length > MAX_REPORT_FILTERS) {
    return { kind: 'blocked', reason: { kind: 'filters-invalid', filters } }
  }

  const comparison = input.comparison ? buildCohortComparison(range) : undefined

  if (comparison !== undefined && !isCohortComparisonAllowed(range, comparison)) {
    return { kind: 'blocked', reason: { kind: 'range-invalid', range } }
  }

  const filterList: CohortReportFilter[] = [...filters]

  return {
    kind: 'input',
    input: {
      cohortId: input.cohort.id,
      fromDate: range.fromDate,
      toDate: range.toDate,
      ...(comparison !== undefined && { comparison }),
      ...(filterList.length > 0 && { filters: filterList }),
    },
  }
}

export function resolveCohortReportRequestFromQuery(input: {
  siteId: string | undefined
  cohort: Pick<SCohort, 'id' | 'period'> | undefined
  query: CohortQueryState
  today?: () => string
}): CohortReportRequest {
  const { query } = input

  return resolveCohortReportRequest({
    siteId: input.siteId,
    cohort: input.cohort,
    selectionStatus: query.selection.status,
    range: query.range,
    comparison: query.comparison,
    filters: query.filters,
    today: input.today,
  })
}

export function cohortReportRequestKey(request: CohortReportRequest): string {
  return request.kind === 'blocked'
    ? 'blocked:' + blockedReasonKey(request.reason)
    : 'input:' + reportInputKey(request.input)
}

export function isCurrentCohortRequest(request: CohortReportRequest, today: string): boolean {
  if (request.kind !== 'input') return false

  return request.input.toDate >= today
}

function reportInputKey(input: SCohortReportInput): string {
  const comparison = input.comparison

  const parts = [
    input.cohortId,
    input.fromDate,
    input.toDate,
    comparison === undefined ? 'none' : comparison.fromDate + '..' + comparison.toDate,
    JSON.stringify(input.filters ?? []),
  ]

  return parts.join('|')
}

function blockedReasonKey(reason: CohortReportBlockedReason): string {
  if (reason.kind === 'range-over-periods') {
    return 'range-over-periods:' + String(reason.maxPeriods)
  }

  if (reason.kind === 'range-invalid') {
    return 'range-invalid:' + reason.range.fromDate + '..' + reason.range.toDate
  }

  if (reason.kind === 'filters-invalid') return 'filters-invalid:' + String(reason.filters.length)

  return reason.kind
}

function utcToday(): string {
  const now = new Date()

  return formatCalendarDate({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  })
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAYS_IN_MS)
}

function formatCalendarDate(date: {
  readonly year: number
  readonly month: number
  readonly day: number
}): string {
  return (
    String(date.year).padStart(4, '0') +
    '-' +
    String(date.month).padStart(2, '0') +
    '-' +
    String(date.day).padStart(2, '0')
  )
}

function daysInMonth(year: number, month: number): number {
  const date = new Date(0)

  date.setUTCFullYear(year, month, 0)
  date.setUTCHours(0, 0, 0, 0)

  return date.getUTCDate()
}
