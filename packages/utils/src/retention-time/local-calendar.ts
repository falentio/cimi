import { parse } from 'valibot'
import { SIanaTimezone } from '../schema/index.ts'

export interface LocalCalendarDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

export interface LocalCalendarDateTime extends LocalCalendarDate {
  readonly hour: number
  readonly minute: number
  readonly second: number
}

export type LocalBucketGranularity = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
export type LocalWeekStart =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface LocalBucketStart {
  readonly instant: Date
  readonly local: LocalCalendarDateTime
  readonly offsetMinutes: number
}

export interface EnumerateLocalBucketStartsInput {
  readonly fromDate: LocalCalendarDate
  readonly toDateExclusive: LocalCalendarDate
  readonly timeZone: string
  readonly granularity: LocalBucketGranularity
  readonly weekStartsOn: LocalWeekStart
  readonly maxStarts?: number
}

const DATE_TIME_PARTS = new Set(['year', 'month', 'day', 'hour', 'minute', 'second'])
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

export function parseLocalCalendarDate(value: string): LocalCalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) throw new RangeError('Expected a calendar date')
  const [, yearValue, monthValue, dayValue] = match
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  const date = { year, month, day }
  if (!isValidLocalCalendarDate(date)) throw new RangeError('Expected a valid calendar date')
  return date
}

export function formatLocalCalendarDate(date: LocalCalendarDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export function addCalendarDays(date: LocalCalendarDate, days: number): LocalCalendarDate {
  assertCalendarDate(date)
  if (!Number.isInteger(days)) throw new RangeError('Calendar day offset must be an integer')
  const moved = new Date(utcWallClock({ ...date, hour: 0, minute: 0, second: 0 }))
  moved.setUTCDate(moved.getUTCDate() + days)
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  }
}

export function subtractCalendarMonths(date: LocalCalendarDate, months: number): LocalCalendarDate {
  assertCalendarDate(date)
  if (!Number.isInteger(months)) throw new RangeError('Calendar month offset must be an integer')
  const absoluteMonth = date.year * 12 + date.month - 1 - months
  const year = Math.floor(absoluteMonth / 12)
  const month = (((absoluteMonth % 12) + 12) % 12) + 1
  const day = Math.min(date.day, daysInMonth(year, month))
  return { year, month, day }
}

export function compareCalendarDates(left: LocalCalendarDate, right: LocalCalendarDate): number {
  return (
    utcWallClock({ ...left, hour: 0, minute: 0, second: 0 }) -
    utcWallClock({ ...right, hour: 0, minute: 0, second: 0 })
  )
}

export function calendarDaysInclusive(
  fromDate: LocalCalendarDate,
  toDate: LocalCalendarDate,
): number {
  const distance =
    (utcWallClock({ ...toDate, hour: 0, minute: 0, second: 0 }) -
      utcWallClock({ ...fromDate, hour: 0, minute: 0, second: 0 })) /
    (24 * HOUR_MS)
  return Number.isInteger(distance) && distance >= 0 ? distance + 1 : 0
}

export function resolveLocalDateStart(input: {
  readonly date: LocalCalendarDate
  readonly timeZone: string
}): Date {
  assertCalendarDate(input.date)
  assertTimeZone(input.timeZone)
  const target = { ...input.date, hour: 0, minute: 0, second: 0 }
  const syntheticUtc = utcWallClock(target)
  const exact = resolveLocalDateTimeInstants({
    date: input.date,
    timeZone: input.timeZone,
    hour: 0,
    minute: 0,
    second: 0,
  })[0]
  if (exact !== undefined) return exact
  const firstSample = findFirstInstantOnLocalDate(input.date, input.timeZone, syntheticUtc)
  if (firstSample === undefined) throw new RangeError('Target local date does not exist')
  return firstSample
}

export function resolveLocalDateTimeInstants(input: {
  readonly date: LocalCalendarDate
  readonly timeZone: string
  readonly hour: number
  readonly minute: number
  readonly second?: number
}): readonly Date[] {
  assertCalendarDate(input.date)
  assertTimeZone(input.timeZone)
  const second = input.second ?? 0
  if (
    !Number.isInteger(input.hour) ||
    input.hour < 0 ||
    input.hour > 23 ||
    !Number.isInteger(input.minute) ||
    input.minute < 0 ||
    input.minute > 59 ||
    !Number.isInteger(second) ||
    second < 0 ||
    second > 59
  ) {
    throw new RangeError('Local time is invalid')
  }

  const target = { ...input.date, hour: input.hour, minute: input.minute, second }
  const syntheticUtc = utcWallClock(target)
  const offsets = new Set<number>()
  for (let hours = -48; hours <= 48; hours += 1) {
    const sample = new Date(syntheticUtc + hours * HOUR_MS)
    const local = getLocalCalendarDateTime(sample, input.timeZone)
    offsets.add(utcWallClock(local) - sample.getTime())
  }

  const candidates = [...offsets]
    .map((offset) => new Date(syntheticUtc - offset))
    .filter((candidate) =>
      isSameLocalCalendarDateTime(getLocalCalendarDateTime(candidate, input.timeZone), target),
    )
    .sort((left, right) => left.getTime() - right.getTime())

  return candidates.filter(
    (candidate, index) => index === 0 || candidate.getTime() !== candidates[index - 1]?.getTime(),
  )
}

