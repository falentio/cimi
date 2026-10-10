import { describe, expect, it } from 'vitest'
import { countOverviewRangeDays, resolveOverviewRangeRequest } from './site-overview.range'

const TODAY = '2026-05-27'

function daysBetween(from: string | undefined, to: string | undefined): number {
  if (from === undefined || to === undefined) return -1

  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000)
}

describe('resolveOverviewRangeRequest', () => {
  it('spans the requested day count inclusive of today', () => {
    expect(resolveOverviewRangeRequest('7d', TODAY, false)).toMatchObject({
      fromDate: '2026-05-21',
      toDate: '2026-05-27',
      granularity: 'day',
      comparison: undefined,
    })
  })

  it('starts the 12 month range on the first day of the month 11 months back', () => {
    expect(resolveOverviewRangeRequest('12m', TODAY, false)).toMatchObject({
      fromDate: '2025-06-01',
      toDate: '2026-05-27',
      granularity: 'month',
    })
  })

  it('derives a comparison window the contract accepts: adjacent and equal length', () => {
    const request = resolveOverviewRangeRequest('30d', TODAY, true)
    const comparison = request.comparison

    expect(comparison).toEqual({ fromDate: '2026-03-29', toDate: '2026-04-27' })
    expect(daysBetween(comparison?.toDate, request.fromDate)).toBe(1)
  })

  it('keeps the comparison the same length as the current window', () => {
    for (const range of ['7d', '30d', '90d', '12m'] as const) {
      const request = resolveOverviewRangeRequest(range, TODAY, true)
      const comparison = request.comparison

      expect(daysBetween(comparison?.fromDate, comparison?.toDate)).toBe(
        daysBetween(request.fromDate, request.toDate),
      )
    }
  })

  it('omits the comparison when comparison is off', () => {
    expect(resolveOverviewRangeRequest('7d', TODAY, false).comparison).toBeUndefined()
  })
})

describe('countOverviewRangeDays', () => {
  it('counts every range inclusive of today', () => {
    expect(countOverviewRangeDays('7d', TODAY)).toBe(7)
    expect(countOverviewRangeDays('30d', TODAY)).toBe(30)
    expect(countOverviewRangeDays('90d', TODAY)).toBe(90)
  })

  it('counts the 12 month range from the first day of the earliest month', () => {
    expect(countOverviewRangeDays('12m', TODAY)).toBe(361)
  })
})
