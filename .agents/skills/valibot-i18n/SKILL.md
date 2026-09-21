---
name: valibot-i18n
description: Use when working on Valibot schemas, validation messages, locale-aware forms, or contract validation in apps/web or packages/contract. Covers parse-local Valibot language configuration, stable validation keys, custom messages, the web adapter, locale catalogs, and contract error codes. Use this skill before changing schema messages, adding validation translations, or moving validation rules between the web app and the contract package.
---

# Valibot i18n

Keep schema rules and locale selection in separate layers.

`packages/contract` owns framework-neutral Valibot schemas. `apps/web` owns the active locale, Vue I18n catalogs, and the Vee Validate adapter. The contract package must remain usable by the API and other consumers without Nuxt, Vue I18n, or `@valibot/i18n` dependencies.

## Data model

Treat a validation result as three separate values.

- A field path identifies the input location.
- A Valibot issue message describes the failed rule.
- A locale selects how a message is rendered at a consumer boundary.

Do not store the locale in a shared schema. Do not translate by matching English sentences. Use stable message keys when a web-owned schema needs application translations.

## Ownership rules

### `packages/contract`

- Define schemas with Valibot only.
- Keep schemas locale-neutral and free of Nuxt or Vue I18n imports.
- Keep reusable type and domain rules in the contract package.
- Use the package-owned validation-key registry for every explicit custom Valibot message.
- Keep transport errors separate from Valibot issues. `ERROR_CATALOG` owns stable `ContractErrorCode` values, statuses, and fallback messages.

### `apps/web`

- Register Valibot locale data in `apps/web/app/lib/valibot-i18n.ts`.
- Adapt schemas through `useLocalizedValibotSchema`.
- Pass the active locale as the parse-local Valibot config `{ lang: activeLocale }`.
- Recompute the typed schema when the locale changes.
- Resolve stable `validation.*` keys through Vue I18n, with English fallback.
- Render API errors through the contract-code mapping in `apps/web/app/utils/error-message.ts`.

## Built-in messages

Valibot can localize built-in messages such as `v.email()` and `v.minLength()` when the consumer passes `{ lang }` during parsing. The web adapter creates the official `toTypedSchema` with that config.

Keep locale selection parse-local. Do not use global Valibot configuration. Global configuration makes the result depend on parse order and can cause English and French schemas to affect one another.

`@valibot/i18n` registers messages on the Valibot module instance it imports. A workspace that resolves more than one Valibot copy leaves contract-owned schemas reading an unregistered instance, so their built-in messages stay English under `fr`. Keep `valibot` in `resolve.dedupe` in both `vite.config.ts` and `apps/web/nuxt.config.ts`. The root config covers the test and client surfaces, and the Nuxt config covers the SSR surface. Each is load-bearing; removing either one reintroduces the English leak.

The locale flow is:

```text
web form [1]
├── useLocalizedValibotSchema(schema) [1a]
│   ├── read the active Vue I18n locale [1a1]
│   ├── create toTypedSchema(schema, { lang }) [1a2]
│   └── wrap parse errors with the stable-message resolver [1a3]
├── Vee Validate parses the form [1b]
└── render errors at their original field paths [1c]
```

Use `apps/web/app/composables/useLocalizedValibotSchema.ts` as the single adapter. Extend it instead of adding another schema wrapper.

## Custom messages

Valibot treats a custom message as the final issue message. The `lang` option does not translate it.

```ts
v.email('The email is invalid.')
v.check(isValidDateTime, 'Expected a valid ISO date-time.')
```

For a shared contract schema, use a stable `validation.*` key instead of either sentence. The contract emits the key. The consuming application translates it.

The registries live in `packages/utils/src/schema/index.ts` for utility-owned schemas and `packages/contract/src/schema/validation-keys.ts` for contract-owned schemas. `SDateTime` emits `VALIDATION_KEYS.contract.dateTime.invalid`, and `SIanaTimezone` emits `VALIDATION_KEYS.shared.ianaTimezone`.

### Web-owned user-facing rules

Use a stable key for a rule owned by the web app.

```ts
v.email('validation.auth.email.invalid')
```

Add the same key to the English and French catalogs. The resolver in `useLocalizedValibotSchema` translates keys beginning with `validation.` and falls back to English when the active locale has no translation.

Keep keys stable and sentences in locale files. Do not put translated sentences in schema definitions.

### Shared contract rules

Use the registry for every explicit custom issue message in `packages/contract` and the shared schemas it re-exports.

- Name keys after the violated rule, not the operation or screen that uses the schema.
- Reuse one key when the same semantic rule appears in several schemas.
- Keep the registry free of translated sentences and framework imports.
- Do not translate by matching English messages. English wording is not an identifier.

If a custom issue needs runtime interpolation, keep the stable key and design issue metadata separately. Do not put locale text or dynamic values into the key.

## Transport errors

Transport errors are not Valibot messages.

- `packages/contract/src/schema/errors.ts` defines `ContractErrorCode` and fallback metadata.
- `apps/web/app/utils/error-message.ts` maps each known code to an `errors.*` key.
- The web translates the code, not the server's English fallback message.
- An unknown code or an error without a code keeps its existing message.

Keep this path separate from `validation.*` keys. A form issue and a failed API request have different owners and different fallback behavior.

## Implementation workflow

1. Find every consumer of the schema. Identify whether it parses in the API, in `apps/web`, or in both places.
2. Classify each issue as built-in Valibot text, a stable `validation.*` key, or a transport error code.
3. Replace every explicit contract custom message with the owning registry leaf. Keep shared schemas framework-neutral.
4. Use `useLocalizedValibotSchema` for web form schemas. Preserve its typed-schema methods and original field paths.
5. Add or update locale catalog entries. Keep English complete and use English fallback for a missing French entry.
6. Add tests before broadening the change.

## Required tests

For the web adapter, cover these cases when the change touches them.

- Built-in Valibot messages use the active locale.
- English and French parses stay isolated regardless of parse order.
- Stable `validation.*` keys translate in the active locale.
- A missing active-locale key falls back to English.
- An unknown stable key remains unchanged.
- A literal custom message in a web-only schema remains unchanged.
- An imported contract schema emits a stable `validation.*` key and renders its English and French catalog values.
- An imported contract schema's built-in rule renders the active locale's `@valibot/i18n` message.
- Forwarded field paths remain attached to the correct field.
- An imported schema from `@cimi/contract` still parses through the adapter.
- Locale changes create a new typed schema and retranslate visible form errors.

For the contract package, keep tests focused on schema acceptance, rejection, output shape, stable custom issue keys, and error-code metadata. Do not import web locale catalogs into contract tests.

Run focused checks for the files changed. Use `vp check --fix <files>` for formatting, lint, and typechecking. Use the relevant package test command before the web build.

## Completion criteria

The change is complete when every modified schema has a known consumer, every explicit contract custom message uses an owning `validation.*` registry leaf, locale selection remains parse-local, all registry leaves have English and French coverage, and the relevant tests prove built-in messages, custom messages, stable keys, and field paths.