export function getLocalCalendarDateTime(instant: Date, timeZone: string): LocalCalendarDateTime {
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Expected a valid instant')
  assertTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const values = new Map(
    parts
      .filter((part) => DATE_TIME_PARTS.has(part.type))
      .map((part) => [part.type, Number(part.value)]),
  )
  const year = values.get('year')
  const month = values.get('month')
  const day = values.get('day')
  const hour = values.get('hour')
  const minute = values.get('minute')
  const second = values.get('second')
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new Error('Timezone formatter did not return a complete date')
  }
  return { year, month, day, hour, minute, second }
}

export function localOffsetMinutes(instant: Date, timeZone: string): number {
  const local = getLocalCalendarDateTime(instant, timeZone)
  return Math.round((utcWallClock(local) - instant.getTime()) / MINUTE_MS)
}

export function enumerateLocalBucketStarts(
  input: EnumerateLocalBucketStartsInput,
): readonly LocalBucketStart[] {
  assertCalendarDate(input.fromDate)
  assertCalendarDate(input.toDateExclusive)
  assertTimeZone(input.timeZone)
  if (compareCalendarDates(input.fromDate, input.toDateExclusive) >= 0) return []
  if (
    input.maxStarts !== undefined &&
    (!Number.isInteger(input.maxStarts) || input.maxStarts < 0)
  ) {
    throw new RangeError('Maximum bucket starts must be a non-negative integer')
  }

  const starts: LocalBucketStart[] = []
  const append = (instant: Date, local: LocalCalendarDateTime): boolean => {
    starts.push({ instant, local, offsetMinutes: localOffsetMinutes(instant, input.timeZone) })
    return input.maxStarts !== undefined && starts.length > input.maxStarts
  }
  const appendWallTime = (date: LocalCalendarDate, hour: number, minute: number): boolean => {
    const localInstants = resolveLocalDateTimeInstants({
      date,
      timeZone: input.timeZone,
      hour,
      minute,
    })
    for (const instant of localInstants) {
      if (append(instant, { ...date, hour, minute, second: 0 })) return true
    }
    return false
  }

  for (
    let date = input.fromDate;
    compareCalendarDates(date, input.toDateExclusive) < 0;
    date = addCalendarDays(date, 1)
  ) {
    if (input.granularity === 'minute' || input.granularity === 'hour') {
      const minuteStep = input.granularity === 'minute' ? 1 : 60
      for (let minuteOfDay = 0; minuteOfDay < 24 * 60; minuteOfDay += minuteStep) {
        const hour = Math.floor(minuteOfDay / 60)
        const minute = minuteOfDay % 60
        if (appendWallTime(date, hour, minute)) return starts
      }
      continue
    }

    const shouldAppend =
      input.granularity === 'day' ||
      (input.granularity === 'week' &&
        localWeekday(date) === weekStartNumber(input.weekStartsOn)) ||
      (input.granularity === 'month' && date.day === 1) ||
      (input.granularity === 'year' && date.month === 1 && date.day === 1)
    if (!shouldAppend) continue
    const instant = resolveLocalDateStart({ date, timeZone: input.timeZone })
    if (append(instant, { ...date, hour: 0, minute: 0, second: 0 })) return starts
  }

  return starts
}

function findFirstInstantOnLocalDate(
  date: LocalCalendarDate,
  timeZone: string,
  syntheticUtc: number,
): Date | undefined {
  const previous = new Date(syntheticUtc - 48 * HOUR_MS)
  for (let offset = 0; offset <= 96; offset += 1) {
    const current = new Date(previous.getTime() + offset * HOUR_MS)
    if (!isSameLocalCalendarDate(getLocalCalendarDateTime(current, timeZone), date)) continue
    let low = previous.getTime()
    let high = current.getTime()
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2)
      if (isSameLocalCalendarDate(getLocalCalendarDateTime(new Date(middle), timeZone), date)) {
        high = middle
      } else {
        low = middle
      }
    }
    return new Date(high)
  }
  return undefined
}

function assertTimeZone(timeZone: string): void {
  parse(SIanaTimezone, timeZone)
}

function assertCalendarDate(date: LocalCalendarDate): void {
  if (!isValidLocalCalendarDate(date)) throw new RangeError('Expected a valid calendar date')
}

function isValidLocalCalendarDate(date: LocalCalendarDate): boolean {
  return (
    Number.isInteger(date.year) &&
    date.year >= 1 &&
    Number.isInteger(date.month) &&
    date.month >= 1 &&
    date.month <= 12 &&
    Number.isInteger(date.day) &&
    date.day >= 1 &&
    date.day <= daysInMonth(date.year, date.month)
  )
}

function isSameLocalCalendarDate(left: LocalCalendarDate, right: LocalCalendarDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
}

function isSameLocalCalendarDateTime(
  left: LocalCalendarDateTime,
  right: LocalCalendarDateTime,
): boolean {
  return (
    isSameLocalCalendarDate(left, right) &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  )
}

function utcWallClock(value: LocalCalendarDateTime): number {
  const date = new Date(0)
  date.setUTCFullYear(value.year, value.month - 1, value.day)
  date.setUTCHours(value.hour, value.minute, value.second, 0)
  return date.getTime()
}

function daysInMonth(year: number, month: number): number {
  const date = new Date(0)
  date.setUTCFullYear(year, month, 0)
  date.setUTCHours(0, 0, 0, 0)
  return date.getUTCDate()
}

function localWeekday(date: LocalCalendarDate): number {
  const value = new Date(utcWallClock({ ...date, hour: 0, minute: 0, second: 0 }))
  return value.getUTCDay()
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
