import type { OverviewRange } from './site-overview.types'

/** How far the previous period is shifted back from the current one, per range. */
const PREVIOUS_PERIOD_OFFSET: Readonly<Record<OverviewRange, { days: number; months: number }>> = {
  '7d': { days: 7, months: 0 },
  '30d': { days: 30, months: 0 },
  '90d': { days: 90, months: 0 },
  '12m': { days: 0, months: 12 },
}

/** `en-GB` with a fixed UTC zone renders as `12 May`, i.e. `DD MMMM`, independent of the host timezone. */
const dayMonthFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** Formats a date or ISO string as `DD MMMM`, e.g. `12 May`. */
export function formatDayMonth(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return dayMonthFormatter.format(date)
}

/**
 * Shifts a date back by the range's previous-period offset.
 * Arithmetic is done in UTC so that date-only inputs (parsed as UTC midnight)
 * never drift a day on hosts in a negative timezone offset.
 */
export function resolvePreviousDate(value: string | Date, range: OverviewRange): Date {
  const date = typeof value === 'string' ? new Date(value) : new Date(value.getTime())
  const { days, months } = PREVIOUS_PERIOD_OFFSET[range]
  date.setUTCMonth(date.getUTCMonth() - months)
  date.setUTCDate(date.getUTCDate() - days)
  return date
}

/** Label pair for the tooltip: the hovered date and the previous-period date. */
export function resolveTooltipDates(
  value: string | undefined,
  range: OverviewRange,
): { current: string; previous: string } {
  if (value === undefined) return { current: '', previous: '' }
  return {
    current: formatDayMonth(value),
    previous: formatDayMonth(resolvePreviousDate(value, range)),
  }
}
