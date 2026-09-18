# Nuxt i18n alternatives

Research for choosing an internationalization library for `apps/web`. Checked
2026-09-17. The candidate notes use first-party documentation and repository
source where available.

## Decision in one paragraph

Use `@nuxtjs/i18n` as the baseline choice. It combines Nuxt-native localized
routing, locale-aware links, lazy locale files, and locale SEO metadata in one
integration. Keep `nuxt-intlayer` as the typed content alternative if
generated content types matter more than a small migration. Do not choose
`nuxt-i18n-micro` for its benchmark claims without running the same workload
in this repository.

## Candidate notes

- [Synthesis](./SYNTHESIS.md)
- [`@nuxtjs/i18n`](./nuxtjs-i18n.md)
- [`nuxt-i18n-micro`](./nuxt-i18n-micro.md)
- [`nuxt-intlayer` and Intlayer](./intlayer.md)
- [Direct `vue-i18n`](./vue-i18n.md)
- [`i18next` and `i18next-vue`](./i18next.md)
- [`typesafe-i18n`](./typesafe-i18n.md)
- [Paraglide JS](./paraglide.md)

## Evidence labels

- `[Source fact]` means the linked source states the claim.
- `[Inference]` means the claim follows from source facts and this app's code.
- `[Unknown]` means the reviewed sources did not establish the claim. It does
  not mean that the candidate lacks the feature.

## App snapshot

- [`apps/web`](../../../apps/web) uses Nuxt `4.5.2`, Vue `3.5.42`, and Nitro's
  `node-server` preset.
- [`apps/web/nuxt.config.ts`](../../../apps/web/nuxt.config.ts) sets
  `<html lang="en">` statically and has no i18n module.
- The app uses Nuxt pages, layouts, global client auth middleware, and raw
  string paths in redirects, navigation, settings tabs, and breadcrumbs.
- [`apps/web/app/layouts/public.vue`](../../../apps/web/app/layouts/public.vue)
  marks public dashboards as `noindex, nofollow`.
- The app already uses `@internationalized/date` and `Intl` formatting in
  calendar and dashboard code.

## Scope

The comparison covers route generation, locale detection, SSR and hydration,
lazy loading, SEO, formatting, type safety, translation workflow, bundle and
build cost, maintenance, licensing, testing, and migration work. The report
does not select translation vendors or define the product's supported locales.
