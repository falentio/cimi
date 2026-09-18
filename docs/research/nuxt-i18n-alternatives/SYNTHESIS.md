# Nuxt i18n alternatives: synthesis

This report compares Nuxt i18n options for `apps/web`. Checked 2026-09-17.
The source notes linked from [the index](./README.md) contain the detailed
evidence.

## Recommendation

Adopt `@nuxtjs/i18n` as the first implementation candidate. Do not add it in
this research change. First run the verification spike in the last section.

`@nuxtjs/i18n` reduces the amount of routing and SSR behavior that Cimi must
own. Its Nuxt module generates localized route variants, exposes locale-aware
navigation helpers, loads locale files on demand, and can generate locale SEO
metadata. Those are the exact seams that the current app does not have.

Use the `prefix_except_default` strategy for the first spike. It keeps current
English URLs unprefixed and adds a locale prefix for other languages. That is
the smallest URL change for existing users. Confirm the public dashboard URL
policy before applying the strategy to `public/[identifier]`.

Keep `nuxt-intlayer` as the alternative if Cimi wants a content-file workflow
with generated types for every message. Intlayer has the strongest explicit
content typing in this comparison. Its Nuxt routing, SSR details, SEO output,
cache behavior, and production support envelope remain less clear in the
reviewed sources.

Do not select `nuxt-i18n-micro` because of its published benchmark alone. The
benchmark uses a small controlled fixture and the captured source did not
include the numeric results. Measure it against the same Cimi build and route
set if bundle or build performance becomes a blocking issue.

## Comparison

| Candidate                                 | Nuxt routing                                                                   | SSR and loading evidence                                                                 | SEO                                                                                  | Type safety                                                                             | App-owned work                                                                   | Fit for Cimi                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`@nuxtjs/i18n`](./nuxtjs-i18n.md)        | Nuxt-native route variants and four strategies                                 | Nuxt integration and lazy loaders are documented. Exact SSR loader timing needs a spike. | `useLocaleHead()` handles `lang`, `hreflang`, OpenGraph locale, and canonical links. | Vue I18n typing is available, but end-to-end route and message typing is not automatic. | Migrate raw paths and configure locale files, detection, and head metadata.      | **Recommended baseline.**                                                |
| [`nuxt-i18n-micro`](./nuxt-i18n-micro.md) | Nuxt-native route variants and four strategies                                 | Cache and translation payload options exist. Exact SSR behavior needs a spike.           | Metadata is enabled by default with canonical and locale tags.                       | `[Unknown]` in the reviewed sources.                                                    | Similar migration to `@nuxtjs/i18n`, plus module-specific API validation.        | Performance contender, not the default.                                  |
| [`nuxt-intlayer`](./intlayer.md)          | Multilingual routing and detection middleware are claimed.                     | Selective content loading is claimed. Exact Nuxt SSR and cache behavior is unknown.      | Sitemap and SEO optimization are claimed. Exact tags are unknown.                    | Strong generated content typing.                                                        | Adopt a new content and code-generation model, then migrate routes and messages. | Typed content contender.                                                 |
| [Direct `vue-i18n`](./vue-i18n.md)        | Manual. The official guide says the custom integration lacks advanced routing. | Manual plugin and dynamic imports are documented. SSR state and hydration are app-owned. | Manual.                                                                              | Vue I18n supports TypeScript, but setup is app-owned.                                   | Highest. Cimi owns routing, detection, SEO, and loader correctness.              | Good only when minimal integration matters more than features.           |
| [`i18next`](./i18next.md)                 | Manual. No Nuxt routing integration was evidenced.                             | Async initialization is documented. Nuxt SSR and locale loading need app code.           | Manual.                                                                              | CLI type generation exists. Typed calls are not established by the reviewed sources.    | Highest, with a second translation model and adapter.                            | Useful for a shared i18next ecosystem, otherwise weak fit.               |
| [`typesafe-i18n`](./typesafe-i18n.md)     | Manual. A Nuxt adapter was not evidenced.                                      | SSR and async locale loading are documented.                                             | Manual.                                                                              | Strongest generated translation API typing.                                             | High. Cimi owns Nuxt route integration and code generation.                      | Best typed-runtime option if Nuxt work is acceptable.                    |
| [Paraglide JS](./paraglide.md)            | Routing and server docs exist, but Nuxt integration was not evidenced.         | First-class SSR and compiler output are documented. Locale lazy loading is unknown.      | Manual or framework-specific.                                                        | Strong generated message functions.                                                     | High. Cimi owns the Nuxt bridge, routing, and build integration.                 | Performance and type-safety option for a team willing to own the bridge. |

## What the user and maintainer inherit

