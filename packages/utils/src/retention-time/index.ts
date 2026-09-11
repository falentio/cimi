import { parse } from 'valibot'
import { SIanaTimezone } from '../schema/index.ts'
import {
  getLocalCalendarDateTime,
  resolveLocalDateStart,
  subtractCalendarMonths,
} from './local-calendar.ts'

export {
  addCalendarDays,
  calendarDaysInclusive,
  compareCalendarDates,
  enumerateLocalBucketStarts,
  formatLocalCalendarDate,
  getLocalCalendarDateTime,
  localOffsetMinutes,
  parseLocalCalendarDate,
  resolveLocalDateStart,
  resolveLocalDateTimeInstants,
  subtractCalendarMonths,
  type EnumerateLocalBucketStartsInput,
  type LocalBucketGranularity,
  type LocalBucketStart,
  type LocalCalendarDate,
  type LocalCalendarDateTime,
  type LocalWeekStart,
} from './local-calendar.ts'

export interface ResolveSiteLocalCutoffInput {
  readonly now: Date
  readonly timeZone: string
  readonly retentionMonths: number
}

export interface ResolveSiteLocalDayInput {
  readonly now: Date
  readonly timeZone: string
}

export function resolveSiteLocalCutoff(input: ResolveSiteLocalCutoffInput): Date {
  assertValidInput(input.now, input.timeZone, input.retentionMonths)
  const currentDate = getLocalCalendarDateTime(input.now, input.timeZone)
  const targetDate = subtractCalendarMonths(currentDate, input.retentionMonths)
  return resolveLocalDateStart({ date: targetDate, timeZone: input.timeZone })
}

export function resolveSiteLocalDay(input: ResolveSiteLocalDayInput): string {
  assertValidInput(input.now, input.timeZone)
  const date = getLocalCalendarDateTime(input.now, input.timeZone)
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function assertValidInput(now: Date, timeZone: string, retentionMonths?: number): void {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Expected a valid instant')
  parse(SIanaTimezone, timeZone)
  if (
    retentionMonths !== undefined &&
    (!Number.isInteger(retentionMonths) || retentionMonths < 1 || retentionMonths > 120)
  ) {
    throw new RangeError('Retention months must be an integer from 1 through 120')
  }
}
