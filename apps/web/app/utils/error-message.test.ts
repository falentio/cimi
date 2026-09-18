import { describe, expect, it } from 'vitest'
import { localizeErrorMessage } from './error-message'

describe('localizeErrorMessage', () => {
  it('translates known contract error codes', () => {
    expect(
      localizeErrorMessage({ code: 'FORBIDDEN', message: 'server fallback' }, (key) =>
        key === 'errors.FORBIDDEN' ? 'Accès interdit.' : key,
      ),
    ).toBe('Accès interdit.')
  })

  it('keeps unknown codes and uncoded errors as fallbacks', () => {
    const translate = (key: string) => key

    expect(localizeErrorMessage({ code: 'NEW_CODE', message: 'Server message' }, translate)).toBe(
      'Server message',
    )
    expect(localizeErrorMessage({ message: 'Local failure' }, translate)).toBe('Local failure')
  })
})
