# Valibot validation i18n implementation plan

## Goal

Show client-side validation errors in the active `@nuxtjs/i18n` locale while
keeping `@cimi/contract` independent of Nuxt and Vue I18n.

The first implementation targets web forms and validation errors that users can
see. It does not localize API process state or internal configuration errors.

## Baseline

- `apps/web/nuxt.config.ts:18-27` configures `@nuxtjs/i18n` with `en` and `fr`.
- `pnpm-workspace.yaml:23` pins `valibot` at `^1.4.2`.
- `apps/web/package.json:27,41` uses `@vee-validate/valibot` and
  `vee-validate` at `^4.15.1`.
- `@valibot/i18n` is not installed.
- `apps/web/app/lib/auth-form.ts:10-45` contains hard-coded English messages.
- `packages/contract` contains shared schemas used by the API and web app.
- `packages/contract/src/schema/errors.ts:3-109` defines transport error codes
  with English fallback messages.
- `apps/web/app/plugins/orpc.ts:13-24` does not send a locale to the API.
- `apps/api/src/orpc.ts:7-11` has no locale in `ApiContext`.

## Design decision

Keep the locale boundary in `apps/web`.

```text
shared contract schema [1]
└── web validation adapter [1a]
    ├── active Nuxt locale [1a1]
    ├── `@valibot/i18n` built-in messages [1a2]
    ├── application validation keys [1a3]
    └── vee-validate field errors [1a4]
```

### Shared schemas stay framework-neutral

Do not import `useI18n`, `t`, Nuxt, or Vue I18n from `packages/contract`.

The contract package is also loaded by the API and other non-UI consumers. A
Nuxt translator would make schema construction depend on a runtime that does
not exist at those boundaries.

### Use parse-local Valibot configuration

Register the required `@valibot/i18n` locale modules in the web app. Pass the
active locale to `toTypedSchema` through Valibot's `lang` configuration.

Do not call `v.setGlobalConfig({ lang })`. Global mutable locale state is unsafe
for SSR and can make tests depend on execution order.

### Separate built-in messages from application messages

Use `@valibot/i18n` for built-in validators such as `email`, `minLength`, and
`url`.

Use stable application validation keys for custom contract rules. Translate
those keys in the web app. Do not store a Nuxt-generated sentence in a shared
schema.

Use translator callbacks directly for schemas that only belong to the web app,
such as the auth form schema.

### Keep API errors separate

The API should continue to return stable error codes. The web app can map those
codes to locale keys later. Do not add locale propagation to `ApiContext` in the
first validation change.

## Work sequence

### 1. Add the Valibot i18n dependency

Add `@valibot/i18n` to the web workspace package with a version compatible with
the lockfile's `valibot` version.

Register the French locale module. Keep the import side-effect-only. Import
only the locale modules needed by the application.

Completion criteria:

- The dependency is present in `apps/web/package.json` and the lockfile.
- The web package resolves the locale module during typecheck and build.
- No package outside `apps/web` depends on `@valibot/i18n`.

### 2. Add validation message keys

Add a `validation` namespace to:

- `apps/web/i18n/locales/en.json`
- `apps/web/i18n/locales/fr.json`

Add keys for the auth form first:

- Required name.
- Required email.
- Invalid email.
- Required password.
- Minimum password length.
- Required password confirmation.
- Password mismatch.

Use the same key tree in both locale files. Keep interpolation arguments stable
between locales.

Completion criteria:

- Every new English key has a French value.
- The locale files do not contain hard-coded validation sentences outside the
  `validation` namespace.
- Missing-key behavior has an explicit fallback to English.

### 3. Build the web validation adapter

Add a web-only composable or helper under `apps/web/app/composables/` that:

- Reads `locale` and `t` from `useI18n`.
- Accepts a Valibot schema created outside the helper.
- Returns a computed `toTypedSchema` result.
- Passes the active locale through Valibot's `lang` option.
- Supports a custom issue-to-message resolver for stable application keys.

Keep the helper independent of individual forms. It should not know about auth,
organizations, or sites.

The helper must preserve the existing `useForm<AuthFormValues>` type argument.

Completion criteria:

- The helper has no global Valibot configuration.
- A locale change rebuilds the typed schema with the new locale.
- The helper works with both a local web schema and a schema imported from
  `@cimi/contract`.

### 4. Migrate the auth form

Update `apps/web/app/lib/auth-form.ts` so custom messages are supplied by the
web translation boundary instead of fixed English strings.

Keep the schema's input and output types unchanged. Do not move the auth schema
into `packages/contract` as part of this change.

