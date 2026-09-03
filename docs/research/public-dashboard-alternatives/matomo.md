# Matomo Public Dashboard Access

Research for Cimi issue #8. Researched 2026-08-22 and written 2026-08-23. Sources are limited to Matomo's official documentation, developer documentation, and the `matomo-org/matomo` source repository.

## Version Context

- The developer documentation pages are labelled **v5**; FAQ pages may describe behavior across several releases. The exact Matomo release and configuration matter for access, privacy, and API behavior. [Reporting API](https://developer.matomo.org/guides/reporting-api) [Embedding requirements](https://matomo.org/faq/reports/requirements-for-embedding-matomo-reports/)
- Source references below use the moving [`5.x-dev` branch](https://github.com/matomo-org/matomo/tree/5.x-dev), inspected on 2026-08-22, not a pinned release. Cimi should verify the selected Matomo release before treating source-level behavior as contractual.
- Statements are documented facts unless marked **Inference**. An inference is a Cimi interpretation of the cited Matomo behavior, not a Matomo-defined concept.

## Bottom Line

Matomo can expose Site analytics without a Cimi Organization account, but its documented public mechanism is authorization of the built-in `anonymous` user for a specific Site. It is not a documented per-dashboard share-link system with a separate public identifier or expiry. Anyone who can reach the Matomo instance and the embedded report URL can use the reports allowed by that anonymous Site permission. [FAQ: anonymous access](https://matomo.org/faq/how-to/faq_20130/)

For private embedding, Matomo documents a separate user with `View` permission and a `token_auth` credential. That is appropriate for a controlled server-side or authenticated integration, not for a browser-visible public link: Matomo describes `token_auth` as equivalent to a password and says it should not be shared. [Embedding requirements](https://matomo.org/faq/reports/requirements-for-embedding-matomo-reports/) [Authentication in depth](https://developer.matomo.org/guides/authentication-in-depth)

## Access Paths

| Access path             | Public identifier or credential                                                                          | Scope                                                                                                 | Revocation and expiry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous Site access   | Matomo instance URL plus a report/widget URL; no per-link secret                                         | The Sites and reports granted to the built-in `anonymous` user                                        | Remove that user's `View` access, or change it to `No access`; the documented control is Site/user-level rather than link-level. [Anonymous access FAQ](https://matomo.org/faq/how-to/faq_20130/)                                                                                                                                                                                                                                                                                                                     |
| Public embedded widget  | Widget iframe URL, typically including `idSite`, report module/action, period, date, and display options | The report and Site permitted to the request's Matomo user; anonymous embedding uses anonymous access | Changing the Site permission affects all anonymous links. The embedding documentation does not specify a dashboard-specific expiry or revocation token. [Embedding a report](https://matomo.org/faq/reports/embed-a-matomo-report-in-a-html-page/)                                                                                                                                                                                                                                                                    |
| Private embedded report | Dedicated Matomo user with `View` permission plus `token_auth`                                           | The Sites allowed to that user; the token authenticates the API/widget request                        | Revoke the user/token or change its permissions. Matomo's token-management UI supports app-token expiration and deletion, but no documented per-dashboard share-link lifecycle was found. [Embedding requirements](https://matomo.org/faq/reports/requirements-for-embedding-matomo-reports/) [UsersManager controller](https://github.com/matomo-org/matomo/blob/5.x-dev/plugins/UsersManager/Controller.php) [UsersManager model](https://github.com/matomo-org/matomo/blob/5.x-dev/plugins/UsersManager/Model.php) |

**Inference:** the public boundary is the Matomo permission assigned to `anonymous`, not a Cimi-owned dashboard identifier. Cimi would need a proxy or its own access layer if it requires independently revocable public shares.

## Embedding and Dashboard Shape

- Matomo documents embedding individual reports and a full dashboard through `Platform > Widgets`. The generated iframe/widget URL can select a Site, period, date, report module/action, and presentation options such as `disableLink`, `viewDataTable`, and `show_footer`. [Embed a Matomo report](https://matomo.org/faq/reports/embed-a-matomo-report-in-a-html-page/)
- The embedding requirements distinguish public and private embedding: public websites use anonymous access; private reports use a dedicated user with `View` access and `token_auth`. The private user must not have Write or Administration access. [Embedding requirements](https://matomo.org/faq/reports/requirements-for-embedding-matomo-reports/)
- Anonymous dashboard requests use the default dashboard in the inspected source. Custom user dashboards are loaded only for non-anonymous users. [Dashboard API](https://github.com/matomo-org/matomo/blob/5.x-dev/plugins/Dashboard/API.php) [Dashboard source](https://github.com/matomo-org/matomo/blob/5.x-dev/plugins/Dashboard/Dashboard.php)
- The inspected documentation describes report/widget URLs and Matomo user permissions; it does not describe a separate, signed, per-dashboard public token. **Unavailable:** whether a particular deployment adds such a mechanism through a plugin or proxy.

## Authentication and Data Scope

- Granting `View` to `anonymous` makes reports available to anyone with the Matomo link for the permitted Site. Matomo's documented FAQ says access is restricted by Site permissions, so enabling one Site does not inherently grant all Sites. [Anonymous access FAQ](https://matomo.org/faq/how-to/faq_20130/)
- A `View` user can query the reports permitted by that user's Site access. The Reporting API accepts Site, date, period, segment, format, and result-filter parameters, including `filter_limit`. [Reporting API](https://developer.matomo.org/guides/reporting-api)
- **Inference:** filters narrow or slice data but do not create a new authorization boundary. A public report must therefore be reviewed for every exposed dimension and selectable filter, not only for its default date range.
- The anonymous dashboard source path returns the default dashboard rather than a user's custom dashboard. **Inference:** publishing the default dashboard can expose any report placed there for the anonymous user's permitted Site, so default-dashboard configuration becomes part of the public data contract. [Dashboard API](https://github.com/matomo-org/matomo/blob/5.x-dev/plugins/Dashboard/API.php)

## Filters and Exports

- The Reporting API supports report parameters for `idSite`, `period`, `date`, segments, sorting/filtering, and result limits. This provides date and audience slicing wherever the selected report and user's permission support those parameters. [Reporting API](https://developer.matomo.org/guides/reporting-api)
- API responses can be requested in formats including JSON, XML, CSV, and other documented export formats. A public anonymous request can receive those formats if the requested report is available to anonymous access. [Reporting API](https://developer.matomo.org/guides/reporting-api)
- `token_auth` is an API authentication credential equivalent to a password. It should not be embedded in an untrusted public page or distributed as a public share token. [Authentication in depth](https://developer.matomo.org/guides/authentication-in-depth)
- **Inference:** a Cimi public page should avoid exposing a `token_auth` value in HTML, JavaScript, browser history, referrers, or copied iframe URLs. If private Matomo data is required, Cimi needs an authenticated server-side boundary or a Matomo-specific authenticated session.

## Indexing and Discovery

- The Matomo repository's `robots.txt` disallows the root path for general crawlers while making exceptions for tracking and static paths. [Matomo `robots.txt`](https://github.com/matomo-org/matomo/blob/5.x-dev/robots.txt)
- The inspected iframe and layout templates contain no observed `noindex` meta tag. [Widget iframe template](https://raw.githubusercontent.com/matomo-org/matomo/5.x-dev/plugins/Widgetize/templates/iframe.twig) [Morpheus layout](https://raw.githubusercontent.com/matomo-org/matomo/5.x-dev/plugins/Morpheus/templates/layout.twig)
- **Unavailable:** no primary-source guarantee was found that a public widget URL is excluded from every search engine or that its report data cannot be indexed. `robots.txt` is deployment/version/crawler dependent and is not an authorization control.
- **Inference:** if public links must not be discoverable, Cimi should use its own `noindex`/access policy and avoid relying on Matomo's repository `robots.txt`. Public access should still be considered public even if ordinary crawlers are discouraged.

## Revocation and Lifecycle

- Anonymous access is revoked by removing the built-in `anonymous` user's Site `View` permission or changing it to `No access`. This is a shared switch: it affects every public widget/report using that anonymous Site access. [Anonymous access FAQ](https://matomo.org/faq/how-to/faq_20130/)
- Private access can be revoked by changing the dedicated user's permissions or revoking/deleting its credential. Matomo's UsersManager source includes token expiry and deletion behavior for app-specific tokens. [UsersManager controller](https://github.com/matomo-org/matomo/blob/5.x-dev/plugins/UsersManager/Controller.php) [UsersManager model](https://github.com/matomo-org/matomo/blob/5.x-dev/plugins/UsersManager/Model.php)
- **Unavailable:** the inspected public embedding documentation does not define a per-link expiration, one-link revocation, token rotation policy, or audit contract for anonymous widget URLs.
- **Inference:** Cimi's required share lifecycle should not be modelled as a Matomo anonymous permission if different recipients need independent expiry or revocation. A Cimi-controlled proxy can provide that boundary while keeping Matomo private.

## Rate Limits and Caching

- Matomo Cloud documents per-IP limits of `2,000 requests per 10 minutes` or `350 per minute` for non-tracking/API/dashboard/UI requests, `200 per minute` for Live requests, and `500 per five minutes` for Transitions requests. It also documents a raw-data concurrency limit of eight requests per subdomain/account. [Matomo Cloud API usage limits](https://matomo.org/faq/troubleshooting/matomo-cloud-api-usage-limits/)
- The source and changelog document a limit for `API.getBulkRequest`: 10 requests for anonymous users without View access and 50 with View access, subject to the configured `API_bulk_request_limit`. This is a bulk-request limit, not a universal public-dashboard traffic limit. [API source](https://github.com/matomo-org/matomo/blob/5.x-dev/plugins/API/API.php) [Changelog](https://github.com/matomo-org/matomo/blob/5.x-dev/CHANGELOG.md)
- **Unavailable:** no universal On-Premise request-per-IP limit or public-dashboard SLA was found in the inspected primary sources. On-Premise limits may instead come from Matomo configuration, a reverse proxy, PHP/web-server settings, or infrastructure.
- **Unavailable:** no documented cache-control, freshness, stale-data, or cache-key contract was found for public embedded dashboards. Matomo's archive/report generation is not evidence of a Cimi-consumable public caching guarantee.
- **Inference:** Cimi should rate-limit and cache at its own boundary if a public dashboard is expected to withstand repeated or automated requests. It should define an explicit freshness target rather than assume Matomo's internal report cache provides one.

## Privacy and Data Exposure

- Anonymous users cannot access Visitor Profiles; Matomo hides visitor IP addresses and Visitor IDs from the anonymous user's UI/API report responses. [Anonymous access FAQ](https://matomo.org/faq/how-to/faq_20130/)
- The anonymous-user configuration `anonymous_user_enable_use_segments_API` controls whether anonymous users may use the Segments API; the inspected `5.x-dev` default is enabled. [Global configuration](https://github.com/matomo-org/matomo/blob/5.x-dev/config/global.ini.php) [Settings source](https://github.com/matomo-org/matomo/blob/5.x-dev/core/SettingsPiwik.php)
- Anonymous restrictions do not mean that all analytics are anonymous or that every report is safe to publish. Aggregate totals, dimensions, campaigns, locations, devices, and other permitted report data may still disclose sensitive audience characteristics depending on Site configuration and report permissions. **Inference:** a report-by-report disclosure review is required.
- Matomo's privacy documentation covers IP anonymization, opt-out, data retention, raw-data deletion, and the sensitivity of Live visitor data. Public embedding must be evaluated against Cimi's lawful-basis, minimization, retention, and re-identification requirements. [Matomo privacy documentation](https://github.com/matomo-org/matomo/blob/5.x-dev/PRIVACY.md)

## Implications for Cimi

- Use anonymous Site access only for intentionally public, low-sensitivity aggregate analytics where one shared revocation switch is acceptable.
- Do not place a Matomo `token_auth` credential in a public client, public iframe URL, or public JavaScript bundle.
- Treat widget parameters and API filters as presentation/query controls, not authorization. Limit the exposed Site, reports, dimensions, date range, and exports deliberately.
- If Cimi needs per-recipient links, expiration, independent revocation, audit logs, or a stable public-share identifier, keep Matomo private and put a Cimi-controlled access/proxy layer in front of a narrowly scoped Matomo View integration. **Inference:** this is an architectural consequence of Matomo's documented Site/user permission model.
- Add deployment controls for crawler behavior, response caching, rate limiting, and security headers; none of those controls is established as a complete Matomo public-dashboard contract by the inspected sources.

## Open Questions and Verification

- Which pinned Matomo release and deployment mode (Cloud or On-Premise) will Cimi support?
- Is a whole-Site public disclosure acceptable, or must Cimi revoke individual links independently?
- Which reports, dimensions, segments, exports, and historical date ranges are safe to expose?
- Does the deployment or a plugin add a share-link, cache, rate-limit, or indexing policy not present in the official core documentation?
- Can the team verify the chosen configuration with an integration test covering anonymous access, permission revocation, API formats, segments, crawler headers, cache freshness, and concurrent requests?
