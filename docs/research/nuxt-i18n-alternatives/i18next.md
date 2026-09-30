# `i18next` and `i18next-vue`

`i18next` is a broad internationalization framework. `i18next-vue` provides
the Vue binding. The pair is useful when translation resources or tooling must
be shared across several non-Vue runtimes.

## Source facts

- `[Source fact]` The Vue binding supports Vue 2 and Vue 3. The documented
  model initializes i18next, installs the Vue plugin, and exposes translation
  access through Vue.
  [i18next framework list](https://www.i18next.com/overview/supported-frameworks)
  and [i18next-vue](https://github.com/i18next/i18next-vue)
- `[Source fact]` The official framework list describes `i18next-vue` as a Vue
  binding and warns that the list is contributed by maintainers and may become
  outdated.
  [Supported frameworks](https://www.i18next.com/overview/supported-frameworks)
- `[Source fact]` The official i18next CLI supports key extraction, linting,
  locale syncing, and type generation.
  [Supported frameworks](https://www.i18next.com/overview/supported-frameworks)
- `[Source fact]` i18next supports Node and Deno and the Vue binding supports
  Vue 2 and Vue 3.
  [Supported frameworks](https://www.i18next.com/overview/supported-frameworks)
- `[Source fact]` The `i18next-vue` repository exposes an MIT license.
  [i18next-vue](https://github.com/i18next/i18next-vue)
- `[Unknown]` The reviewed sources do not establish Nuxt route generation,
  Nuxt SSR integration, locale-aware SEO, or a Nuxt-specific lazy-loading
  contract for `i18next-vue`.

## Trade-offs

The following advantages and costs are inferences from the source facts and
the current app.

### Advantages

- The broader ecosystem can reuse resource formats, backend loaders, and
  translation tooling outside the Nuxt app.
- The CLI can help keep keys and locale files in sync.
- i18next has a large feature set for interpolation, pluralization, and
  resource loading.
- It can be a good fit if Cimi later needs one translation system across web,
  workers, and other clients.

### Costs

- The Vue adapter is not a Nuxt integration. Cimi would own route localization,
  SSR initialization, hydration state, detection, and SEO.
- The framework list's maintenance warning creates more upgrade risk than a
  Nuxt-native module for this app.
- The i18next resource and plugin model adds concepts that Cimi does not need
  for a first Nuxt-only implementation.
- CLI type generation is not the same as compile-time checking of every
  translation call. The reviewed sources do not establish that stronger
  contract.

## Fit for Cimi

Use i18next only when cross-runtime translation sharing is a product
requirement. For a Nuxt-only app, its broader ecosystem does not offset the
missing Nuxt routing and SSR integration.

## Verification gaps

- Prove the i18next-vue plugin's SSR and hydration behavior in Nuxt 4.
- Define server and client initialization so a request does not render with the
  fallback locale before resources arrive.
- Compare resource loading and bundle size with `@nuxtjs/i18n`.
- Verify CLI type generation against the repository's TypeScript and Vite Plus
  workflow.
