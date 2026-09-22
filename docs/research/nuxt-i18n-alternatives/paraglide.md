# Paraglide JS

Paraglide JS is a compiler-first i18n library. It generates typed ESM message
functions and is designed to remove unused translations through tree-shaking.

## Source facts

- `[Source fact]` The compiler emits typed ESM functions and generated locale
  and runtime modules. The documented usage calls generated functions such as
  `m.greeting()`.
  [Project repository](https://github.com/opral/paraglide-js)
- `[Source fact]` The project documents server-side rendering, server
  middleware, and locale routing concepts.
  [Server-side rendering](https://paraglidejs.com/server-side-rendering),
  [i18n routing](https://paraglidejs.com/i18n-routing)
- `[Source fact]` The project claims up to 70 percent smaller i18n bundles and
  gives a comparison of 47 KB versus 205 KB for five locales and 200 messages.
  This is a project benchmark claim.
  [Project repository](https://github.com/opral/paraglide-js)
- `[Source fact]` Vue usage is supported. The reviewed source lists framework
  integrations for Vue, React, SvelteKit, TanStack, Astro, Solid, and vanilla
  JavaScript or TypeScript.
  [Project repository](https://github.com/opral/paraglide-js)
- `[Source fact]` The project is available under the MIT license.
  [Project repository](https://github.com/opral/paraglide-js)
- `[Unknown]` The reviewed sources do not establish a Nuxt-specific module,
  Nuxt route integration, or locale lazy-loading behavior.

## Trade-offs

The following advantages and costs are inferences from the source facts and
the current app.

### Advantages

- Generated message functions give strong key and parameter typing.
- Compilation and tree-shaking can reduce shipped translation code when the
  source graph is structured for it.
- Server and routing concepts are part of the documented model, so a Nuxt
  bridge can use an established compiler/runtime design.
- The generated ESM output fits a Vite-based build better than a runtime that
  must interpret every message on the client.

### Costs

- Cimi would own the Nuxt bridge, route middleware, locale persistence, head
  metadata, and integration with Nuxt's SSR lifecycle.
- The compiler becomes part of the build contract. Generated files, config, and
  plugin ordering must work with Vite Plus and Nuxt's build.
- The bundle-size claim is not an independent benchmark and may not hold for
  Cimi's shared dashboard messages.
- The reviewed sources do not show how locale switching loads data at runtime.
  A compiler that emits all needed functions can have a different payload
  shape from a locale-file lazy loader.

## Fit for Cimi

Paraglide is a strong option if bundle size and generated message typing are
first-order requirements. It is a poor first choice when Nuxt-native routing
and low migration risk matter more than compiler output.

## Verification gaps

- Prove a Nuxt 4.5.2 SSR integration with the current Vite Plus config.
- Verify generated output for shared dashboard messages and two locales.
- Test direct locale URLs, client switching, auth redirects, and refresh.
- Measure initial and switched locale payloads against `@nuxtjs/i18n`.
- Define how generated files are checked in or generated in CI.
