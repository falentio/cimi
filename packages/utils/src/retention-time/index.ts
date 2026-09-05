import { parse } from 'valibot'
import { SIanaTimezone } from '../schema/index.ts'

export interface ResolveSiteLocalCutoffInput {
  readonly now: Date
  readonly timeZone: string
  readonly retentionMonths: number
}

export interface ResolveSiteLocalDayInput {
  readonly now: Date
  readonly timeZone: string
}

interface LocalDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

interface LocalDateTime extends LocalDate {
  readonly hour: number
  readonly minute: number
  readonly second: number
}

const DATE_TIME_PARTS = new Set(['year', 'month', 'day', 'hour', 'minute', 'second'])

export function resolveSiteLocalCutoff(input: ResolveSiteLocalCutoffInput): Date {
  assertValidInput(input.now, input.timeZone, input.retentionMonths)
  const currentDate = formatLocalDateTime(input.now, input.timeZone)
  const targetDate = subtractCalendarMonths(currentDate, input.retentionMonths)
  return resolveLocalStartOfDay(targetDate, input.timeZone)
}

export function resolveSiteLocalDay(input: ResolveSiteLocalDayInput): string {
  assertValidInput(input.now, input.timeZone)
  const date = formatLocalDateTime(input.now, input.timeZone)
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

function formatLocalDateTime(instant: Date, timeZone: string): LocalDateTime {
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

function subtractCalendarMonths(date: LocalDate, months: number): LocalDate {
  const absoluteMonth = date.year * 12 + date.month - 1 - months
  const year = Math.floor(absoluteMonth / 12)
  const month = (((absoluteMonth % 12) + 12) % 12) + 1
  const day = Math.min(date.day, daysInMonth(year, month))
  return { year, month, day }
}

function resolveLocalStartOfDay(date: LocalDate, timeZone: string): Date {
  const syntheticUtc = utcWallClock({ ...date, hour: 0, minute: 0, second: 0 })
  const offsets = new Set<number>()
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = new Date(syntheticUtc + hours * 60 * 60 * 1000)
    const local = formatLocalDateTime(sample, timeZone)
    offsets.add(utcWallClock(local) - sample.getTime())
  }

  const candidates = [...offsets]
    .map((offset) => new Date(syntheticUtc - offset))
    .filter((candidate) =>
      isSameLocalDateTime(formatLocalDateTime(candidate, timeZone), {
        ...date,
        hour: 0,
        minute: 0,
        second: 0,
      }),
    )
    .sort((left, right) => left.getTime() - right.getTime())
  const exact = candidates[0]
  if (exact !== undefined) return exact

  const firstSample = findFirstInstantOnLocalDate(date, timeZone, syntheticUtc)
  if (firstSample === undefined) throw new RangeError('Target local date does not exist')
  return firstSample
}

function findFirstInstantOnLocalDate(
  date: LocalDate,
  timeZone: string,
  syntheticUtc: number,
): Date | undefined {
  const previous = new Date(syntheticUtc - 48 * 60 * 60 * 1000)
  for (let offset = 0; offset <= 96; offset += 1) {
    const current = new Date(previous.getTime() + offset * 60 * 60 * 1000)
    const local = formatLocalDateTime(current, timeZone)
    if (!isSameLocalDate(local, date)) continue
    let low = previous.getTime()
    let high = current.getTime()
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2)
      if (isSameLocalDate(formatLocalDateTime(new Date(middle), timeZone), date)) high = middle
      else low = middle
    }
    return new Date(high)
  }
  return undefined
}

function isSameLocalDate(left: LocalDate, right: LocalDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
}

function isSameLocalDateTime(left: LocalDateTime, right: LocalDateTime): boolean {
  return (
    isSameLocalDate(left, right) &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  )
}

function utcWallClock(value: LocalDateTime): number {
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
