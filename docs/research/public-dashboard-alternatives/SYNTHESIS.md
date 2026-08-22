# Public Dashboard Alternatives: Synthesis

Research for Cimi issue [#8](https://github.com/falentio/cimi/issues/8), checked 2026-08-23. Candidate reports in this directory contain the source-by-source evidence.

## Comparison

| Alternative | Public access model | Public query scope | Export behavior | Revocation | Indexing/rate observations |
| --- | --- | --- | --- | --- | --- |
| Umami | Open bearer share URL with signed share JWT; public website or board | Page/section allowlist, but Sessions/Events can expose detailed data; filters/date ranges remain available | Normal public UI hides download; export route requires authenticated user | Share-row deletion blocks new token resolution; already issued JWTs may remain valid because no expiry/row recheck was evidenced | `noindex,nofollow`; no public-share rate/caching contract found |
| Matomo | Site-level anonymous `View` permission or private `token_auth` user | Reports permitted to anonymous user; filters are query controls, not new authorization boundaries | Public API can return JSON/CSV/etc. when report is permitted | Remove anonymous Site permission; no per-link lifecycle | No universal on-prem public limit/cache contract; robots is not sufficient |
| PostHog | Random bearer URL for dashboard/insight/embed; optional password | Fixed shared resource and configured tiles; public filter/date overrides disabled/ignored | PNG export exists; normal CSV/JSON behavior needs version validation | Disable or rotate; old URL has five-minute grace; password sessions 24h | Robots blocks shared paths; throttles shared views; refresh/cache around 30 min |
| Plausible | Site-wide public boolean or per-site random shared slug, optional password/segment | Aggregate dashboard; shared viewers can add filters/date ranges within segment | Shared dashboard can export filtered aggregate CSV ZIP | Toggle public off or delete shared row; no documented expiry | `noindex,nofollow`; no public-link rate/cache contract |
| Rybbit | Site-wide `public` flag or one Site-wide private key | Broad public route family: analytics, sessions, users, events, funnels, replay, GSC | CSV is reachable through public/private-link routes; PDF is authenticated-only | Toggle flag or replace/revoke one key; clustered cache may delay up to one minute | No public-link limiter; widget has 60s cache; app has no reliable noindex evidence |
| Databuddy | Site-wide `isPublic` boolean with stable website ID in URL | Overview UI, but anonymous query registry also exposes events/properties, errors, and Web Vitals; viewers control dates/filters | Authenticated export procedure; no public export documented | Toggle `isPublic` off; metadata cache may be stale for up to 600s | Public route is crawl-permissive in source; anonymous query limit 60/min and 8 concurrent/site |
| Simple Analytics | Site-wide public hostname path; separate authenticated team/custom-view sharing | Aggregate dashboard/API with viewer date/filter controls; public example also exposed event routes | Public raw CSV was observed despite general docs requiring auth | Public/private toggle; link rotation/expiry and cache invalidation unavailable | Public example had no noindex signal; no general public rate/cache contract |

## Cross-product findings

1. **“Public” is usually Site-wide, while “shared” is usually a bearer URL.** Plausible, Databuddy, Simple Analytics, and Rybbit use Site-level switches. Umami, PostHog, and Plausible also provide link-scoped sharing. Site-wide public mode is simple but cannot independently revoke recipients.
2. **A URL is a credential whenever possession grants access.** Random slugs reduce enumeration but do not authenticate viewers. Stable Site IDs/hostnames are weaker because they are discoverable and often already present in ingestion or public metadata.
3. **Read-only does not mean aggregate-only.** Rybbit’s public read chain exposes raw/session-level and integration data; Umami can expose Sessions and Events; Simple Analytics observed raw CSV access; Plausible shared links can export aggregate CSVs. Cimi needs a server-side disclosure allowlist and separate export decision.
4. **PostHog is the strongest reference for an immutable published view.** The public viewer cannot change dashboard filters/date ranges or override saved variables. This is safer than inheriting the viewer-controlled query behavior found in Plausible, Databuddy, Simple Analytics, and Rybbit.
5. **Viewer-controlled filters require a public-specific query contract.** Hiding controls in the UI is insufficient: Umami’s source still accepts filter parameters on some public routes, and Rybbit’s public routes share authenticated time/filter contracts. Cimi must enforce the public filter catalog, time range, granularity, and field redaction in a dedicated procedure.
6. **Noindex is discoverability guidance, not access control.** Umami, Plausible, and PostHog provide useful crawler controls. Databuddy and the inspected Rybbit app do not provide a reliable public noindex boundary. Cimi should emit `noindex,nofollow`, avoid sitemaps, and still assume URLs can leak.
7. **Revocation has cache and copied-data semantics.** PostHog has a documented five-minute rotation grace period; Databuddy has a 600-second metadata cache; Rybbit documents a one-minute clustered config-cache window; several products do not define propagation. Cimi must define authorization cutoff separately from browser/cache/downloaded-copy deletion.
8. **Public query throttling is a product contract.** Many alternatives leave public-link limits unspecified. Databuddy supplies a 60/min anonymous query limit and eight concurrent queries/site; Rybbit’s public routes bypass bearer limits. Cimi’s selected 360 requests/Site/minute and 600 requests/IP/minute must apply to the dedicated public query procedure, with a bounded concurrency rule and `429` response.
9. **Public disclosure needs collection-time and read-time controls.** Rybbit’s replay masking and IP/URL settings happen at collection but do not guarantee safe public responses. Cimi must exclude Identified Users, Traits, raw IPs, replay, GSC/integration data, and sensitive URL/query data at the public read boundary even if those fields exist privately.

## Cimi decision pressure

- The selected open public URL is closest to Plausible/Databuddy/Simple Analytics, but Cimi should use a random Public Dashboard Identifier rather than a Site ID or hostname to prevent trivial enumeration.
- The selected no-key model means the Public Dashboard Identifier is a public capability, not a secret or management credential. Disabling public mode must fail closed; rotating the identifier on re-enable is needed if old links must stay revoked.
- The revised “all filters for MVP” decision must be made precise: it can mean all filters in the approved public catalog, but cannot mean arbitrary authenticated filters, raw IDs, traits, session selectors, replay selectors, custom SQL, GSC dimensions, or unrestricted event properties without contradicting aggregate-only disclosure and k=5 suppression.
- A dedicated public query procedure is preferable to reusing authenticated analytics routes. It should enforce the one-hour granularity, 90-day maximum window, approved filters/metrics/dimensions, k=5 suppression with normal empty results, five-minute cache, 360/Site/minute and 600/IP/minute limits, and bounded concurrency.

## Primary reports

- [Umami](./umami.md)
- [Matomo](./matomo.md)
- [PostHog](./posthog.md)
- [Plausible](./plausible.md)
- [Rybbit](./rybbit.md)
- [Databuddy](./databuddy.md)
- [Simple Analytics](./simple-analytics.md)
