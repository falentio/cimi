import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SHostname, SIanaTimezone, SId, SName, SWeekStart } from '../index.ts'

describe('shared utility schemas', () => {
  it('validates opaque IDs and bounded names strictly', () => {
    expect(v.parse(SId, 'ste_custom-id')).toBe('ste_custom-id')
    expect(() => v.parse(SId, '')).toThrow(v.ValiError)
    expect(() => v.parse(SId, 'x'.repeat(129))).toThrow(v.ValiError)
    expect(v.parse(SName, 'Cimi')).toBe('Cimi')
    expect(() => v.parse(SName, '')).toThrow(v.ValiError)
  })

  it('canonicalizes valid hostnames and rejects malformed ones', () => {
    expect(v.parse(SHostname, 'WWW.Example.test.')).toBe('www.example.test')
    expect(() => v.parse(SHostname, '-invalid.example')).toThrow(v.ValiError)
  })

  it('accepts IANA timezones and the explicit week-start vocabulary', () => {
    expect(v.parse(SIanaTimezone, 'UTC')).toBe('UTC')
    expect(v.parse(SWeekStart, 'monday')).toBe('monday')
    expect(() => v.parse(SIanaTimezone, 'not/a-timezone')).toThrow(v.ValiError)
    expect(() => v.parse(SWeekStart, 'locale')).toThrow(v.ValiError)
  })
})
