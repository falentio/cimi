import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  enumerateLocalBucketStarts,
  formatLocalCalendarDate,
  parseLocalCalendarDate,
  resolveLocalDateStart,
  resolveLocalDateTimeInstants,
} from '../index.ts'

describe('site-local calendar arithmetic', () => {
  it('adds calendar days without using elapsed durations', () => {
    const date = parseLocalCalendarDate('2026-03-08')

    expect(formatLocalCalendarDate(addCalendarDays(date, 1))).toBe('2026-03-09')
  })

  it('skips a nonexistent spring-forward wall time', () => {
    const instants = resolveLocalDateTimeInstants({
      date: parseLocalCalendarDate('2026-03-08'),
      timeZone: 'America/New_York',
      hour: 2,
      minute: 0,
    })

    expect(instants).toHaveLength(0)
  })

  it('keeps both fall-back wall-time instants', () => {
    const instants = resolveLocalDateTimeInstants({
      date: parseLocalCalendarDate('2026-11-01'),
      timeZone: 'America/New_York',
      hour: 1,
      minute: 0,
    })

    expect(instants.map((instant) => instant.toISOString())).toEqual([
      '2026-11-01T05:00:00.000Z',
      '2026-11-01T06:00:00.000Z',
    ])
  })

  it('enumerates actual hourly starts for a DST transition', () => {
    const starts = enumerateLocalBucketStarts({
      fromDate: parseLocalCalendarDate('2026-11-01'),
      toDateExclusive: parseLocalCalendarDate('2026-11-02'),
      timeZone: 'America/New_York',
      granularity: 'hour',
      weekStartsOn: 'monday',
    })

    expect(starts).toHaveLength(25)
    expect(starts.filter((start) => start.local.hour === 1)).toHaveLength(2)
  })

  it('resolves a local day start in UTC', () => {
    const start = resolveLocalDateStart({
      date: parseLocalCalendarDate('2026-09-05'),
      timeZone: 'UTC',
    })

    expect(start.toISOString()).toBe('2026-09-05T00:00:00.000Z')
  })
})

describe('site-local calendar arithmetic with a 30-minute DST offset', () => {
  const timeZone = 'Australia/Lord_Howe'

  it('resolves the first instant of a 30-minute fall-back local day', () => {
    const start = resolveLocalDateStart({
      date: parseLocalCalendarDate('2026-04-05'),
      timeZone,
    })

    expect(start.toISOString()).toBe('2026-04-04T13:00:00.000Z')
  })

  it('enumerates 25 contiguous hourly starts for the 24.5-hour fall-back day', () => {
    // The 30-minute shift makes 2026-04-05 last 24.5 hours, so it holds 25 actual hourly buckets.
    // The extra bucket is the repeated 01:30 wall time; every later label carries the :30 offset
    // shift introduced when the zone moves from +11:00 to +10:30.
    const starts = enumerateLocalBucketStarts({
      fromDate: parseLocalCalendarDate('2026-04-05'),
      toDateExclusive: parseLocalCalendarDate('2026-04-06'),
      timeZone,
      granularity: 'hour',
      weekStartsOn: 'monday',
    })

    expect(starts).toHaveLength(25)
    expect(
      starts.map((start) => `${start.local.hour}:${String(start.local.minute).padStart(2, '0')}`),
    ).toEqual([
      '0:00',
      '1:00',
      '1:30',
      '2:30',
      '3:30',
      '4:30',
      '5:30',
      '6:30',
      '7:30',
      '8:30',
      '9:30',
      '10:30',
      '11:30',
      '12:30',
      '13:30',
      '14:30',
      '15:30',
      '16:30',
      '17:30',
      '18:30',
      '19:30',
      '20:30',
      '21:30',
      '22:30',
      '23:30',
    ])
    expect(starts.map((start) => start.instant.toISOString())).toContain('2026-04-04T15:00:00.000Z')
  })

  it('resolves both instants of the repeated 01:30 half-hour wall time', () => {
    const instants = resolveLocalDateTimeInstants({
      date: parseLocalCalendarDate('2026-04-05'),
      timeZone,
      hour: 1,
      minute: 30,
    })

    expect(instants.map((instant) => instant.toISOString())).toEqual([
      '2026-04-04T14:30:00.000Z',
      '2026-04-04T15:00:00.000Z',
    ])
  })

  it('resolves the single 01:00 wall-clock instant when only 30 minutes repeat', () => {
    const instants = resolveLocalDateTimeInstants({
      date: parseLocalCalendarDate('2026-04-05'),
      timeZone,
      hour: 1,
      minute: 0,
    })

    expect(instants.map((instant) => instant.toISOString())).toEqual(['2026-04-04T14:00:00.000Z'])
  })
})

describe('nonexistent local dates', () => {
  it('throws RangeError for a local date skipped by a whole-day offset jump', () => {
    expect(() =>
      resolveLocalDateStart({
        date: parseLocalCalendarDate('2011-12-30'),
        timeZone: 'Pacific/Apia',
      }),
    ).toThrowError(RangeError)
  })

  it('omits a skipped local date from daily enumeration instead of failing the range', () => {
    // Samoa moved across the date line and skipped 2011-12-30 entirely. The two days that exist
    // still enumerate; the day with no midnight contributes no bucket.
    const starts = enumerateLocalBucketStarts({
      fromDate: parseLocalCalendarDate('2011-12-29'),
      toDateExclusive: parseLocalCalendarDate('2012-01-01'),
      timeZone: 'Pacific/Apia',
      granularity: 'day',
      weekStartsOn: 'monday',
    })

    expect(starts.map((start) => start.local)).toEqual([
      { year: 2011, month: 12, day: 29, hour: 0, minute: 0, second: 0 },
      { year: 2011, month: 12, day: 31, hour: 0, minute: 0, second: 0 },
    ])
  })
})
