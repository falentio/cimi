import { describe, expect, it } from 'vitest'
import {
  betterAuthErrorMessageKeys,
  localizeErrorMessage,
  type BetterAuthErrorCode,
} from './error-message'

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
        (key) =>
          key === 'authErrors.INVALID_EMAIL_OR_PASSWORD'
            ? 'Adresse e-mail ou mot de passe incorrect.'
            : key,
      ),
    ).toBe('Adresse e-mail ou mot de passe incorrect.')
  })

  it('resolves a message key for every better auth code the auth routes can return', () => {
    const translate = (key: string) => key

    for (const code of Object.keys(betterAuthErrorMessageKeys) as BetterAuthErrorCode[]) {
      expect(localizeErrorMessage({ code, message: 'raw server message' }, translate), code).toBe(
        betterAuthErrorMessageKeys[code],
      )
    }
  })

  it('keeps unknown codes and uncoded errors as fallbacks', () => {
    const translate = (key: string) => key

    expect(localizeErrorMessage({ code: 'NEW_CODE', message: 'Server message' }, translate)).toBe(
      'Server message',
    )
    expect(localizeErrorMessage({ message: 'Local failure' }, translate)).toBe('Local failure')
  })
})
