import { describe, expect, it } from 'vitest'
import { isLocalizableError, localizeErrorMessage } from './error-message'

const passthrough = (key: string) => key

describe('localizeErrorMessage', () => {
  it('translates known contract error codes', () => {
    expect(
      localizeErrorMessage({ code: 'FORBIDDEN', message: 'server fallback' }, (key) =>
        key === 'errors.FORBIDDEN' ? 'Accès interdit.' : key,
      ),
    ).toBe('Accès interdit.')
  })

  it('translates better auth error codes instead of leaking the English message', () => {
    expect(
      localizeErrorMessage(
        { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
        (key) => (key === 'authErrors.INVALID_EMAIL_OR_PASSWORD' ? 'Mot de passe incorrect.' : key),
      ),
    ).toBe('Mot de passe incorrect.')
  })

  it('translates the banned-user code the admin plugin raises on sign-in', () => {
    expect(
      localizeErrorMessage({ code: 'BANNED_USER', message: 'You have been banned' }, passthrough),
    ).toBe('authErrors.BANNED_USER')
  })

  it('falls back to the status for a response that carries no code', () => {
    expect(
      localizeErrorMessage(
        { status: 429, message: 'Too many requests. Please try again later.' },
        passthrough,
      ),
    ).toBe('errors.TOO_MANY_REQUESTS')
  })

  it('prefers the code over the status', () => {
    expect(
      localizeErrorMessage({ code: 'BANNED_USER', status: 403, message: 'banned' }, passthrough),
    ).toBe('authErrors.BANNED_USER')
  })

  it('does not localize a status that has no unambiguous contract code', () => {
    expect(localizeErrorMessage({ status: 422, message: 'Server message' }, passthrough)).toBe(
      'Server message',
    )
  })

  it('keeps unknown codes and uncoded errors as fallbacks', () => {
    expect(localizeErrorMessage({ code: 'NEW_CODE', message: 'Server message' }, passthrough)).toBe(
      'Server message',
    )
    expect(localizeErrorMessage({ message: 'Local failure' }, passthrough)).toBe('Local failure')
  })

  it('ignores an unknown status and keeps the server message', () => {
    expect(localizeErrorMessage({ status: 599, message: 'Server message' }, passthrough)).toBe(
      'Server message',
    )
  })

  it('does not treat inherited object properties as error codes', () => {
    for (const code of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(localizeErrorMessage({ code, message: 'Server message' }, passthrough), code).toBe(
        'Server message',
      )
    }
  })
})

describe('isLocalizableError', () => {
  it('accepts an error the translator can resolve', () => {
    expect(isLocalizableError({ code: 'BANNED_USER', message: 'banned' })).toBe(true)
    expect(isLocalizableError({ status: 429, message: 'too many' })).toBe(true)
  })

  it('rejects an error that would leak the raw server message', () => {
    expect(isLocalizableError({ message: 'raw server text' })).toBe(false)
    expect(isLocalizableError({ code: 'UNKNOWN_CODE', message: 'raw' })).toBe(false)
    expect(isLocalizableError({ status: 422, message: 'raw' })).toBe(false)
    expect(isLocalizableError({ code: 'toString', message: 'raw' })).toBe(false)
  })
})
