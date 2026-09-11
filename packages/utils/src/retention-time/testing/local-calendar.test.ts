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
