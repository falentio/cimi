# Simple Analytics: Canonical Query Semantics Research

Sources were reviewed on 2026-08-23. This report uses Simple Analytics' official documentation, official documentation repository, official public scripts repository, and the official public Stats API. Claims based on the live API are marked **Observed**; they are point-in-time behavior, not a versioned contract.

## Executive finding

Simple Analytics exposes two different query models:

- **Stats API:** aggregate dashboard statistics. Its primary measures are pageviews, visitors, histograms, dimension lists, event totals, and median seconds on page ([Stats API](https://docs.simpleanalytics.com/api/stats)).
- **Export API:** raw, unsampled pageview/event datapoints with caller-selected fields ([Export API](https://docs.simpleanalytics.com/api/export-data-points)).

The most important semantic difference for Cimi is that `visitors` is not a distinct-person count. Simple Analytics explicitly calls it **unique pageviews**, detected from referrer behavior, and says it does not track individuals across sessions ([unique visits](https://docs.simpleanalytics.com/explained/unique-visits)).

## Time windows and ranges

**Documented:**

- Stats API `start` and `end` use `YYYY-MM-DD`; defaults are one month ago and today. `timezone` is accepted, and Stats API defaults to the website timezone ([Stats API](https://docs.simpleanalytics.com/api/stats), [API helpers](https://docs.simpleanalytics.com/api/helpers)).
- Date placeholders include `today`, `yesterday`, and expressions such as `today-1d`. The docs use `start=today-30d&end=yesterday` for the last 30 days and `start=today&end=today` for only today ([API helpers](https://docs.simpleanalytics.com/api/helpers)).
- Export APIs default to UTC, unlike Stats API. The docs recommend always specifying `timezone` when consistent results matter ([API helpers](https://docs.simpleanalytics.com/api/helpers)).
- Export supports daily date ranges. Hourly export requires both endpoints to include `YYYY-MM-DDTHH`, the dates to be the same day, hours `00` through `23`, and the specified timezone ([Export API](https://docs.simpleanalytics.com/api/export-data-points)).

**Observed:** an official public Stats API response normalizes a daily query to timestamp boundaries such as `00:00:00.000Z` and `23:59:59.999Z` and returns the requested histogram dates ([live Stats API response](https://simpleanalytics.com/simpleanalytics.com.json?version=6&fields=histogram&start=today-7d&end=today&timezone=UTC&interval=day&info=false)).

**Unknown:** the documentation does not state whether the conceptual `end` date is inclusive or exclusive, how daylight-saving transitions affect date-to-timestamp conversion, or whether all Stats and Export endpoints apply exactly the same boundary rule. Cimi should specify this independently rather than infer it from the date examples.

## Granularity and buckets

- Stats histogram `interval` accepts `hour`, `day`, `week`, `month`, or `year`; `hour` was added in API version 6 ([Stats API](https://docs.simpleanalytics.com/api/stats)).
- Daily buckets contain `date`, `pageviews`, and `visitors`. **Observed:** hourly buckets additionally contain `hour`; weekly buckets additionally contain `year` and `week` in the official public response ([hourly response](https://simpleanalytics.com/simpleanalytics.com.json?version=6&fields=histogram&start=today-2d&end=today&timezone=UTC&interval=hour&info=false), [weekly response](https://simpleanalytics.com/simpleanalytics.com.json?version=6&fields=histogram&start=today-7d&end=today&timezone=UTC&interval=week&info=false)).
- Export is not bucketed: it returns raw datapoints with timestamps such as `added_unix` or `added_iso`. Its hourly mode narrows the extraction window; it does not return hourly aggregate buckets ([Export API](https://docs.simpleanalytics.com/api/export-data-points)).
- The Stats API describes its histogram as exactly the same as the dashboard chart ([Stats API](https://docs.simpleanalytics.com/api/stats)).

**Unknown:** bucket alignment rules for weeks, months, and years; whether empty buckets are always emitted; and whether the range is clipped before or after bucket alignment are not specified in the reviewed sources.

## Metrics and unique counts

- `pageviews` is documented as the total pageviews in the specified period. `visitors` is documented as the total **unique pageviews** in the specified period ([Stats API](https://docs.simpleanalytics.com/api/stats)).
- A pageview is unique when it has no referrer or an external referrer hostname. It is not unique for same-site navigation, reload, or browser back/forward. For SPAs, only the initial pageview uses referrer-based uniqueness; later virtual navigations are non-unique ([unique visits](https://docs.simpleanalytics.com/explained/unique-visits)).
- The official scripts source implements this as a boolean pageview property based on push-state/navigation and same-site referrer checks, corroborating the docs ([official source](https://github.com/simpleanalytics/scripts/blob/main/src/default.js); cached source snapshot: [`src/default.js`](../vendor/simple-analytics/src/default.js)).
- `seconds_on_page` is the **median**, not average, of recorded time-on-page values. Values under five seconds are excluded from this metric but remain in other metrics; bots are excluded from stats ([Stats API](https://docs.simpleanalytics.com/api/stats), [time on page](https://docs.simpleanalytics.com/explained/time-on-page)).
- Events are counted by name. `events=*` returns all events but is limited to 1,000 events ([Stats API](https://docs.simpleanalytics.com/api/stats)).
- Raw exports expose `is_unique`, `is_robot`, `duration_seconds`, and event/page-load linkage fields, so raw consumers can apply different analysis rules than the aggregate Stats API ([Export API](https://docs.simpleanalytics.com/api/export-data-points)).

**Cimi implication:** do not implement `visitors` as `COUNT(DISTINCT visitor_id)`. The documented Simple Analytics equivalent is a count of datapoints marked unique, with no durable visitor identity.

## Filters and dimensions

Stats API dimensions include pages, countries, normalized referrers, UTM sources/mediums/campaigns/contents/terms, browser names, OS names, device types, and events ([Stats API](https://docs.simpleanalytics.com/api/stats)). The API filters include:

- Exact filters for page, country, referrer, UTM values, browser, OS, and device type.
- `pages` as a comma-separated list; trailing `*` matches paths beginning with a value.
- A single leading-and-trailing path wildcard for contains searches. This requires an API key even for public websites, at least 12 non-slash characters between wildcards, only `pageviews`, `visitors`, and/or `histogram`, and no events. Contains searches are rate limited and return `Retry-After` on `429` ([Stats API](https://docs.simpleanalytics.com/api/stats)).
- Version 6 metadata filters. Matching is exact, wildcards are unsupported, numeric values can match numeric or text metadata, and multiple metadata filters are ANDed ([Stats API](https://docs.simpleanalytics.com/api/stats)).

The same filters apply to event results selected with `events` ([Stats API](https://docs.simpleanalytics.com/api/stats)). The dimension responses are grouped records with a `value`, `pageviews`, and `visitors`, rather than row-level records. **Observed:** the public response labels these arrays "Top N" and returns them in descending pageview order for the sampled site ([live Stats API response](https://simpleanalytics.com/simpleanalytics.com.json?version=6&fields=pages,countries&start=today-7d&end=today&timezone=UTC&limit=3&info=false)).

There is an official documentation inconsistency: the Stats API lists `utm_terms`, while the current Metrics page says Simple Analytics does not support `utm_term` ([Stats API](https://docs.simpleanalytics.com/api/stats), [Metrics](https://docs.simpleanalytics.com/metrics)). Treat `utm_term` support as unresolved for a canonical Cimi contract.

## Sorting and pagination

- `limit` is documented only as a field limit from 1 to 1,000 ([Stats API](https://docs.simpleanalytics.com/api/stats)).
- **Observed:** `limit=3` independently limits each dimension array to three records and the response describes them as "Top 3"; it does not limit histogram buckets ([live Stats API response](https://simpleanalytics.com/simpleanalytics.com.json?version=6&fields=pages,countries&start=today-7d&end=today&timezone=UTC&limit=3&info=false)).
- No `offset`, cursor, page number, or sort parameter is documented for Stats API. No stable tie-break rule is documented. The observed descending pageview order should not be treated as a complete ordering contract.
- Export has no documented pagination or caller-selected sort; it is a streamed raw export with selected fields ([Export API](https://docs.simpleanalytics.com/api/export-data-points)).

**Cimi implication:** model top-N dimension queries separately from paginated row queries. If Cimi needs stable pagination, it must define an explicit order and cursor; Simple Analytics does not provide evidence for one.

## Public and shared analytics

- Public websites can return Stats API JSON without credentials; private sites require authentication ([Stats API](https://docs.simpleanalytics.com/api/stats)).
- Website visibility is represented by a `public` boolean in the Admin API. Developers can change website visibility between public and private ([Admin API](https://docs.simpleanalytics.com/api/admin), [team roles](https://docs.simpleanalytics.com/explained/team-roles)).
- Simple Analytics provides an embeddable chart for public website statistics. Its documented settings include hostname, start/end dates, metric types, selected pages, and timezone ([embed chart](https://docs.simpleanalytics.com/embed-chart-on-your-site)).
- Team custom views can merge websites, apply permanent filters, or give others access to a limited subset of data ([custom views](https://docs.simpleanalytics.com/custom-views)). Team Viewers have read-only access to dashboards, goals, and events ([team roles](https://docs.simpleanalytics.com/explained/team-roles)).
- The Export API documentation requires `Api-Key` and `User-Id` headers. Public access is explicitly documented for Stats JSON, not as a general guarantee for raw exports ([Export API](https://docs.simpleanalytics.com/api/export-data-points), [API](https://docs.simpleanalytics.com/api)).

## Cimi-relevant conclusions

1. Keep aggregate Stats semantics and raw datapoint export semantics as separate contracts.
2. Make timezone and range-boundary behavior explicit in every canonical query.
3. Represent `visitors` as a unique-pageview metric, not a person or durable visitor count.
4. Define bucket alignment and empty-bucket behavior instead of inheriting undocumented behavior.
5. Treat dimension lists as top-N aggregates unless Cimi adds a separate, explicitly paginated query.
6. Make public sharing an endpoint-level policy with an explicit field allowlist; Simple Analytics' public Stats surface is not evidence that raw exports should be public.

## Primary source register

- [Simple Analytics API overview](https://docs.simpleanalytics.com/api)
- [Stats API](https://docs.simpleanalytics.com/api/stats)
- [Export API](https://docs.simpleanalytics.com/api/export-data-points)
- [API helpers](https://docs.simpleanalytics.com/api/helpers)
- [Unique visits explained](https://docs.simpleanalytics.com/explained/unique-visits)
- [Time on page explained](https://docs.simpleanalytics.com/explained/time-on-page)
- [Metrics](https://docs.simpleanalytics.com/metrics)
- [Public scripts repository](https://github.com/simpleanalytics/scripts)
- [Official documentation repository](https://github.com/simpleanalytics/docs)
