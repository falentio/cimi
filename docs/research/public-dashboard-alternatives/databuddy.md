# Databuddy Analytics: Public Dashboard and Sharing Research

## Scope and Version Context

This report covers Databuddy's public/shared website dashboards and the data
that an unauthenticated viewer can retrieve through the public dashboard path or
the analytics query API. It does not assess Databuddy's ordinary team dashboard,
API-key sharing, short-link product, or status pages except where they clarify a
sharing boundary.

Primary sources were checked on **2026-08-23**. Repository observations use the
official `databuddy-analytics/Databuddy` `main` snapshot at commit
[`d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3`](https://github.com/databuddy-analytics/Databuddy/commit/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3),
committed 2026-08-21. Product documentation was checked at the official
Databuddy documentation and policy URLs linked below. The live checks are
reported separately from source facts because the deployed public route did not
match the repository's public-access path for the test website.

Terms used below:

- **Documentation fact**: Databuddy states this in an official document.
- **Source fact**: The cited official repository snapshot implements this.
- **Live observation**: A direct request to an official Databuddy deployment
  returned this result during research.
- **Inference**: A conclusion from the cited implementation, not a Databuddy
  promise.
- **Unavailable**: The reviewed primary sources do not establish the behavior.

## Executive Finding

**Source and documentation fact:** Databuddy implements website-level public
sharing, not a saved-dashboard/share-token model. An owner toggles a website's
`isPublic` flag, and the settings screen constructs
`{dashboard}/public/{websiteId}`. The UI describes this as "Anyone with the
link" viewing a read-only public analytics page ([settings source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/dashboard/app/%28main%29/websites/%5Bid%5D/settings/general/page.tsx#L321-L378)).

**Source fact:** The public page itself renders only the website overview, but
the anonymous `/v1/query` access registry currently permits substantially more
than the overview UI: custom events, event properties, error diagnostics, and
web-vitals queries are marked public-readable in addition to overview metrics
([public route source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/dashboard/app/public/%5Bid%5D/page.tsx#L15-L55), [public query registry](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/ai/src/query/builders/index.ts#L39-L145)).

**Decision-relevant conclusion:** This is an open bearer link whose effective
secret is knowledge of a stable website ID, with viewer-controlled filters and
date ranges. It has a simple website-level on/off revocation switch, but the
reviewed sources show no password, per-recipient ACL, expiry, token rotation,
public-export control, low-volume suppression, or share-specific field-redaction
policy. The absence statements are limited to the reviewed current source and
official documentation; they are not claims that Databuddy support could never
provide an undocumented feature.

## Link and Token Model

- **Source fact:** Public sharing is a boolean website setting. The mutation is
  `websites.togglePublic`, requires website `update` permission, writes
  `isPublic`, records an audit event, and invalidates website read caches
  ([toggle-public source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/rpc/src/routers/websites.ts#L738-L794)).
- **Source fact:** The generated share URL contains only the dashboard origin,
  `/public/`, and the website ID. The current settings code does not generate a
  random share secret, separate share record, or signed URL ([share-link construction](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/%28main%29/websites/%5Bid%5D/settings/general/page.tsx#L157-L172)).
- **Documentation fact:** Databuddy's event API calls `websiteId` the public
  Databuddy Client ID and says it is the same value used by the tracker; it is a
  public client identifier, not an API key ([event API](https://www.databuddy.cc/docs/api/events)).
- **Source fact:** The public route is `/public/[id]`, and its public summary
  procedure accepts the ID without a share-token input ([public route](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/dashboard/app/public/%5Bid%5D/layout.tsx#L25-L44), [summary procedure](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/rpc/src/routers/websites.ts#L564-L594)).
- **Inference:** For an enabled website, possession of the URL is the viewer
  authorization. The stable website ID is therefore bearer-like, even though it
  is not described by Databuddy as a token.
- **Unavailable:** The reviewed sources do not specify ID entropy, a separate
  public-link secret, password protection, link expiry, signed-link lifetime,
  or a way to rotate only the public URL while preserving the website ID.

## Open or Authenticated Access

- **Documentation fact:** The owner-facing settings copy says "Anyone with the
  link" can view the read-only public analytics page, and says public viewers
  cannot access settings, private analytics sections, or delete the site
  ([settings source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/dashboard/app/%28main%29/websites/%5Bid%5D/settings/general/page.tsx#L321-L378)).
- **Source fact:** The public summary uses `publicProcedure`; `withPublicWorkspace`
  grants an unauthenticated `demo` workspace when the website is public and the
  requested permissions are read-only. A private website still follows the
  authenticated permission path ([public summary](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/rpc/src/routers/websites.ts#L564-L594), [public workspace authorization](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/rpc/src/procedures/with-workspace.ts#L416-L471)).
- **Source fact:** The query API grants anonymous website access only when
  `website.isPublic` is true and every requested query type has
  `publicAccess: true`. Otherwise an unauthenticated request is denied
  ([query access check](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/api/src/routes/query.ts#L518-L547), [query project resolution](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/api/src/routes/query.ts#L732-L787)).
- **Source fact:** A disabled or unavailable public website is rendered as
  "This dashboard is not available or has been set to private" by the public
  page ([public page error state](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/public/%5Bid%5D/page.tsx#L27-L41)).
- **Live observation:** Opening
  [`https://app.databuddy.cc/public/3ed1fce1-5a56-4cb6-a977-66864f6d18e3`](https://app.databuddy.cc/public/3ed1fce1-5a56-4cb6-a977-66864f6d18e3)
  returned the public shell, but the browser's `getPublicSummary` and `/v1/query`
  requests returned `401`, and the page displayed the private/unavailable state.
  This proves that the public path is deployed, not that this particular test
  website is currently public. It also means the source-level open-access
  behavior was not independently confirmed against that production website.

## Data Scope

### Public URL UI

- **Source fact:** `/public/[id]` passes the website ID, current date range, and
  dynamic filters into `WebsiteOverviewTab`; it does not route to the normal
  website navigation or settings pages ([public page](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/public/%5Bid%5D/page.tsx#L15-L55)).
- **Source fact:** The overview UI requests summary metrics, today's metrics,
  event trends, top/entry/exit pages, page-time analysis, traffic sources,
  referrers, UTM dimensions, device/browser/OS breakdowns, outbound links, and
  country data ([overview query configuration](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/%28main%29/websites/%5Bid%5D/_components/tabs/overview-tab.tsx#L103-L235)).
- **Documentation fact:** Databuddy's dashboard guide describes these overview
  families as pageviews, visitors, sessions, bounce rate, duration, pages,
  performance, pages, traffic sources, device/browser/OS, and geographic
  analytics ([dashboard guide](https://www.databuddy.cc/docs/dashboard)).

### Anonymous query API

The current source's `PUBLIC_QUERY_TYPES` registry is the effective public data
allowlist for `/v1/query?website_id=...`:

| Public family | Query types exposed by the current source                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview      | `summary_metrics`, `today_metrics`, `active_stats`, `events_by_date`, `top_pages`, `entry_pages`, `exit_pages`, `page_time_analysis`, traffic/UTM queries, device/browser/OS queries, outbound-link queries, and `country`, `region`, `city` |
| Custom events | `custom_events`, `custom_event_properties`, `custom_events_by_path`, trend/summary/discovery queries, and property classification, cardinality, top-value, distribution, and recent queries                                                  |
| Errors        | `recent_errors`, `error_types`, `error_trends`, `errors_by_page`, `error_frequency`, `error_summary`, `error_chart_data`, and `errors_by_type`                                                                                               |
| Web vitals    | `vitals_overview`, `vitals_time_series`, `vitals_by_page`, and country/region/city/browser breakdowns                                                                                                                                        |

The allowlist and the `canReadQueryTypesPublicly` all-of check are in the
official source ([public query registry](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/ai/src/query/builders/index.ts#L39-L145)).

- **Source fact:** The public-query tests explicitly keep revenue builders
  private and reject a mixed request when even one requested query type is not
  public-readable ([public-access tests](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/ai/src/query/builders/public-access.test.ts#L65-L105)).
- **Source fact:** The public set contains no public profile, session, revenue,
  realtime, uptime-monitor, or short-link query family. This is an allowlist
  observation, not a guarantee that a future source revision will retain it
  ([public query registry](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/ai/src/query/builders/index.ts#L19-L104)).
- **Source fact:** Public queries still pass through normal website feature
  gates when the website belongs to an organization; a plan can therefore make
  a public query family unavailable ([query feature-gate path](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/api/src/routes/query.ts#L1377-L1396)).
- **Documentation fact:** The dashboard guide describes custom-event property
  categories and values, error messages/locations/stack traces, and web-vitals
  detail as dashboard data ([dashboard guide](https://www.databuddy.cc/docs/dashboard)).
  **Inference:** If those query families are enabled for a public website, the
  public API can expose the corresponding aggregate or diagnostic output. The
  reviewed public-sharing sources do not add a second redaction layer.
- **Unavailable:** The reviewed sources do not define a public-share-specific
  minimum group size, suppression threshold, differential-privacy layer,
  custom-event property redaction rule, error-message scrubbing rule, or
  per-field public-sharing policy.

## Filters and Time Ranges

- **Source fact:** The public layout includes the analytics date toolbar, and the
  public overview passes the current `dateRange` and `filters` to every overview
  query ([public layout](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/public/%5Bid%5D/layout.tsx#L117-L125), [overview requests](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/%28main%29/websites/%5Bid%5D/_components/tabs/overview-tab.tsx#L165-L235)).
- **Documentation fact:** The dashboard guide documents quick ranges of 24
  hours, 7, 30, and 90 days; custom start/end dates; period comparison; and
  hourly/daily/weekly/monthly views ([dashboard guide](https://www.databuddy.cc/docs/dashboard)).
- **Documentation fact:** The query API accepts explicit dates or presets,
  pagination up to `limit: 10000`, filters, grouping, and daily/hourly
  granularity. Hourly queries have a documented maximum 30-day range ([query API](https://www.databuddy.cc/docs/api/query)).
- **Documentation fact:** Supported filter operators include equality,
  inequality, substring, prefix, inclusion, and exclusion; documented common
  fields include country, device, browser, OS, path, and referrer ([query API](https://www.databuddy.cc/docs/api/query)).
- **Source fact:** Public authorization checks the website flag and query-type
  allowlist before the normal date, pagination, and builder filter validation;
  it does not bind the public link to an owner-selected range or filter set
  ([public access check](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/api/src/routes/query.ts#L518-L547), [query validation](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/api/src/routes/query.ts#L154-L178)).
- **Inference:** A viewer can change the range and permitted filters for the
  live website data, and can call the same public query API directly. The share
  URL generated by the settings page contains no owner-fixed snapshot or
  filter configuration ([share-link construction](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/%28main%29/websites/%5Bid%5D/settings/general/page.tsx#L157-L172)).

## Exports

- **Documentation fact:** Databuddy's dashboard guide advertises CSV export and
  REST API access as dashboard integration options ([dashboard guide](https://www.databuddy.cc/docs/dashboard)).
- **Source fact:** The repository's `websites.exportDownload` operation is a
  `protectedProcedure`; it requires authenticated website `read` permission and
  supports `csv`, `json`, `txt`, and `proto` formats ([export procedure](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/rpc/src/routers/websites.ts#L1160-L1216)).
- **Source fact:** The public page renders `WebsiteOverviewTab` only, with no
  public export action in the public route ([public page](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/public/%5Bid%5D/page.tsx#L45-L55)).
- **Inference:** The public share has no documented built-in CSV download. A
  viewer who can call the anonymous query endpoint could save or transform its
  JSON response, but that is not the same as a public export endpoint.
- **Unavailable:** The reviewed sources do not specify export quotas, export
  audit events for public viewers, or whether support can create an export
  without granting authenticated website access.

## Indexing, Robots, and Embedding

- **Source fact:** The dashboard `robots` metadata explicitly allows `/public/`
  while disallowing the rest of the dashboard path ([robots source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/robots.ts#L1-L10)).
- **Source fact:** The public route has no route-specific `noindex` metadata;
  the root dashboard metadata defaults to `index: true` and `follow: true`
  ([root metadata](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/layout.tsx#L38-L99), [public layout](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/public/layout.tsx#L1-L20)).
- **Source fact:** The `/public/:path*` CSP permits framing by Databuddy's own
  official domains and local development origins, rather than arbitrary
  origins ([dashboard security headers](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/next.config.ts#L118-L153)).
- **Inference:** The repository configuration is crawl-permissive for discovered
  public dashboard URLs and does not provide a noindex privacy boundary. CSP
  frame restrictions limit embedding origins, not who can read an enabled link.
- **Live observation:** A direct request to the deployed
  [`/robots.txt`](https://app.databuddy.cc/robots.txt) redirected to the login
  route in the research environment, so the effective production robots file
  was not available anonymously. The source configuration and deployed robots
  response should be reconciled before Cimi relies on either indexing behavior.
- **Unavailable:** The reviewed sources do not establish whether public website
  URLs are added to a sitemap, whether search engines are actively blocked by a
  deployment-layer header, or whether Databuddy guarantees that a public link
  will remain out of search indexes.

## Revocation, Rotation, and Lifecycle

- **Source fact:** Revocation is website-level: an authorized owner changes
  `isPublic` to `false`. The mutation invalidates the website caches after the
  database write ([toggle-public source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/rpc/src/routers/websites.ts#L738-L794)).
- **Source fact:** Public website metadata is cached for 600 seconds with a
  60-second stale window and stale-while-revalidate behavior; the invalidation
  path is best-effort and logs failures ([website cache](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/rpc/src/procedures/with-workspace.ts#L112-L126), [cache invalidation](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/services/src/websites.ts#L174-L207)).
- **Inference:** A successful toggle is intended to make the same URL private,
  but a cache or deployment failure can delay metadata visibility. The query
  route separately checks the website's public flag before executing public
  queries ([query access check](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/api/src/routes/query.ts#L518-L547)).
- **Source fact:** No public-share expiration or token-rotation operation is
  present in the reviewed sharing path. Re-enabling the boolean reuses the same
  website ID and URL ([settings source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/%28main%29/websites/%5Bid%5D/settings/general/page.tsx#L165-L172), [toggle-public source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/rpc/src/routers/websites.ts#L738-L766)).
- **Unavailable:** The reviewed sources do not document a grace period,
  revocation audit view for public viewers, cache purge SLA, or deletion of
  previously exported/copied public data after revocation.

## Rate Limits and Caching

- **Documentation fact:** The Query API limit for anonymous clients is 60
  requests per minute for both `POST /v1/query/compile` and `POST /v1/query`.
  Authenticated limits are 300 and 120 respectively ([rate-limit documentation](https://www.databuddy.cc/docs/api/rate-limits)).
- **Source fact:** Anonymous query identity is derived from the client IP, and
  the source clamps unauthenticated requests to a maximum of 60 per minute. A
  `429` response includes `Retry-After`, `X-RateLimit-*`, request ID, remaining,
  and reset data ([query rate limiter](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/api/src/routes/query.ts#L349-L404)).
- **Source fact:** Query execution also limits concurrent work to eight active
  queries per website in the API process. This is a concurrency guard, not an
  additional documented per-viewer quota ([per-website semaphore](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/api/src/routes/query.ts#L62-L93)).
- **Source fact:** Most simple query builders enable ClickHouse query caching;
  builders marked `noCache` disable it, and batch execution chooses the setting
  based on the requested builders ([query-cache settings](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/ai/src/query/simple-builder.ts#L28-L43), [batch execution](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/ai/src/query/batch-executor.ts#L523-L550)).
- **Documentation fact:** Databuddy recommends batching compatible parameters
  and caching historical results when appropriate ([rate-limit documentation](https://www.databuddy.cc/docs/api/rate-limits)).
- **Live observation:** The tested deployed public HTML response included
  `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, and
  no `X-Robots-Tag` header. This was observed for one public URL and is not a
  documented cache contract ([tested public URL](https://app.databuddy.cc/public/3ed1fce1-5a56-4cb6-a977-66864f6d18e3)).
- **Unavailable:** The reviewed sources do not state ClickHouse query-cache TTL,
  cache-key isolation guarantees for public data, public API response cache
  headers, or whether rate-limit identities are shared across NAT users beyond
  the documented client-IP implementation.

## Privacy Controls and Exposure Risks

- **Documentation fact:** Databuddy's privacy policy says visitor analytics are
  minimal, anonymized, aggregated, and do not identify individual users; it
  lists country and region as geographic data and says no names, email addresses,
  or other personal information are collected from website visitors ([privacy policy](https://www.databuddy.cc/privacy)).
- **Documentation fact:** Databuddy's Security page says allowed origins and
  allowed IP addresses control who can **send** analytics data. Those settings
  are collection controls, not viewer authorization for a public dashboard
  ([security documentation](https://www.databuddy.cc/docs/security)).
- **Documentation fact:** The event API warns customers not to track PII in
  event properties and says event properties are stored as JSON ([event API](https://www.databuddy.cc/docs/api/events)).
- **Source fact:** The current public query registry includes custom event
  property queries, error diagnostics, and city-level query names, even though
  the public URL UI only requests overview queries ([public query registry](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/packages/ai/src/query/builders/index.ts#L39-L97), [public overview requests](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35f3ab4c2f3/apps/dashboard/app/%28main%29/websites/%5Bid%5D/_components/tabs/overview-tab.tsx#L103-L124)).
- **Source and documentation inconsistency:** The current privacy policy says
  country and region, while the older official Data Policy describes stored city,
  region, country, and geoname data, and the current dashboard guide documents
  city-level analytics when available ([privacy policy](https://www.databuddy.cc/privacy), [Data Policy](https://www.databuddy.cc/data-policy), [dashboard guide](https://www.databuddy.cc/docs/dashboard)). The current source also marks `city` public-readable. Cimi should treat city exposure as unresolved rather than assuming the privacy policy's country/region wording is an enforced public-share rule.
- **Inference:** If a customer sends identifiers, secrets, account data, or
  sensitive stack/error content in custom events or error fields, the public
  query allowlist creates a potential disclosure path despite Databuddy's
  privacy-first policy. The vendor's PII warning reduces this risk only if the
  customer follows it; it is not a public-dashboard redaction control.
- **Unavailable:** The reviewed primary sources do not document viewer consent,
  viewer authentication, per-link audience restrictions, IP allowlisting for
  readers, public-view audit logs, public-view masking, minimum aggregation
  thresholds, or a way to disable individual public query families per website.

## Cimi Issue #8 Assessment

| Requirement             | Databuddy result in reviewed sources                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public/shared link      | Yes: website-level `/public/{websiteId}` link when `isPublic` is enabled.                                                                                                          |
| Token model             | No separate share token found; the stable website/client ID is in the URL.                                                                                                         |
| Open vs authenticated   | Documented as anyone-with-link; source allows anonymous read-only access for public websites. Live test site returned 401, so production state is not uniformly verified.          |
| Data scope              | Overview UI only, but the current anonymous API allowlist also includes custom events/properties, errors, web vitals, and city/region queries. Revenue is explicitly private.      |
| Filters and time ranges | Viewer-controlled date ranges, presets, granularity, pagination, and permitted filters through the normal query API.                                                               |
| Exports                 | Authenticated export procedure only; no public CSV/share export found. Public JSON query responses can be transformed by a caller.                                                 |
| Indexing                | Repository robots config allows `/public/` and public route has no explicit noindex; live robots endpoint redirected to login during the check.                                    |
| Revocation and rotation | Toggle `isPublic` off; cache invalidation follows. No share-token rotation, expiry, password, or recipient ACL found.                                                              |
| Rate limits and caching | Anonymous query limit is 60/minute per endpoint; backend ClickHouse query cache is enabled for most builders; website metadata has a 600-second cache with stale-while-revalidate. |
| Privacy controls        | Read-only and website-level on/off are present. Share-specific masking, suppression, audience, and per-family controls are unavailable in reviewed sources.                        |

For Cimi, Databuddy is a fit only if issue #8 accepts an open, bearer-like
website link and broad live query access behind a coarse website-level switch.
It is not evidenced as a fit for private recipient sharing, expiring links,
owner-fixed report snapshots, public export governance, or strong public-view
privacy isolation.

## Primary Sources

- [Databuddy dashboard guide](https://www.databuddy.cc/docs/dashboard)
- [Databuddy Query API](https://www.databuddy.cc/docs/api/query)
- [Databuddy Query API rate limits](https://www.databuddy.cc/docs/api/rate-limits)
- [Databuddy event API](https://www.databuddy.cc/docs/api/events)
- [Databuddy security and privacy documentation](https://www.databuddy.cc/docs/security)
- [Databuddy Privacy Policy](https://www.databuddy.cc/privacy)
- [Databuddy Data Policy](https://www.databuddy.cc/data-policy)
- [Official repository snapshot](https://github.com/databuddy-analytics/Databuddy/tree/d15fcb5dac3605746dd08a35f3ab4c2f3)
