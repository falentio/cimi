import { describe, expect, it } from 'vitest'
import { normalizeSettingsError } from './settings-error'

describe('normalizeSettingsError', () => {
  it('preserves contract error codes attached to Error instances', () => {
    const error = Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })

    expect(normalizeSettingsError(error)).toEqual({ code: 'FORBIDDEN', message: 'Forbidden' })
  })
})
