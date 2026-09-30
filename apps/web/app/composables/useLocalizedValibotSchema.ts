import { toTypedSchema } from '@vee-validate/valibot'
import type { BaseIssue, BaseSchema, BaseSchemaAsync, Config, InferIssue } from 'valibot'
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { TypedSchema } from 'vee-validate'
import '../lib/valibot-i18n'

type AnyValibotSchema =
  | BaseSchema<unknown, unknown, BaseIssue<unknown>>
  | BaseSchemaAsync<unknown, unknown, BaseIssue<unknown>>

export type ValidationMessageKey = `validation.${string}`

export type SupportedLocale = 'en' | 'fr'

export type StableKeyResolver = (
  key: ValidationMessageKey,
  locale: SupportedLocale,
) => string | undefined

export type StableMessageResolver = (message: string) => string

type OfficialTypedSchema<TSchema extends AnyValibotSchema> = ReturnType<
  typeof toTypedSchema<TSchema>
>

export function withResolvedMessages<TInput, TOutput>(
  typedSchema: TypedSchema<TInput, TOutput>,
  resolveMessage: StableMessageResolver,
): TypedSchema<TInput, TOutput> {
  return {
    ...typedSchema,
    async parse(values, context) {
      const result = await typedSchema.parse(values, context)

      return {
        ...result,
        errors: result.errors.map((error) => ({
          ...error,
          errors: error.errors.map((message) => resolveMessage(message)),
        })),
      }
    },
  }
}

function isValidationMessageKey(message: string): message is ValidationMessageKey {
  return message.startsWith('validation.')
}

export function createStableMessageResolver(
  activeLocale: SupportedLocale,
  resolveKey: StableKeyResolver,
): StableMessageResolver {
  return (message) => {
    if (!isValidationMessageKey(message)) return message

    const activeTranslation = resolveKey(message, activeLocale)
    if (activeTranslation !== undefined) return activeTranslation

    if (activeLocale !== 'en') {
      const englishTranslation = resolveKey(message, 'en')
      if (englishTranslation !== undefined) return englishTranslation
    }

    return message
  }
}

export function useLocalizedValibotSchema<TSchema extends AnyValibotSchema>(
  schema: MaybeRefOrGetter<TSchema>,
): ComputedRef<OfficialTypedSchema<TSchema>> {
  const i18n = useI18n()
  const { locale } = i18n

  return computed(() => {
    const capturedLocale: SupportedLocale = locale.value
    const selectedSchema = toValue(schema)
    const config = { lang: capturedLocale } satisfies Config<InferIssue<TSchema>>
    const typedSchema = toTypedSchema(selectedSchema, config)
    const resolveKey = (key: ValidationMessageKey, requestedLocale: SupportedLocale) => {
      if (!i18n.te(key, requestedLocale)) return undefined
      return i18n.t(key, { locale: requestedLocale })
    }

    return withResolvedMessages(
      typedSchema,
      createStableMessageResolver(capturedLocale, resolveKey),
    )
  })
}
