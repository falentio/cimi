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
- Leave existing literal custom messages unchanged until the consuming surface proves that they are user-facing web validation.
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

Those strings remain unchanged in every locale. This is the current behavior for custom messages in shared contract schemas such as `SDateTime`.

### Web-owned user-facing rules

Use a stable key for a rule owned by the web app.

```ts
v.email('validation.auth.email.invalid')
```

Add the same key to the English and French catalogs. The resolver in `useLocalizedValibotSchema` translates keys beginning with `validation.` and falls back to English when the active locale has no translation.

Keep keys stable and sentences in locale files. Do not put translated sentences in schema definitions.

### Shared contract rules

Classify a custom contract message before changing it.

- A user-facing web form may need a web-owned stable key or a separate web schema.
- An internal, output, server, or API-boundary rule can keep its literal message.
- Do not add Nuxt translation keys to `packages/contract` just to make one web screen French.
- Do not translate by matching the current English message. English wording is not an identifier.

If a shared rule must produce a localized user-facing error for several consumers, first define a consumer-neutral stable issue identifier or structured metadata. Each consumer can then map that identifier to its own catalog. Do not start that migration without tests for every consumer that parses the schema.

## Transport errors

Transport errors are not Valibot messages.

- `packages/contract/src/schema/errors.ts` defines `ContractErrorCode` and fallback metadata.
- `apps/web/app/utils/error-message.ts` maps each known code to an `errors.*` key.
- The web translates the code, not the server's English fallback message.
- An unknown code or an error without a code keeps its existing message.

Keep this path separate from `validation.*` keys. A form issue and a failed API request have different owners and different fallback behavior.

## Implementation workflow

1. Find every consumer of the schema. Identify whether it parses in the API, in `apps/web`, or in both places.
2. Classify each issue as built-in Valibot text, a stable `validation.*` key, a literal custom message, or a transport error code.
3. Keep shared schemas framework-neutral. Move web-only messages and catalogs to `apps/web`.
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
- A literal custom message remains unchanged.
- Forwarded field paths remain attached to the correct field.
- An imported schema from `@cimi/contract` still parses through the adapter.
- Locale changes create a new typed schema and retranslate visible form errors.

For the contract package, keep tests focused on schema acceptance, rejection, output shape, and error-code metadata. Do not import web locale catalogs into contract tests.

Run focused checks for the files changed. Use `vp check --fix <files>` for formatting, lint, and typechecking. Use the relevant package test command before the web build.

## Completion criteria

The change is complete when every modified schema has a known consumer, every custom message has an explicit classification, locale selection remains parse-local, all changed locale keys have English coverage, and the relevant tests prove built-in messages, custom messages, stable keys, and field paths.
