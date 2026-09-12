import { describe, expect, it } from 'vitest'
import {
  formatDayMonth,
  resolvePreviousDate,
  resolveTooltipDates,
} from './site-overview-chart-dates'

describe('formatDayMonth', () => {
  it('formats an ISO date as DD MMMM', () => {
    expect(formatDayMonth('2026-05-12')).toBe('12 May')
    expect(formatDayMonth('2026-01-01')).toBe('1 January')
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatDayMonth('not-a-date')).toBe('')
  })
})

describe('resolvePreviousDate', () => {
  it('shifts days back for day-based ranges', () => {
    expect(formatDayMonth(resolvePreviousDate('2026-05-12', '7d'))).toBe('5 May')
    expect(formatDayMonth(resolvePreviousDate('2026-05-12', '30d'))).toBe('12 April')
    expect(formatDayMonth(resolvePreviousDate('2026-05-31', '90d'))).toBe('2 March')
  })

  it('shifts months back for the 12 month range', () => {
    expect(formatDayMonth(resolvePreviousDate('2026-05-01', '12m'))).toBe('1 May')
    expect(formatDayMonth(resolvePreviousDate('2026-01-01', '12m'))).toBe('1 January')
  })

  it('rolls across year boundaries', () => {
    expect(formatDayMonth(resolvePreviousDate('2026-01-03', '30d'))).toBe('4 December')
  })

  it('shifts by an exact UTC period regardless of host timezone', () => {
    expect(resolvePreviousDate('2026-05-12', '30d').toISOString()).toBe('2026-04-12T00:00:00.000Z')
    expect(resolvePreviousDate('2026-05-12', '7d').toISOString()).toBe('2026-05-05T00:00:00.000Z')
    expect(resolvePreviousDate('2026-05-31', '90d').toISOString()).toBe('2026-03-02T00:00:00.000Z')
  })
})

describe('resolveTooltipDates', () => {
  it('returns the hovered date and the previous-period date', () => {
    expect(resolveTooltipDates('2026-05-12', '30d')).toEqual({
      current: '12 May',
      previous: '12 April',
    })
  })

  it('handles an undefined hovered date', () => {
    expect(resolveTooltipDates(undefined, '7d')).toEqual({ current: '', previous: '' })
  })
})
