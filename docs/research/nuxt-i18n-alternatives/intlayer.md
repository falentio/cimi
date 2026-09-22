# `nuxt-intlayer` and Intlayer

Intlayer is a typed, content-oriented localization system with a Nuxt
integration. Its Nuxt package is the strongest typed-content alternative in
this comparison.

## Source facts

- `[Source fact]` The Nuxt guide claims multilingual routing, locale-detection
  middleware, sitemap support, scoped content, and full typing.
  [Nuxt and Vue](https://intlayer.org/doc/environment/nuxt-and-vue)
- `[Source fact]` Intlayer content is defined in dictionaries and consumed
  through generated access such as `useIntlayer`.
  [Content concept](https://intlayer.org/doc/concept/content)
- `[Source fact]` The Nuxt guide says the integration loads only the needed
  content instead of large JSON files and claims up to 50 percent smaller
  bundles and pages.
  [Nuxt and Vue](https://intlayer.org/doc/environment/nuxt-and-vue)
- `[Source fact]` A repository template targets Nuxt 4 and Intlayer.
  [Nuxt 4 template](https://github.com/aymericzip/intlayer-nuxt-4-template)
- `[Unknown]` The reviewed Nuxt sources do not establish the exact URL strategy,
  detection precedence, cookie behavior, redirect algorithm, or generated SEO
  tags.
- `[Unknown]` The reviewed sources do not establish the Nuxt SSR lifecycle,
  cache policy, independent performance results, or license terms for the
  Nuxt package.

## Trade-offs

The following advantages and costs are inferences from the source facts and
the current app.

### Advantages

- Generated content types can catch missing keys and invalid content access in
  the editor and build.
- Per-scope content can keep unrelated locale data out of a page's payload.
- Locale detection and multilingual routing are included in the Nuxt story,
  rather than left entirely to application code.
- The content model can work well if product copy is owned by feature teams and
  should live beside the component that uses it.

### Costs

- Intlayer is a content model and build workflow, not only a Vue translation
  runtime. Cimi would adopt dictionaries, generated artifacts, and new loader
  conventions across the app.
- The 50 percent size claim is a vendor claim without methodology or an
  independent Cimi measurement.
- Nuxt support is visible through documentation and a Nuxt 4 template, but the
  reviewed sources do not provide a complete version support or maintenance
  contract.
- The exact SSR, caching, and SEO behavior is not clear enough to accept
  without a spike.
- Moving existing strings into scoped content files may cost more than moving
  them into ordinary locale files, especially for shared dashboard labels and
  API errors.

## Fit for Cimi

Choose Intlayer if the team wants typed, component-scoped content to be a core
architectural rule. It is less attractive if the immediate goal is to add
localized routes and a translation runtime with the smallest change to the
existing Nuxt app.

The current codebase has many shared labels, route labels, and server-originated
messages. The migration should prove that those messages fit the dictionary
model before choosing Intlayer over `@nuxtjs/i18n`.

## Verification gaps

- Build a two-locale Nuxt 4.5.2 spike from the exact app dependency graph.
- Verify direct SSR, hydration, locale switching, and auth redirects.
- Inspect generated output to identify what is shipped for one page and for all
  locales.
- Verify `hreflang`, canonical, `lang`, and sitemap output.
- Verify missing-key failures and the workflow for shared API error messages.
