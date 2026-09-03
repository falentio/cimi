# PostHog: Public Dashboard Disclosure and Access

Research for [Cimi issue #8](https://github.com/falentio/cimi/issues/8),
"Define public dashboard disclosure and access".

- Investigated: 2026-08-23
- Source scope: official PostHog documentation and the official
  `PostHog/posthog` source repository
- Purpose: document PostHog behavior; the Cimi implications below are
  recommendations inferred from that behavior, not PostHog guarantees

## Executive Summary

PostHog public sharing is a bearer-link capability. A dashboard or insight can
be viewed without PostHog Organization membership or a PostHog login by anyone
who has the public URL. PostHog describes this as sharing the data without
sharing the entire account. ([sharing and embedding](https://posthog.com/docs/product-analytics/sharing))

The URL token is the primary credential. It is generated as a random URL-safe
value and is checked against an enabled, unexpired sharing configuration. The
public viewer is represented internally as an anonymous `SharedLinkUser`, not
as a PostHog member with normal project permissions. Shared queries execute
without warehouse access control, so a published dashboard must be treated as
an intentional disclosure of every result its configured tiles render.
([sharing configuration](https://github.com/PostHog/posthog/blob/master/posthog/models/sharing_configuration.py),
[shared viewer](https://github.com/PostHog/posthog/blob/master/posthog/shared_link_user.py),
[sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py))

PostHog has useful controls: disable sharing, rotate the URL, require one or
more passwords, revoke individual passwords, and disable public sharing for an
Organization. Rotation leaves the old URL valid for a five-minute grace period.
Password protection adds a 24-hour JWT-backed session, but it does not turn the
resource into a member-only dashboard.
([dashboard sharing API](https://posthog.com/docs/api/dashboards),
[sharing configuration](https://github.com/PostHog/posthog/blob/master/posthog/models/sharing_configuration.py),
[web settings](https://github.com/PostHog/posthog/blob/master/posthog/settings/web.py))

For Cimi, PostHog public sharing should be modeled as a separate, explicitly
approved disclosure surface. It is suitable only for data that Cimi is willing
to expose to an unauthenticated bearer-link holder. PostHog's warehouse access
controls, robots directives, and dashboard UI restrictions should not be
treated as substitutes for Cimi's own disclosure policy.

## Capability Matrix

| Question                                  | PostHog behavior                                                                                                                                        | Evidence and confidence                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Organization membership required?         | No for a public dashboard, insight, or embed link.                                                                                                      | Confirmed by official sharing docs and the public view's auth classes.                   |
| Main identifier                           | A path access token in `/shared_dashboard/<token>`, `/shared/<token>`, or `/embedded/<token>`.                                                          | Confirmed in `posthog/urls.py`.                                                          |
| Credential type                           | Bearer URL; possession is sufficient unless password protection is enabled.                                                                             | Confirmed by docs and `SharingViewerPageViewSet`.                                        |
| Data scope                                | The shared resource and the results rendered from its configured tiles. Not an unrestricted Organization session.                                       | Confirmed for resource routing; the disclosure consequence is a Cimi security inference. |
| Viewer-specific RBAC                      | No normal member/RBAC identity for the public page.                                                                                                     | Confirmed by `SharedLinkUser` and shared-query code.                                     |
| Viewer filters                            | Public dashboard filter controls are disabled; shared API filter and variable overrides are ignored.                                                    | Confirmed in frontend logic, OpenAPI semantics, and security tests.                      |
| Date range changes                        | External viewers cannot change an insight's date range; public dashboard controls are disabled.                                                         | Confirmed by docs and frontend logic.                                                    |
| Disable/revoke                            | Disable the share, rotate the token, or disable an individual password.                                                                                 | Confirmed by sharing API and model behavior.                                             |
| Token rotation                            | New token is issued; old active configurations expire after five minutes.                                                                               | Confirmed in `rotate_access_token()` and settings.                                       |
| Password session                          | Password success creates an HTTP-only cookie/JWT valid for 24 hours.                                                                                    | Confirmed in `posthog/api/sharing.py` and `sharing_configuration.py`.                    |
| Indexing                                  | Self-hosted robots blocks everything; Cloud robots blocks `/shared/` and `/shared_dashboard/`.                                                          | Confirmed in `posthog/views.py`; robots is advisory, not access control.                 |
| Image export                              | Shared resources have a `.png` response path; PostHog also has a purpose-scoped exporter route.                                                         | Confirmed in `posthog/api/sharing.py` and sharing docs.                                  |
| CSV/JSON export from a normal public link | Not established by the sources inspected.                                                                                                               | Unknown; do not assume it is unavailable without an integration test.                    |
| Request throttling                        | Shared view has burst, sustained, and shared-password-volume throttles. Wrong-password submissions have an additional ten-per-minute per-link throttle. | Confirmed in source and the official PostHog rate-limit change.                          |
| Query refresh                             | Shared and embedded dashboards auto-refresh every 30 minutes while visible; shared execution uses cache/staleness rules.                                | Confirmed by docs and query-runner source.                                               |

## Access Model

### Public routes

The Django URL configuration maps these routes to
`SharingViewerPageViewSet`:

- `/shared_dashboard/<access_token>`
- `/shared/<access_token>`
- `/embedded/<access_token>`
- `/exporter/<access_token>`

The view explicitly uses only sharing-specific authentication and no normal
PostHog permission classes. The path-token lookup requires an enabled
configuration whose `expires_at` is null or in the future. A disabled or expired
configuration therefore returns the custom not-found response rather than
rendering the resource.
([routes](https://github.com/PostHog/posthog/blob/master/posthog/urls.py),
[sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py),
[sharing configuration](https://github.com/PostHog/posthog/blob/master/posthog/models/sharing_configuration.py))

The sharing API also supports a `sharing_access_token` query parameter for
GET/HEAD API requests. It creates a `SharedLinkUser` and is scoped to the
sharing configuration rather than providing a general-purpose project API
credential. The source security tests verify that a sharing token cannot use
`filters_override` or `variables_override` to broaden a shared insight, and
cannot read an unrelated insight outside the shared dashboard.
([sharing authentication](https://github.com/PostHog/posthog/blob/master/posthog/auth.py),
[sharing security tests](https://github.com/PostHog/posthog/blob/master/posthog/api/test/test_sharing_access_token_security.py))

### Token properties

`SharingConfiguration.access_token` is unique and defaults to
`secrets.token_urlsafe(22)`. The token is placed directly in the public URL, so
it should be handled as a bearer credential even though it is not a PostHog
management API key. ([sharing configuration](https://github.com/PostHog/posthog/blob/master/posthog/models/sharing_configuration.py))

The normal public link does not ask for a user identity. The shared viewer has
no readable system-table scopes and uses a synthetic distinct ID of the form
`shared-viewer-<team_id>` for internal query tagging. This is not a Cimi
visitor identity and should not be interpreted as viewer authentication.
([shared viewer](https://github.com/PostHog/posthog/blob/master/posthog/shared_link_user.py))

## Data Disclosure

### What is exposed

The disclosure boundary is the resource named by the sharing configuration:

- A dashboard share is tied to the dashboard and its tiles.
- An insight share is tied to that insight.
- The shared page can also expose configured text, visualization, and query
  results rendered by the resource.

The model derives connected insight IDs from the dashboard's non-deleted tiles,
rather than granting the viewer general access to all project insights. This is
a resource boundary, not a viewer-specific data policy. Anyone holding the
link should be assumed able to see every value that the shared page renders and
to inspect the browser's responses for that page. The latter is a security
inference from serving data to an unauthenticated browser, not an explicit
PostHog promise. ([sharing configuration](https://github.com/PostHog/posthog/blob/master/posthog/models/sharing_configuration.py))

### Warehouse and access-controlled data

PostHog's sharing view states that shared queries execute without warehouse
access control. To prevent publishing from becoming an access-escalation path,
the sharing API checks the publisher's access to the data used by the artifact
when enabling a share. This protects the enable operation, but after publication
the viewer is still anonymous and does not receive per-viewer warehouse RBAC.
([sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py),
[access control](https://posthog.com/docs/settings/access-control))

For Cimi, this means a dashboard containing a query over sensitive or
access-controlled Site data must be rejected by Cimi's disclosure policy before
PostHog sharing is enabled. The PostHog publisher check is not sufficient as a
long-term policy boundary because it does not make each external viewer a
member.

## Filtering and Time Ranges

PostHog's sharing documentation says an externally shared insight is displayed
as configured and that external users cannot change its visualization or date
range. ([sharing and embedding](https://posthog.com/docs/product-analytics/sharing))

The current dashboard frontend excludes `DashboardPlacement.Public` from the
dashboard filter controls. ([dashboard logic](https://github.com/PostHog/posthog/blob/0622fb80/frontend/src/scenes/dashboard/dashboardLogic.tsx),
[dashboard filters](https://github.com/PostHog/posthog/blob/0622fb80/frontend/src/scenes/dashboard/DashboardFilters.tsx))

At the API layer, the shared OpenAPI parameter definitions state that
`filters_override` and `variables_override` are ignored when accessed through a
sharing token. The security tests specifically attempt to replace a seven-day
date range with a one-year range and to change a HogQL variable; the persisted
values remain in effect. ([override semantics](https://github.com/PostHog/posthog/blob/master/posthog/api/openapi_parameters.py),
[sharing security tests](https://github.com/PostHog/posthog/blob/0622fb80/posthog/api/test/test_sharing_access_token_security.py))

This does not make a broad saved query safe. It only prevents the viewer from
using these documented override paths to broaden or alter it. Cimi must review
the saved query and its returned fields before publication.

## Revocation and Credential Lifecycle

### Disable sharing

An authorized publisher can set `enabled` to false. The public route checks the
flag before rendering, so the existing URL stops serving the shared resource.
The sharing API logs enable and disable activity for dashboards and insights.
([sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py),
[dashboard sharing API](https://posthog.com/docs/api/dashboards))

### Rotate the access token

The dashboard and insight APIs expose a sharing refresh operation. Rotation
creates a new configuration and expires active old configurations after
`SHARING_TOKEN_GRACE_PERIOD_SECONDS`, currently five minutes. The old URL is
therefore not revoked instantaneously. Password hashes and share settings are
copied to the new configuration when password protection is enabled.
([sharing API](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py),
[sharing configuration](https://github.com/PostHog/posthog/blob/master/posthog/models/sharing_configuration.py),
[web settings](https://github.com/PostHog/posthog/blob/master/posthog/settings/web.py))

### Passwords

Password protection is optional and requires PostHog's Access Control feature.
The API can create multiple active passwords, each with a note and an owner,
and can deactivate one password without removing the share. A supplied password
must be at least eight characters unless PostHog generates a random one.
([sharing API](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py),
[share password model](https://github.com/PostHog/posthog/blob/master/posthog/models/share_password.py))

After a successful password check, PostHog creates a JWT scoped to that share
and password, with a 24-hour expiry, and stores it in an HTTP-only cookie. The
password itself is returned only when it is created. Authentication checks that
the referenced password is still active, so deactivating a password also stops
future requests using JWTs tied to that password.
([sharing configuration](https://github.com/PostHog/posthog/blob/master/posthog/models/sharing_configuration.py),
[sharing authentication](https://github.com/PostHog/posthog/blob/master/posthog/auth.py),
[sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py))

### Organization kill switch

When the Organization Security Settings feature is enabled and
`allow_publicly_shared_resources` is false, the public viewer and sharing-token
authentication fail closed. The share rows may remain enabled, but the public
surface is blocked until the Organization setting permits it again.
([organization model](https://github.com/PostHog/posthog/blob/master/posthog/models/organization.py),
[sharing authentication](https://github.com/PostHog/posthog/blob/master/posthog/auth.py),
[sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py))

## Indexing and Embedding

PostHog's `robots.txt` behavior differs by deployment:

- Self-hosted instances return `Disallow: /` for all user agents.
- Cloud instances disallow `/shared_dashboard/` and `/shared/`.
- Cloud instances also disallow query URLs containing values such as `token=`
  and `sharing_access_token=`.
- The inspected Cloud directives do not list `/embedded/`; whether additional
  response headers or crawler behavior prevent indexing of embedded pages was
  not established.

Robots directives are a crawler instruction, not an authorization mechanism.
Anyone with the URL can still request a permitted public route. ([robots view](https://github.com/PostHog/posthog/blob/723d2a3f/posthog/views.py))

PostHog documents iframe embedding through `/embedded/<token>`. An embed is the
same fundamental disclosure model as a public link: the containing site does
not supply a PostHog member identity merely by embedding the URL. ([sharing and embedding](https://posthog.com/docs/product-analytics/sharing))

## Export and Refresh Behavior

### Image export

The sharing view recognizes a shared resource URL ending in `.png`, creates or
retrieves an exported asset, and returns the image content. PostHog's product
documentation also describes PNG export for insights. ([sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py),
[trends export](https://posthog.com/docs/product-analytics/trends/overview))

The source also has an `/exporter` surface for purpose-scoped JWT export assets.
Those assets distinguish render-purpose and subscription-delivery-purpose
tokens and restrict where each token can be used. This is separate from the
ordinary public dashboard viewing contract. ([sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py),
[routes](https://github.com/PostHog/posthog/blob/master/posthog/urls.py))

I did not find primary-source evidence that a normal dashboard bearer URL
offers CSV or JSON downloads to an unauthenticated viewer. That behavior is
therefore **unknown**, not a security guarantee. It should be tested against
the exact PostHog version and deployment used by Cimi before export is included
in a capability decision.

### Refresh and caching

Shared and embedded dashboards auto-refresh every 30 minutes while the page is
open. Refresh pauses while the tab is inactive and resumes when it becomes
visible. If data is more than 30 minutes old when the page opens or becomes
visible, PostHog triggers a one-time full refresh. ([sharing and embedding](https://posthog.com/docs/product-analytics/sharing))

The query runner maps shared requests onto cache-oriented execution modes. A
forced blocking refresh is converted to blocking-if-stale using the dashboard
auto-refresh interval as a staleness window; the source calls this a best-effort
throttle, not a hard rate limit. ([query runner](https://github.com/PostHog/posthog/blob/master/posthog/hogql_queries/query_runner.py))

### Rate limiting

`SharingViewerPageViewSet` declares `BurstRateThrottle`,
`SustainedRateThrottle`, and `SharePasswordVolumeThrottle`. Password unlock
attempts are additionally guarded by `SharePasswordThrottle`; the official
PostHog change describes that limiter as ten attempts per minute keyed by the
share link, not the caller. A link-wide budget means an attacker who knows the
URL can temporarily consume the password-attempt budget for all viewers.
([sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py),
[rate-limit implementation](https://github.com/PostHog/posthog/blob/0622fb80/posthog/rate_limit.py),
[official rate-limit change](https://github.com/PostHog/posthog/pull/74435))

The exact burst and sustained values may depend on PostHog defaults and
deployment settings. Cimi should not promise a numeric public-dashboard
throughput based only on the shared-page cache interval.

## Privacy and Audit Behavior

The public page is rendered with no current PostHog user and with anonymous app
context. Query analytics use a shared-viewer synthetic identity. This prevents
the external viewer from being treated as a PostHog member, but it does not
anonymize the dashboard's business data. ([sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py),
[shared viewer](https://github.com/PostHog/posthog/blob/master/posthog/shared_link_user.py))

Password attempts are activity-logged. The source records the share token
suffix, client IP, success status, and, for successful attempts, the password
entry ID and note. This is an operator audit trail; it is not a replacement for
Cimi consent, retention, or data classification. ([sharing view](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py))

The public URL itself is sensitive because it is a bearer credential. The
inspected PostHog sources document robots directives and token rotation, but do
not establish that URLs are absent from browser history, reverse-proxy logs,
referrer data, screenshots, or third-party monitoring. Those leakage paths are
therefore a Cimi deployment and policy concern.

## Cimi Implications

These are recommendations for Cimi, inferred from the evidence above:

- Treat a public PostHog URL as a bearer credential, not as a discoverable
  report identifier.
- Keep Cimi's disclosure decision outside PostHog. Require an explicit
  allowlist of Site metrics and fields before enabling public sharing.
- Reject public sharing for dashboards whose tiles can reveal person-level,
  session-level, account-level, or otherwise restricted data unless the Cimi
  policy explicitly permits that disclosure.
- Do not rely on PostHog warehouse access controls to protect external viewers;
  shared queries run without viewer-specific warehouse RBAC.
- Use password protection for a second access factor when a bearer URL alone is
  not acceptable, but still treat the password-protected resource as external
  disclosure. Password protection does not add Organization membership.
- Store the share lifecycle in Cimi as at least `enabled`, `disabled`, and
  `rotating`, and account for the five-minute old-token rotation window.
- Provide an incident operation that disables the share first, then rotates the
  token if the URL may have been copied. Rotation alone is not instantaneous.
- Treat `robots.txt` as a discoverability reduction only. It is not a privacy
  boundary.
- Decide export separately from live viewing. PNG is evidenced; CSV/JSON export
  from a normal public URL still requires version-specific validation.
- Document the refresh and throttle behavior for consumers who may embed a
  dashboard for many viewers. Cached results and per-link password throttling
  affect freshness and availability differently.

## Open Questions and Verification Gaps

The following were not established conclusively from the official sources
inspected:

- Whether `/embedded/<token>` receives `X-Robots-Tag: noindex` or equivalent
  protection beyond the listed `robots.txt` rules.
- Whether the exact PostHog version deployed by Cimi permits CSV, JSON, or other
  raw-data export through a public dashboard URL.
- The effective burst and sustained throttle numbers for a particular Cloud or
  self-hosted deployment.
- Whether a dashboard edit, deleted tile, or changed query is visible
  immediately through every shared response or waits for a cache refresh.
- Which headers, logs, referrer policies, or CDN behaviors apply to the Cimi
  deployment and could leak a bearer URL.
- Whether any product-specific tile type has a broader shared-data contract
  than the dashboard and insight paths reviewed here.

## Primary Sources

- [PostHog sharing and embedding documentation](https://posthog.com/docs/product-analytics/sharing)
- [PostHog dashboard sharing API](https://posthog.com/docs/api/dashboards)
- [PostHog access-control documentation](https://posthog.com/docs/settings/access-control)
- [`posthog/api/sharing.py`](https://github.com/PostHog/posthog/blob/master/posthog/api/sharing.py)
- [`posthog/auth.py`](https://github.com/PostHog/posthog/blob/master/posthog/auth.py)
- [`posthog/models/sharing_configuration.py`](https://github.com/PostHog/posthog/blob/master/posthog/models/sharing_configuration.py)
- [`posthog/models/share_password.py`](https://github.com/PostHog/posthog/blob/master/posthog/models/share_password.py)
- [`posthog/shared_link_user.py`](https://github.com/PostHog/posthog/blob/master/posthog/shared_link_user.py)
- [`posthog/urls.py`](https://github.com/PostHog/posthog/blob/master/posthog/urls.py)
- [`posthog/views.py`](https://github.com/PostHog/posthog/blob/723d2a3f/posthog/views.py)
- [`posthog/api/openapi_parameters.py`](https://github.com/PostHog/posthog/blob/master/posthog/api/openapi_parameters.py)
- [`posthog/api/test/test_sharing_access_token_security.py`](https://github.com/PostHog/posthog/blob/0622fb80/posthog/api/test/test_sharing_access_token_security.py)
- [`posthog/hogql_queries/query_runner.py`](https://github.com/PostHog/posthog/blob/master/posthog/hogql_queries/query_runner.py)
- [`posthog/rate_limit.py`](https://github.com/PostHog/posthog/blob/0622fb80/posthog/rate_limit.py)
- [PostHog public-share rate-limit change](https://github.com/PostHog/posthog/pull/74435)
