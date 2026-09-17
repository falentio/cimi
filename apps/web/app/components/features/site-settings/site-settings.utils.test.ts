import { describe, expect, it } from 'vitest'
import {
  getSiteSettingsFieldError,
  getTimezoneOptions,
  normalizeSiteSettingsDraft,
  parseSiteId,
  WEEK_START_OPTIONS,
} from './site-settings.utils'
import type { SiteSettingsDraft } from './site-settings.types'

const draft = {
  name: 'Marketing site',
  hostname: 'www.example.com',
  reportingTimezone: 'UTC',
  weekStartsOn: 'monday',
} satisfies SiteSettingsDraft

describe('site-settings.utils', () => {
  it('parses only non-empty string site ids', () => {
    expect(parseSiteId('ste_123')).toBe('ste_123')
    expect(parseSiteId('')).toBeUndefined()
    expect(parseSiteId(['ste_123'])).toBeUndefined()
  })

  it('normalizes editable site fields at the form boundary', () => {
    expect(
      normalizeSiteSettingsDraft({
        ...draft,
        name: '  Marketing site  ',
        hostname: '  www.example.com  ',
      }),
    ).toEqual(draft)
  })

  it('reports required and length errors after submission', () => {
    expect(getSiteSettingsFieldError('name', { ...draft, name: ' ' }, true)).toBe(
      'Enter a site name.',
    )
    expect(
      getSiteSettingsFieldError('hostname', { ...draft, hostname: 'a'.repeat(254) }, true),
    ).toBe('Hostnames must be 253 characters or fewer.')
    expect(getSiteSettingsFieldError('name', { ...draft, name: ' ' }, false)).toBeNull()
  })

  it('keeps a persisted timezone when the browser list does not contain it', () => {
    const options = getTimezoneOptions('Legacy/Region')
    expect(options).toContainEqual({ value: 'Legacy/Region', label: 'Legacy/Region' })
    expect(options).toContainEqual({ value: 'UTC', label: 'UTC' })
  })

  it('exposes every supported week-start value in display order', () => {
    expect(WEEK_START_OPTIONS.map((option) => option.value)).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ])
  })
})
