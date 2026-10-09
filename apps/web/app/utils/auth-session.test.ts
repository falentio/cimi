import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/composables/useAuth'
import { authStateFromPayload, isAuthUser } from './auth-session'

const validUser: AuthUser = {
  id: 'u1',
  name: 'A',
  email: 'a@b.c',
  emailVerified: true,
  image: null,
  role: 'admin',
}

describe('authStateFromPayload', () => {
  it('treats a null payload as unauthenticated', () => {
    expect(authStateFromPayload(null)).toEqual({ status: 'unauthenticated' })
  })

  it('treats an undefined payload as unauthenticated', () => {
    expect(authStateFromPayload(undefined)).toEqual({ status: 'unauthenticated' })
  })

  it('decodes a valid session payload into an authenticated state', () => {
    expect(authStateFromPayload({ user: validUser })).toEqual({
      status: 'authenticated',
      session: { user: validUser },
    })
  })

  it('accepts a user whose role is undefined', () => {
    const user = { ...validUser, role: undefined }

    expect(authStateFromPayload({ user })).toEqual({
      status: 'authenticated',
      session: { user },
    })
  })

  it('accepts a user whose role is null', () => {
    const user = { ...validUser, role: null }

    expect(authStateFromPayload({ user })).toEqual({
      status: 'authenticated',
      session: { user },
    })
  })

  it('reports an error for a payload that is not a session', () => {
    const invalidPayloads: readonly unknown[] = [
      'x',
      1,
      [],
      {},
      { user: {} },
      { user: { id: 1 } },
      { user: { role: 42 } },
    ]

    for (const payload of invalidPayloads) {
      expect(authStateFromPayload(payload), JSON.stringify(payload)).toEqual({
        status: 'error',
        error: { message: 'Invalid authentication session response' },
      })
    }
  })
})

describe('isAuthUser', () => {
  it('accepts a full valid user', () => {
    expect(isAuthUser(validUser)).toBe(true)
  })

  it('rejects non-record values', () => {
    for (const value of ['x', 1, null, undefined, []]) {
      expect(isAuthUser(value)).toBe(false)
    }
  })

  it('rejects a user missing the id', () => {
    expect(isAuthUser({ ...validUser, id: undefined })).toBe(false)
  })

  it('rejects a non-boolean emailVerified', () => {
    expect(isAuthUser({ ...validUser, emailVerified: 'yes' })).toBe(false)
  })

  it('rejects a non-string role', () => {
    expect(isAuthUser({ ...validUser, role: 42 })).toBe(false)
  })
})
