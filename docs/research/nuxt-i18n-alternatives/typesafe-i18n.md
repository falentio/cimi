# `typesafe-i18n`

`typesafe-i18n` generates a typed translation API from locale data. It is the
strongest explicit message-typing candidate in this comparison, but it does
not provide the Nuxt route integration that Cimi needs.

## Source facts

- `[Source fact]` The project generates a fully type-safe translation API with
  autocomplete, key and argument checking, and missing-translation checks.
  [Project repository](https://github.com/ivanhofer/typesafe-i18n)
- `[Source fact]` The documented feature set includes plural rules, date and
  number formatting, gender and select cases, namespaces, locale detection,
  SSR, and asynchronous locale loading.
  [Project repository](https://github.com/ivanhofer/typesafe-i18n)
- `[Source fact]` The project documents browser, server, API, and frontend use
  and provides a Vue adapter. The project claims a runtime size of about 1 KB
  and no external dependencies.
  [Project repository](https://github.com/ivanhofer/typesafe-i18n)
- `[Source fact]` The project is available under the MIT license.
  [Project repository](https://github.com/ivanhofer/typesafe-i18n)
- `[Unknown]` The reviewed sources do not establish a Nuxt-specific adapter,
  Nuxt route generation, localized SEO, or a current Nuxt 4 compatibility
  matrix.

## Trade-offs

The following advantages and costs are inferences from the source facts and
the current app.

### Advantages

- Generated functions make missing keys and invalid interpolation arguments
  visible during development rather than at runtime.
- The generated runtime is designed to be small, and async locale loading and
  namespaces can keep initial payloads down.
- The same generated locale API can serve browser, server, and API code.
- The license and no-external-dependency claim reduce direct runtime dependency
  cost.

### Costs

- Cimi still owns localized route generation, locale-aware links, detection,
  redirects, head metadata, and Nuxt SSR integration.
- Code generation adds a build step and generated files that must stay in sync
  with locale sources.
- Component code must use the generated API instead of a generic `$t` call.
  That makes the migration more explicit and less compatible with a basic
  locale-file move.
- The 1 KB figure is a project claim, not an independent Cimi measurement.

## Fit for Cimi

Choose this option if type safety is the primary requirement and the team is
willing to own a Nuxt adapter. It is not the lowest-risk first change because
the route and SSR seams remain in Cimi.

## Verification gaps

- Confirm the Vue adapter's Nuxt 4 SSR behavior.
- Define generated-file ownership and the Vite Plus build command.
- Build a route helper that preserves typed translations and locale-aware URLs.
- Measure generated output and initial locale payload against the Nuxt-native
  candidates.
