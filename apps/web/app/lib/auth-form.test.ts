import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { loginSchema, signupSchema } from './auth-form'

describe('auth form validation messages', () => {
  it('uses stable validation keys for login fields', () => {
    const result = v.safeParse(loginSchema, {
      name: '',
      email: '',
      password: '',
    })

    expect(result.success).toBe(false)
    expect(result.issues?.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'validation.auth.email.required',
        'validation.auth.password.required',
      ]),
    )
  })

  it('uses stable validation keys for signup fields and cross-field checks', () => {
    const result = v.safeParse(signupSchema, {
      name: '',
      email: 'valid@example.com',
      password: 'short',
      passwordConfirmation: 'different',
    })

    expect(result.success).toBe(false)
    expect(result.issues?.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'validation.auth.name.required',
        'validation.auth.password.minLength',
        'validation.auth.passwordConfirmation.mismatch',
      ]),
    )
  })
})
