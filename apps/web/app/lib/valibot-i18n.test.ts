import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import './valibot-i18n'

describe('Valibot i18n registration', () => {
  it('registers French built-in messages', () => {
    const result = v.safeParse(v.pipe(v.string(), v.email()), 'invalid', { lang: 'fr' })

    expect(result.success).toBe(false)
    if (result.success) return

    expect(result.issues[0]?.message).toBe('Email invalide: reçu "invalid"')
  })
})
