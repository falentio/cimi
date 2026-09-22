# Direct `vue-i18n`

Direct `vue-i18n` is the low-level option. Cimi would install Vue I18n and
register it through a Nuxt plugin without a Nuxt i18n module.

## Source facts

- `[Source fact]` The official Nuxt integration guide shows a manual Nuxt
  plugin that creates a Vue I18n instance and installs it on the Vue app.
  [Nuxt 3 integration](https://vue-i18n.intlify.dev/guide/integrations/nuxt3)
- `[Source fact]` The same guide recommends `@nuxtjs/i18n` for advanced Nuxt
  features such as localized routing and SEO. It explicitly says the custom
  integration does not support those advanced features.
  [Nuxt 3 integration](https://vue-i18n.intlify.dev/guide/integrations/nuxt3)
- `[Source fact]` Vue I18n can lazy-load locale files with dynamic imports,
  `setLocaleMessage`, and a router navigation guard.
  [Lazy loading](https://vue-i18n.intlify.dev/guide/advanced/lazy.html)
- `[Source fact]` The official guide documents `@intlify/unplugin-vue-i18n` as
  a build optimization that precompiles messages and can use the runtime-only
  Vue I18n build.
  [Nuxt 3 integration](https://vue-i18n.intlify.dev/guide/integrations/nuxt3)
- `[Unknown]` The reviewed sources do not establish a ready-made Nuxt route,
  locale detection, SEO implementation, license terms, or release-maintenance
  commitment for a direct Vue I18n integration.

## Trade-offs

The following advantages and costs are inferences from the source facts and
the current app.

### Advantages

- It is the smallest conceptual dependency. Cimi uses the Vue I18n API without
  adopting a Nuxt route-generation module.
- Cimi controls route shape, detection, persistence, SSR state, and SEO.
- The runtime and message format are well documented in Vue I18n's own guides.
- Dynamic imports and message precompilation can address payload and runtime
  cost when configured correctly.

### Costs

- Cimi owns the hard parts that the app needs most. That includes localized
  route generation, locale-aware navigation, detection, redirects, and head
  metadata.
- The official guide's simple router guard is not a Nuxt route integration. It
  does not define how server rendering and client hydration share the initial
  locale.
- Every future route convention becomes local Cimi infrastructure.
- A manual integration makes it easier for one raw `navigateTo('/...')` or
  `NuxtLink` path to bypass locale state.

## Fit for Cimi

This option is appropriate only if Cimi wants to own a thin i18n adapter and
does not want localized URLs. It is not a good default for the current app,
because the user request includes the route, redirect, and SEO trade-offs that
the Nuxt module already addresses.

## Verification gaps

- Prove SSR and hydration with the manual plugin before considering it.
- Define and test a route-localization contract.
- Define locale persistence and browser detection behavior.
- Add head metadata and verify canonical and alternate URLs.
- Add a message-key and missing-translation check.