Update `apps/web/app/components/AuthPanel.vue:90-101` to use the localized
adapter. Keep the existing computed schema structure and explicit form type.

Completion criteria:

- Invalid auth input shows English messages under `en`.
- The same invalid input shows French messages under `fr`.
- Password mismatch points to `passwordConfirmation`.
- Switching locale does not lose form values.
- Existing errors are revalidated or translated according to one documented UX
  rule.

### 5. Classify shared contract messages

Review custom messages in `packages/contract` and classify each one as either:

- A user-facing input validation message.
- An internal configuration or output validation message.
- A transport or domain error that needs a stable error code.

Only user-facing input messages enter the first migration.

For migrated contract rules, replace human-readable English message literals
with stable validation keys or another locale-neutral issue identity. Keep the
identity usable by the API and configuration consumers.

Do not add Nuxt imports to make this migration work.

Completion criteria:

- Each migrated issue has a stable identity independent of its English copy.
- The web adapter can translate the issue without reading a server message.
- Internal config and output validation retain deterministic non-UI behavior.
- The contract's inferred input and output types do not change.

### 6. Translate API error codes in the web app

Add a web-side mapping from `ContractErrorCode` values to locale keys. Apply the
mapping in the error display path after `normalizeSettingsError` and the auth
error normalization paths have retained the code.

Keep the API's English catalog as a safe fallback for logs, non-web consumers,
and unknown codes.

This step can land after client-side Valibot validation if the first change is
large enough. It must not change transport status codes or error code names.

Completion criteria:

- Known API error codes render in the active web locale.
- Unknown codes still produce a useful fallback message.
- API status codes and contract error types remain unchanged.

## Test matrix

### Contract and Valibot behavior

- Built-in `email` and length failures select the configured language.
- A parse-local `lang` does not change another parse's language.
- A custom application message remains stable outside the web app.
- Stable validation keys map to the expected locale messages.
- Missing translation keys fall back to English.

### Web form behavior

- Auth validation renders English messages under `/login`.
- Auth validation renders French messages under `/fr/login`.
- Locale switching preserves values and updates validation output.
- Password mismatch renders on `passwordConfirmation`.
- `AuthFormValues` inference remains intact.

### Runtime behavior

- Direct English SSR renders English validation copy.
- Direct French SSR renders French validation copy.
- Hydration produces no locale mismatch.
- API requests remain valid without a locale header.
- API error-code translation works after client navigation and refresh.

## Focused verification

Run these commands sequentially after implementation:

```text
vp install
vp run --filter ./packages/contract test
vp run --filter ./packages/contract typecheck
vp run --filter ./apps/web test
vp run --filter ./apps/web typecheck
vp check --fix <changed-files>
```

Use the repository's browser smoke-test workflow for the login and signup
routes. Verify both locale URLs and a locale switch while validation errors are
visible.

Inspect `git status --short` and the final diff. Only the intended dependency,
locale, adapter, schema, and test files should change.

## Acceptance gate

The implementation is complete when:

- `packages/contract` has no Nuxt or Vue I18n dependency.
- The web app uses parse-local Valibot locale configuration.
- Built-in Valibot validation errors render in the active locale.
- Custom user-facing validation messages use stable identities and translated
  web copy.
- No code changes Valibot's global locale configuration at runtime.
- Existing form types, contract types, API error codes, and status codes remain
  compatible.
- Focused tests, typechecks, formatting, and browser smoke tests pass.

## References

- [`apps/web/nuxt.config.ts`](../../apps/web/nuxt.config.ts)
- [`apps/web/app/components/AuthPanel.vue`](../../apps/web/app/components/AuthPanel.vue)
- [`apps/web/app/lib/auth-form.ts`](../../apps/web/app/lib/auth-form.ts)
- [`apps/web/app/plugins/orpc.ts`](../../apps/web/app/plugins/orpc.ts)
- [`packages/contract/src/schema/errors.ts`](../../packages/contract/src/schema/errors.ts)
- [`apps/api/src/orpc.ts`](../../apps/api/src/orpc.ts)
- [Valibot internationalization](https://valibot.dev/guides/internationalization/)
- [Valibot issues](https://valibot.dev/guides/issues/)
- [Valibot parse configuration](https://valibot.dev/api/Config/)
- [Valibot integration](https://valibot.dev/guides/integrate-valibot/)
- [Current vee-validate Valibot adapter](https://unpkg.com/@vee-validate/valibot@4.15.1/dist/vee-validate-valibot.mjs)
