import { describe, expect, it } from 'vitest'
import { resolveSiteLocalCutoff } from '../index.ts'

function localParts(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(value)
}

describe('resolveSiteLocalCutoff', () => {
  it('resolves a UTC local-day cutoff', () => {
    const cutoff = resolveSiteLocalCutoff({
      now: new Date('2026-09-05T14:30:00.000Z'),
      timeZone: 'UTC',
      retentionMonths: 3,
    })

    expect(localParts(cutoff, 'UTC')).toContain('2026-06-05, 00:00:00')
  })

  it('uses each Site timezone across DST', () => {
    const cutoff = resolveSiteLocalCutoff({
      now: new Date('2026-11-01T05:30:00.000Z'),
      timeZone: 'America/New_York',
      retentionMonths: 1,
    })

    expect(localParts(cutoff, 'America/New_York')).toContain('2026-10-01, 00:00:00')
    expect(cutoff.toISOString()).toBe('2026-10-01T04:00:00.000Z')
  })

  it('clamps month-end subtraction to the target month', () => {
    const cutoff = resolveSiteLocalCutoff({
      now: new Date('2024-03-31T23:00:00.000Z'),
      timeZone: 'UTC',
      retentionMonths: 1,
    })

    expect(cutoff.toISOString()).toBe('2024-02-29T00:00:00.000Z')
  })

  it('rejects invalid inputs', () => {
    expect(() =>
      resolveSiteLocalCutoff({
        now: new Date('invalid'),
        timeZone: 'UTC',
        retentionMonths: 1,
      }),
    ).toThrow()
    expect(() =>
      resolveSiteLocalCutoff({
        now: new Date(),
        timeZone: 'Not/A_Timezone',
        retentionMonths: 1,
      }),
    ).toThrow()
    expect(() =>
      resolveSiteLocalCutoff({
        now: new Date(),
        timeZone: 'UTC',
        retentionMonths: 0,
      }),
    ).toThrow()
  })
})
