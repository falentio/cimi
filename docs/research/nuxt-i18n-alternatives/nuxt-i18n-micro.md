# `nuxt-i18n-micro`

`nuxt-i18n-micro` is a Nuxt i18n module that targets a smaller and faster
implementation than the full Nuxt i18n module.

## Source facts

- `[Source fact]` The configuration supports `no_prefix`,
  `prefix_except_default`, `prefix`, and `prefix_and_default` route strategies.
  [Configuration reference](https://s00d.github.io/nuxt-i18n-micro/guide/configuration)
- `[Source fact]` The configuration exposes automatic language detection, path
  detection, translation payloads, HTTP cache duration, cache size, and cache
  TTL settings.
  [Configuration reference](https://s00d.github.io/nuxt-i18n-micro/guide/configuration)
- `[Source fact]` The module enables locale SEO metadata by default and
  documents `hreflang`, canonical, `og:url`, and `og:locale` output. Its base URL
  can use `nuxt-site-config` or the request origin when not set explicitly.
  [Configuration reference](https://s00d.github.io/nuxt-i18n-micro/guide/configuration)
- `[Source fact]` Its performance page compares plain Nuxt, Micro, and
  `@nuxtjs/i18n` using build time, peak memory, deploy size, Artillery, and
  Autocannon. The captured benchmark uses Node `22.22.1`, Nuxt `4.5.1`, Micro
  `3.25.0`, and `@nuxtjs/i18n` `10.6.0`, with three runs.
  [Performance results](https://s00d.github.io/nuxt-i18n-micro/guide/performance-results)
- `[Source fact]` The benchmark uses a controlled four-locale, two-page fixture
  and warns that its plain-Nuxt baseline performs large JSON requests per
  request.
  [Performance results](https://s00d.github.io/nuxt-i18n-micro/guide/performance-results)
- `[Unknown]` The captured performance page did not include the numeric results
  or a production-sized Cimi workload.
- `[Unknown]` The reviewed configuration did not establish exact SSR loader
  timing, message typing, a complete compatibility matrix, or the license and
  release-maintenance terms for the module.
- `[Source fact]` The FAQ warns that module composables may not work as expected
  inside Nuxt plugins or utility functions.
  [FAQ](https://github.com/s00d/nuxt-i18n-micro/blob/main/docs/guide/faq.md)

## Trade-offs

The following advantages and costs are inferences from the source facts and
the current app.

### Advantages

- It keeps Nuxt-native route generation while exposing more explicit cache and
  payload controls.
- The module targets lower build, memory, and deployment cost.
- Locale SEO metadata works without the separate `useLocaleHead()` setup used by
  the full module, according to its configuration guide.
- It is a plausible option when locale payload size or build memory is a first-
  order constraint.

### Costs

- The benchmark is a vendor-controlled fixture. Its existence does not prove a
  win for this app, and the numeric results were not available in the captured
  source.
- A smaller module can mean fewer ecosystem examples and more behavior that
  Cimi must validate itself. The reviewed sources do not quantify this cost.
- The FAQ's plugin and utility limitation matters because Cimi keeps route and
  formatting helpers outside page components.
- Switching from the full Nuxt module later may require changing composable
  names, configuration shape, route assumptions, and locale loading behavior.
- The reviewed sources do not establish end-to-end message typing.

## Fit for Cimi

Micro is a performance contender, not the default. The app has no measured
i18n build or payload problem yet. Choosing it first would trade the full
module's broader Nuxt documentation for a performance claim that still needs
an app-specific test.

Use Micro only if the verification spike shows a material problem with the
full module or if the project's explicit budget makes its controls necessary.

## Verification gaps

- Run the published benchmark with Cimi's route count and locale files.
- Compare initial payload, locale-switch payload, build memory, and SSR latency
  against `@nuxtjs/i18n` on the same Node and Nuxt versions.
- Exercise composables from `apps/web/app/utils`, plugins, middleware, and
  layouts because the FAQ calls out utility and plugin behavior.
- Confirm testing guidance and route behavior for public and invite paths.
