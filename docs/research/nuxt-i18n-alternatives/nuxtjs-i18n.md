# `@nuxtjs/i18n`

`@nuxtjs/i18n` is the Nuxt module powered by Vue I18n. It is the baseline
candidate for `apps/web`.

## Source facts

- `[Source fact]` The module supports Vue I18n integration, static and dynamic
  localized routes, lazy translations, SEO tags, and Nuxt layers.
  [Module README](https://github.com/nuxt-modules/i18n)
- `[Source fact]` The module repository is available under the MIT license.
  [Module README](https://github.com/nuxt-modules/i18n)
- `[Source fact]` The module overrides Nuxt-generated routes when a `pages`
  directory exists. It supports `no_prefix`, `prefix_except_default`, `prefix`,
  and `prefix_and_default` strategies.
  [Routing strategies](https://i18n.nuxtjs.org/docs/guide)
- `[Source fact]` `no_prefix` keeps the locale out of the URL and relies on
  browser or cookie detection plus the i18n API for switching. Custom paths and
  ignored routes need `differentDomains` with this strategy.
  [Routing strategies](https://i18n.nuxtjs.org/docs/guide)
- `[Source fact]` Locale entries can point to one file or multiple files.
  Files load dynamically, and multiple files merge in array order. Static files
  are cached by filename by default.
  [Lazy-load translations](https://i18n.nuxtjs.org/docs/guide/lazy-load-translations)
- `[Source fact]` Function-based locale loaders can return a promise and can
  fetch locale data. A loader that uses Nuxt app composables runs inside the
  Nuxt app instead of the messages endpoint.
  [Lazy-load translations](https://i18n.nuxtjs.org/docs/guide/lazy-load-translations)
- `[Source fact]` `useLocaleHead()` can generate the `<html lang>` attribute,
  `hreflang` links, OpenGraph locale tags, and canonical links. Locale entries
  need language tags, and `baseUrl` is needed for fully qualified alternate
  URLs.
  [SEO](https://i18n.nuxtjs.org/docs/guide/seo)
- `[Unknown]` The reviewed sources do not provide an independent benchmark,
  full SSR timing contract, end-to-end typed route and message contract, or a
  release-maintenance service-level commitment.

## Trade-offs

The following advantages and costs are inferences from the source facts and
the current app.

### Advantages

- Nuxt owns route generation instead of Cimi writing a parallel route map.
- The module already has locale-aware link and route composables.
- Lazy locale files support a small initial payload and shared regional files.
- The SEO helper covers the metadata that a manual integration commonly misses.
- Vue I18n remains available for interpolation, pluralization, date, and number
  formatting.

### Costs

- The module changes generated route names and paths. Cimi must audit every raw
  path in navigation, breadcrumbs, settings tabs, invite redirects, and auth
  redirects.
- `no_prefix` is not a free way to preserve routes because its custom-path and
  ignored-route limits affect the public and invite surfaces.
- Function loaders have execution constraints. A loader cannot assume every
  Nuxt app composable exists when the module runs it outside the app.
- Locale file messages are not automatically the same as typed route names.
  The team still needs a missing-key and route-linking policy.
- The module adds Nuxt-specific behavior that must be carried across Nuxt and
  module upgrades.

## Fit for Cimi

This candidate best matches the current architecture. The app already uses
Nuxt pages, layouts, and route middleware. It does not have a translation
runtime or a custom route abstraction. The module fills that gap without
requiring Cimi to design the SSR, locale detection, or localized route layer
first.

The first spike should use `prefix_except_default`, static locale files, and
explicit locale-aware links. Add remote or function loaders only after direct
SSR and hydration work.

## Verification gaps

- Confirm exact Nuxt `4.5.2` compatibility with the installed dependency graph.
- Confirm how the chosen detection settings behave on SSR and client hydration.
- Confirm loader execution and caching under Nitro's `node-server` preset.
- Confirm how public and invite routes interact with ignored routes and custom
  paths.
- Measure initial payload, locale-switch requests, build time, and route count.
