import { SGoalCreateInput, SGoalReportInput, VALIDATION_KEYS } from '@cimi/contract'
import { toTypedSchema } from '@vee-validate/valibot'
import * as v from 'valibot'
import { shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../../i18n/locales/en.json'
import fr from '../../i18n/locales/fr.json'
import { loginSchema } from '../lib/auth-form'
import {
  createStableMessageResolver,
  useLocalizedValibotSchema,
  withResolvedMessages,
} from './useLocalizedValibotSchema'

describe('useLocalizedValibotSchema', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('translates active-locale stable keys and falls back to English', () => {
    const messages: Record<string, Record<string, string | undefined>> = {
      en: {
        'validation.auth.email.invalid': 'Enter a valid email address.',
        'validation.auth.password.required': 'Password is required.',
      },
      fr: {
        'validation.auth.email.invalid': 'Saisissez une adresse e-mail valide.',
      },
    }
    const resolveKey = (key: string, locale: string) => messages[locale]?.[key]
    const resolveMessage = createStableMessageResolver('fr', resolveKey)

    expect(resolveMessage('validation.auth.email.invalid')).toBe(
      'Saisissez une adresse e-mail valide.',
    )
    expect(resolveMessage('validation.auth.password.required')).toBe('Password is required.')
    expect(resolveMessage('validation.auth.unknown')).toBe('validation.auth.unknown')
  })

  it('leaves non-validation and built-in localized messages unchanged', async () => {
    const builtInSchema = withResolvedMessages(
      toTypedSchema(v.pipe(v.string(), v.email()), { lang: 'fr' }),
      createStableMessageResolver('fr', () => undefined),
    )
    const builtInResult = await builtInSchema.parse('invalid')

    expect(builtInResult.errors[0]?.errors).toEqual(['Email invalide: reçu "invalid"'])

    const customMessageSchema = withResolvedMessages(
      toTypedSchema(v.pipe(v.string(), v.email('The email is invalid.'))),
      createStableMessageResolver('fr', () => undefined),
    )
    const customMessageResult = await customMessageSchema.parse('invalid')

    expect(customMessageResult.errors[0]?.errors).toEqual(['The email is invalid.'])
  })

  it('preserves forwarded field paths while resolving messages', async () => {
    const schema = v.pipe(
      v.object({
        password: v.string(),
        passwordConfirmation: v.string(),
      }),
      v.forward(
        v.partialCheck(
          [['password'], ['passwordConfirmation']],
          (input) => input.password === input.passwordConfirmation,
          'validation.auth.passwordConfirmation.mismatch',
        ),
        ['passwordConfirmation'],
      ),
    )
    const typedSchema = withResolvedMessages(
      toTypedSchema(schema),
      createStableMessageResolver('fr', (key) =>
        key === 'validation.auth.passwordConfirmation.mismatch'
          ? 'Les mots de passe ne correspondent pas.'
          : undefined,
      ),
    )

    const result = await typedSchema.parse({ password: 'one', passwordConfirmation: 'two' })

    expect(result.errors).toEqual([
      {
        path: 'passwordConfirmation',
        errors: ['Les mots de passe ne correspondent pas.'],
      },
    ])
  })

  it('keeps parse-local English and French messages isolated in either order', async () => {
    const schema = v.pipe(v.string(), v.email())
    const englishSchema = toTypedSchema(schema, { lang: 'en' })
    const frenchSchema = toTypedSchema(schema, { lang: 'fr' })

    const frenchFirst = await frenchSchema.parse('invalid')
    const englishSecond = await englishSchema.parse('invalid')
    const englishFirst = await englishSchema.parse('invalid')
    const frenchSecond = await frenchSchema.parse('invalid')

    expect(frenchFirst.errors[0]?.errors).toEqual(['Email invalide: reçu "invalid"'])
    expect(englishSecond.errors[0]?.errors).toEqual(['Invalid email: Received "invalid"'])
    expect(englishFirst.errors[0]?.errors).toEqual(['Invalid email: Received "invalid"'])
    expect(frenchSecond.errors[0]?.errors).toEqual(['Email invalide: reçu "invalid"'])
  })

  it('delegates cast and describe and preserves the typed schema marker', () => {
    const typedSchema = toTypedSchema(
      v.object({
        name: v.optional(v.string(), 'Default name'),
      }),
    )
    const decoratedSchema = withResolvedMessages(typedSchema, (message) => message)

    expect(decoratedSchema.__type).toBe('VVTypedSchema')
    expect(decoratedSchema.cast).toBe(typedSchema.cast)
    expect(decoratedSchema.describe).toBe(typedSchema.describe)
    expect(decoratedSchema.cast?.({})).toEqual(typedSchema.cast?.({}))
    expect(decoratedSchema.describe?.('name')).toEqual(typedSchema.describe?.('name'))
  })

  it('recomputes the official schema when the active locale changes', async () => {
    const locale = shallowRef('en')
    const translations: Record<'en' | 'fr', string> = {
      en: 'English validation message.',
      fr: 'Message de validation français.',
    }
    const t = vi.fn((_: string, options: { locale: 'en' | 'fr' }) => translations[options.locale])
    const te = vi.fn(() => true)

    vi.stubGlobal('useI18n', () => ({ locale, t, te }))

    const schema = useLocalizedValibotSchema(() =>
      v.pipe(v.string(), v.email('validation.auth.email.invalid')),
    )
    const englishTypedSchema = schema.value
    const englishResult = await englishTypedSchema.parse('invalid')

    locale.value = 'fr'

    const frenchTypedSchema = schema.value
    const frenchResult = await frenchTypedSchema.parse('invalid')

    expect(frenchTypedSchema).not.toBe(englishTypedSchema)
    expect(englishResult.errors[0]?.errors).toEqual(['English validation message.'])
    expect(frenchResult.errors[0]?.errors).toEqual(['Message de validation français.'])
    expect(t).toHaveBeenCalledWith('validation.auth.email.invalid', { locale: 'en' })
    expect(t).toHaveBeenCalledWith('validation.auth.email.invalid', { locale: 'fr' })
  })

  it('passes the active locale to built-in Valibot messages', async () => {
    const locale = shallowRef<'en' | 'fr'>('fr')

    vi.stubGlobal('useI18n', () => ({
      locale,
      t: vi.fn(),
      te: vi.fn(),
    }))

    const schema = useLocalizedValibotSchema(() => v.pipe(v.string(), v.email()))
    const result = await schema.value.parse('invalid')

    expect(result.errors?.[0]?.errors).toEqual(['Email invalide: reçu "invalid"'])
  })

  it('passes the active locale to built-in messages from an imported contract schema', async () => {
    const expected = {
      en: 'Invalid length: Expected >=1 but received 0',
      fr: 'Longueur invalide: attendu >=1, mais reçu 0',
    } as const

    for (const locale of ['en', 'fr'] as const) {
      const activeLocale = shallowRef<'en' | 'fr'>(locale)
      vi.stubGlobal('useI18n', () => ({
        locale: activeLocale,
        t: vi.fn(),
        te: vi.fn(),
      }))

      const result = await useLocalizedValibotSchema(SGoalCreateInput).value.parse({
        siteId: 'site-1',
        name: '',
        action: { kind: 'page_view' },
        identityKind: 'visitor',
      })

      expect(result.errors[0]?.errors).toEqual([expected[locale]])
    }
  })

  it('accepts a schema exported by @cimi/contract', async () => {
    const locale = shallowRef<'en' | 'fr'>('en')

    vi.stubGlobal('useI18n', () => ({
      locale,
      t: vi.fn(),
      te: vi.fn(),
    }))

    const value = {
      siteId: 'site-1',
      name: 'Signup',
      action: { kind: 'page_view' as const },
      identityKind: 'visitor' as const,
    }
    const schema = useLocalizedValibotSchema(SGoalCreateInput)
    const result = await schema.value.parse(value)

    expect(result).toEqual({ value, errors: [] })
  })

  it('renders an imported contract validation key in English and French', async () => {
    const input = {
      goalId: 'goal-1',
      fromDate: '2026-08-23',
      toDate: '2026-08-22',
    }
    const key = VALIDATION_KEYS.contract.report.dateRangeOrdered
    const messages = {
      en: en.validation.contract.report.dateRangeOrdered,
      fr: fr.validation.contract.report.dateRangeOrdered,
    }

    for (const locale of ['en', 'fr'] as const) {
      const activeLocale = shallowRef(locale)
      vi.stubGlobal('useI18n', () => ({
        locale: activeLocale,
        t: vi.fn(() => messages[locale]),
        te: vi.fn((requestedKey: string) => requestedKey === key),
      }))

      const result = await useLocalizedValibotSchema(SGoalReportInput).value.parse(input)

      expect(result.errors[0]?.errors).toEqual([messages[locale]])
    }
  })

  it('translates stable keys from the auth schema', async () => {
    const locale = shallowRef<'en' | 'fr'>('fr')
    const messages = {
      'validation.auth.email.invalid': 'Saisissez une adresse e-mail valide.',
      'validation.auth.password.required': 'Le mot de passe est requis.',
      'validation.auth.password.minLength': 'Le mot de passe doit comporter au moins 8 caractères.',
    }
    const t = vi.fn((key: keyof typeof messages) => messages[key])
    const te = vi.fn((key: string) => key in messages)

    vi.stubGlobal('useI18n', () => ({ locale, t, te }))

    const schema = useLocalizedValibotSchema(() => loginSchema)
    const result = await schema.value.parse({ name: '', email: 'invalid', password: '' })
    const messagesByField = Object.fromEntries(
      result.errors.map((error) => [error.path, error.errors]),
    )

    expect(messagesByField.email).toEqual(['Saisissez une adresse e-mail valide.'])
    expect(messagesByField.password).toEqual([
      'Le mot de passe est requis.',
      'Le mot de passe doit comporter au moins 8 caractères.',
    ])
  })
})