For a Cimi user, the choice changes whether a locale switch preserves the
current page, whether a first request renders in the selected language, and
whether dates, numbers, errors, labels, and navigation agree on one locale.

For the maintainer, the choice changes who owns route names, redirects, locale
loading, message typing, SEO head state, and failure behavior. A Nuxt module
owns more of those boundaries. A generic or compiler-first library gives more
control but leaves more integration code in this repository.

## Current request flow

The current app has no locale boundary. A selected library would need to enter
the request before page rendering and before auth redirects produce new paths.

```text
request URL
├── resolve locale from URL, cookie, or browser
├── load the selected locale messages
├── render Nuxt page and layout
│   ├── set html lang and locale SEO metadata
│   └── run auth redirect with a locale-aware destination
└── generate locale-aware links for navigation, breadcrumbs, and tabs
```

## Cimi-specific trade-offs

### URL preservation versus URL clarity

`prefix_except_default` preserves current English URLs while making the other
locales addressable. `no_prefix` preserves every existing URL but moves locale
state into detection and cookies. It also makes each locale URL less explicit.
The Nuxt i18n guide says `no_prefix` cannot use custom paths or ignored routes
unless `differentDomains` is also enabled. This matters for the public dashboard
and invite pages.

### Module behavior versus application control

`@nuxtjs/i18n` and Micro reduce application code by changing Nuxt's generated
routes. That also means route names, redirect behavior, and generated paths
must follow module rules. Direct Vue I18n avoids route generation, but Cimi
would need to implement and test those rules itself.

### Typed messages versus typed routes

Intlayer, `typesafe-i18n`, and Paraglide provide stronger explicit typing for
translation access than the reviewed Nuxt module sources. None of the reviewed
evidence gives Cimi both that message typing and Nuxt-native route migration.
The team must decide whether message-key errors or route integration work is
the larger expected cost.

### Lazy loading versus loader complexity

Nuxt i18n can dynamically load one locale or merge shared and regional files.
It can also load messages from a remote API through a loader. That reduces the
initial locale payload but introduces loader execution and cache behavior that
must be tested under Nitro's `node-server` preset. A compiler-first library may
reduce shipped code, but its generated artifacts become part of the build
contract.

### SEO versus this app's page mix

The authenticated dashboard is the main surface, so localized route behavior
and hydration matter more than search indexing. The public dashboard is already
`noindex, nofollow`. If public pages remain non-indexable, `hreflang` and
canonical tags there may not justify the URL migration cost. The SEO decision
still matters for any future public marketing pages.

## Risks to close before adoption

| Risk                       | Why it matters                                                                           | Closure test                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Raw route strings          | Auth redirects, breadcrumbs, tabs, and links can drop the locale.                        | Search all route construction and navigate between locales from every affected surface.           |
| SSR and hydration mismatch | Browser-only detection can render one language on the server and another in the browser. | Request each locale directly with SSR enabled, then hydrate and switch locale.                    |
| Locale loader behavior     | Function loaders have different server and client constraints.                           | Test a static file loader and a remote loader under `node-server`.                                |
| Public and invite URLs     | These paths have different visibility and redirect requirements.                         | Verify `public/[identifier]` and `invite/[token]` with direct, prefixed, and invalid locale URLs. |
| Message coverage           | A translated shell with English fallbacks can hide missing keys.                         | Add missing-key checks to the test or build path.                                                 |
| Date and number semantics  | Existing code formats values without a shared locale contract.                           | Compare calendar, chart, and metric output for at least two locales.                              |
| Dependency compatibility   | The app uses Nuxt 4.5.2 and Nitro `node-server`.                                         | Run install, typecheck, focused tests, build, and an SSR smoke test on the exact app versions.    |

## Verification spike

Run this as a separate implementation change after the library decision.

1. Configure two locales with `prefix_except_default` and one shared locale
   file plus one locale-specific file.
2. Move the root `lang` attribute from the static config to locale-aware head
   generation.
3. Convert one authenticated route, one settings tab, one breadcrumb, one
   auth redirect, one invite route, and the public dashboard route.
4. Test direct SSR requests, client navigation, locale switching, refresh,
   invalid locales, and auth redirects.
5. Record build output, initial payload, locale-switch request count, and
   server response behavior.

The spike passes only if the selected locale survives direct navigation,
refresh, client navigation, and auth redirects without hydration warnings or
untranslated route labels.

## Final judgment

`@nuxtjs/i18n` is the right default for this app. It matches the app's Nuxt
architecture and removes the most dangerous integration work. The typed
alternatives are credible when generated content types or compiler output are
the primary product requirement. That requirement is not visible in the
current app. The first implementation should therefore optimize for correct
route and SSR behavior, then add stronger message typing if the verification
spike exposes a real need.
