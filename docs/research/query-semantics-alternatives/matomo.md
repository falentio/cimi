# Matomo Query Semantics

Research for Cimi's canonical query semantics comparison. Researched 2026-08-23. Sources are limited to Matomo's official developer documentation, official FAQs, and the official `matomo-org/matomo` source repository.

## Scope and Version Context

- The vendored checkout reports Matomo `6.0.0-b1` (`docs/research/vendor/matomo/core/Version.php:25`). Source links below use the moving official [`6.x-dev` branch](https://github.com/matomo-org/matomo/tree/6.x-dev), not a pinned commit.
- The developer pages are labelled v5. The version mismatch is material: report availability, unique-count defaults, filters, and plugin behavior are configuration- and release-sensitive.
- **Fact** means directly documented or implemented. **Inference** means a Cimi interpretation. **Unavailable** means not established by the inspected primary sources.

## Bottom Line

**Fact:** Matomo has a flexible report API, but not one generic query language with a free-form interval parameter. The standard contract is `idSite` plus a fixed `period` and `date`, optionally a segment and report-specific dimensions. `period=range` is a single aggregate, not a time series. [Reporting API](https://developer.matomo.org/guides/reporting-api) [Period source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/Period.php#L19-L29)

**Inference:** Cimi should model a time-series query and a range aggregate as separate semantic modes. It should also make metric additivity, unique identity scope, dimension scope, and timezone explicit instead of inheriting Matomo's report-specific behavior.

## Time Windows and Ranges

- **Fact:** The standard periods are `day`, `week`, `month`, `year`, and `range`; Matomo states that reports use the website's timezone. A single date selects the containing period: a week means the week containing the date, and likewise for month and year. [Reporting API](https://developer.matomo.org/guides/reporting-api) [VisitsSummary API source](https://github.com/matomo-org/matomo/blob/6.x-dev/plugins/VisitsSummary/API.php#L29-L50)
- **Fact:** `date=lastX` returns one result for each of the last X periods including today; `date=previousX` returns the X periods before the current period. Date ranges can be written as `YYYY-MM-DD,YYYY-MM-DD` and can use supported relative keywords. [Reporting API](https://developer.matomo.org/guides/reporting-api)
- **Quoted fact:** Matomo's API reference says, "if you set 'period=range' to request data for a custom date range, the API will return the sum of data for the specified date range." It also says the implicit period unit for `period=range` is `day`. [Reporting API](https://developer.matomo.org/guides/reporting-api)
- **Fact:** With a non-`range` period and a multi-period date expression, Matomo returns one bucket per requested period (internally a `DataTable\Map`). With `period=range`, the range is represented as one period and retains the specified end date. [Period source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/Period.php#L78-L101) [Range source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/Period/Range.php#L275-L285) [DataTable guide](https://developer.matomo.org/guides/datatable)
- **Fact:** The core period bounds cover the full first and last calendar day. The log aggregator uses `>=` for the start and `<=` for the end. Visit aggregation filters on `visit_last_action_time`; action aggregation filters on `server_time`. [Period source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/Period.php#L147-L165) [LogAggregator source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataAccess/LogAggregator.php#L127-L131) [LogAggregator bounds](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataAccess/LogAggregator.php#L934-L969)
- **Fact:** Matomo pre-archives day/week/month/year reports, while arbitrary ranges are archived on demand. This is a freshness/performance behavior, not a different date meaning. [Period source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/Period.php#L25-L29) [Range source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/Period/Range.php#L19-L29)

## Granularity and Buckets

- **Fact:** Standard time-series granularity is selected by `period`; the API documents day, week, month, year, and range, but no general `granularity=15m` or arbitrary interval parameter. A daily series is requested with `period=day&date=lastX`; a weekly series with `period=week&date=lastX`. [Reporting API tutorial](https://developer.matomo.org/guides/reporting-api-tutorial)
- **Fact:** Reports can define their own dimensions that are not the standard date buckets. The VisitTime plugin, for example, groups visits by the visitor's local hour or the site's hour, while the requested `period` still defines the overall window. [VisitTime API source](https://github.com/matomo-org/matomo/blob/6.x-dev/plugins/VisitTime/API.php#L23-L44) [VisitTime hour source](https://github.com/matomo-org/matomo/blob/6.x-dev/plugins/VisitTime/API.php#L72-L118)
- **Fact:** Matomo report metadata can mark a dimension as having a constant row count; the official metadata documentation gives "visits per hour" as an example that always has 24 rows. Other fixed dimensions include day-of-week reports with seven rows. [Metadata API](https://developer.matomo.org/guides/reporting-api-metadata) [Day-of-week source](https://github.com/matomo-org/matomo/blob/6.x-dev/plugins/VisitTime/Reports/GetByDayOfWeek.php#L21-L32)
- **Fact:** Plugins can define additional period types through a period factory. Therefore, the five standard periods are not necessarily the complete set on a customized installation. [Period Factory source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/Period/Factory.php#L19-L36)

## Metrics and Unique Counts

| Metric | Matomo definition or implementation |
| --- | --- |
| `nb_visits` | Number of visits; the API defines 30 minutes of inactivity as a new visit. |
| `nb_uniq_visitors` | Unique visitors. Matomo's metadata says each visitor is counted once even when visiting multiple times a day. Core visit aggregation uses `count(distinct log_visit.idvisitor)`. |
| `nb_users` | Unique active users with a known User ID; the API says it is zero when User ID is not used. Core aggregation uses `count(distinct log_visit.user_id)`. |
| `nb_actions` | Page views, internal site searches, outlinks, and downloads; core visit aggregation sums `visit_total_actions`, while action reports count action rows. |
| `sum_visit_length` | Total visit time in seconds. |
| `bounce_count` | Visits with only one action. |
| `nb_visits_converted` | Visits with at least one goal conversion. |

Sources: [Reporting API metric definitions](https://developer.matomo.org/guides/reporting-api) [Archive data guide](https://developer.matomo.org/guides/archive-data) [LogAggregator visit metrics](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataAccess/LogAggregator.php#L470-L511) [LogAggregator action metrics](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataAccess/LogAggregator.php#L1079-L1090)

- **Fact:** Unique metrics are not safely additive across periods or dimensions. Matomo documents `sum_daily_nb_uniq_visitors` as the sum of daily unique visitors and explicitly says it does not process unique visitors across the full period. The core source separately recomputes unique visitors/users from logs because they cannot be summed like ordinary metrics. [Reporting API](https://developer.matomo.org/guides/reporting-api) [ArchiveProcessor source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/ArchiveProcessor.php#L456-L520) [Actions metrics source](https://github.com/matomo-org/matomo/blob/6.x-dev/plugins/Actions/Metrics.php#L1-L80)
- **Fact:** In the vendored 6.0.0-b1 defaults, unique visitor processing is enabled for day/week/month and disabled for year/range. The setting is configurable, and the API can omit unique metrics when processing is disabled. [Global config source](https://github.com/matomo-org/matomo/blob/6.x-dev/config/global.ini.php#L227-L236) [Settings source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/SettingsPiwik.php#L307-L331)
- **Fact:** When grouped by a dimension, `count(distinct idvisitor)` is calculated within each group. **Inference:** summing `nb_uniq_visitors` across rows can overcount a visitor who appears in multiple dimension values; Cimi should treat unique metrics as non-additive unless the query explicitly defines the identity and grouping scope. [LogAggregator grouping source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataAccess/LogAggregator.php#L615-L676) [LogAggregator SQL source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataAccess/LogAggregator.php#L1190-L1200)
- **Fact:** Processed metrics are separate from base metrics. The Metadata API describes ratios and averages such as bounce rate, average actions per visit, average time on site, conversion rate, and revenue per visit; conversion rate counts a visit once even if it converted multiple goals. [Metadata API](https://developer.matomo.org/guides/reporting-api-metadata)

## Filters and Dimensions

- **Fact:** `segment` applies a custom audience filter to most API functions. Matomo supports equality, inequality, comparisons, contains, starts-with, and ends-with operators. Commas mean OR and semicolons mean AND; the documented precedence makes OR bind inside an AND expression. [Segmentation API](https://developer.matomo.org/api-reference/reporting-api-segmentation)
- **Fact:** A report dimension determines the row grouping. Core source describes a dimension as a `GROUP BY` field and says multiple dimensions aggregate metrics for each combination. [LogAggregator source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataAccess/LogAggregator.php#L36-L45) [LogAggregator grouping source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataAccess/LogAggregator.php#L641-L650)
- **Fact:** Custom dimensions have explicit scopes: visit, action, and conversion. Visit values can be used for visit-level reports and action values for individual actions; the scope changes which records and metrics the dimension can describe. [Dimensions guide](https://developer.matomo.org/guides/dimensions)
- **Fact:** Report output can be hierarchical. `expanded` includes first-level results and subtables; `flat` aggregates child rows; `show_dimensions=1` preserves separate dimension columns in flattened reports; `pivotBy` intersects a report with another dimension. [Reporting API](https://developer.matomo.org/guides/reporting-api)
- **Fact:** Generic report filters include regex matching (`filter_pattern` and `filter_column`), recursive matching, low-population exclusion, column selection/removal, and presentation controls. Report metadata exposes the report's dimensions, metrics, and segment metadata. [Reporting API](https://developer.matomo.org/guides/reporting-api) [Metadata API](https://developer.matomo.org/guides/reporting-api-metadata) [Generic filter source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/API/DataTableGenericFilter.php#L99-L146)
- **Inference:** Matomo's segment catalog is broader than a safe canonical query surface. Cimi should expose an allowlisted dimension/filter registry rather than forward arbitrary segment expressions, especially for public analytics.

## Sorting and Pagination

- **Fact:** The Reporting API defaults to the top 100 rows; `filter_limit=-1` requests all rows. `filter_offset` selects the starting row. [Reporting API](https://developer.matomo.org/guides/reporting-api)
- **Fact:** `filter_sort_column` and `filter_sort_order` control sorting. The generic filter pipeline removes nonmatching rows, sorts, then applies truncation/row limits, followed by presentation filters. [Generic filter source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/API/DataTableGenericFilter.php#L99-L146) [Generic filter execution](https://github.com/matomo-org/matomo/blob/6.x-dev/core/API/DataTableGenericFilter.php#L171-L247)
- **Fact:** `filter_truncate` aggregates omitted rows into a localized `Others` summary row. `filter_offset`/`filter_limit` instead retain the half-open row range `[offset, offset + limit)`; the source records the pre-limit row count in table metadata. [Reporting API](https://developer.matomo.org/guides/reporting-api) [Limit source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataTable/Filter/Limit.php#L15-L82)
- **Fact:** Sorting can be recursive for subtables and can use a secondary column, commonly `nb_visits` or `label`. [Sort source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/DataTable/Filter/Sort.php#L17-L123)
- **Unavailable:** No cursor/keyset pagination or cross-report stable ordering guarantee was found. The documented contract is offset pagination over a filtered and sorted report.

## Public and Shared Analytics

- **Fact:** Matomo reports are private by default. Public access is enabled by granting the built-in `anonymous` user `View` access to selected Sites; anyone with a link to the Matomo instance can then view reports for those Sites. Revocation is removing that Site permission. [Anonymous user FAQ](https://matomo.org/faq/how-to/faq_20130/)
- **Fact:** Matomo documents embedding individual widgets and a full dashboard. For private embedding it recommends a dedicated `View` user and `token_auth`; Matomo describes the token as equivalent to a password and says not to share it. [Embedding reports FAQ](https://matomo.org/faq/reports/requirements-for-embedding-matomo-reports/) [Embed report FAQ](https://matomo.org/faq/reports/embed-a-matomo-report-in-a-html-page/) [Reporting API authentication](https://developer.matomo.org/guides/reporting-api)
- **Fact:** Anonymous users do not receive Visitor Profile access, visitor IPs, or visitor IDs in the UI/API according to Matomo's FAQ. The source also makes anonymous segment use configurable through `anonymous_user_enable_use_segments_API`. [Anonymous user FAQ](https://matomo.org/faq/how-to/faq_20130/) [Settings source](https://github.com/matomo-org/matomo/blob/6.x-dev/core/SettingsPiwik.php#L296-L304)
- **Unavailable:** The inspected primary sources do not define a signed, independently revocable, per-report share link with expiry. **Inference:** if Cimi needs per-share identifiers, expiry, audit, or independent revocation, it needs its own access/proxy layer rather than relying on Matomo's anonymous Site permission.

## Cimi Relevance

- Make `aggregate` versus `series` explicit: Matomo's `period=range` aggregate must not be confused with a daily/weekly series over the same dates.
- Define interval boundaries and timezone in Cimi's contract. Matomo uses the Site timezone and report-specific timestamp fields; Cimi should not leave this implicit.
- Mark metrics as additive, non-additive, or recomputed. In particular, never sum unique visitors/users across buckets or dimensions unless the contract says the result is a daily sum rather than a full-window distinct count.
- Treat dimensions as typed scopes, not arbitrary strings. A dimension's visit/action/conversion scope affects what a row means.
- Prefer stable cursor semantics for Cimi if clients need reliable pagination under changing data; Matomo exposes offset pagination only.
- Use a Cimi-controlled public query boundary if public analytics need a narrower filter catalog or independent share lifecycle.

## Unknowns and Verification Needs

- The vendored source is a 6.0.0 beta while the official developer pages are labelled v5; verify all conclusions against the pinned Matomo release Cimi would support.
- Plugin-defined reports can add dimensions, metrics, period types, default sort rules, and access restrictions. The standard API does not establish one universal report schema.
- The inspected sources do not specify a universal tie-break rule for every report, a stable ordering across archive refreshes, or a maximum date-range length for all deployments.
- Hourly/local-time behavior around daylight-saving transitions, and whether a deployment changes the default unique-processing settings, need integration tests.
- Public embedding behavior added by plugins, reverse proxies, or a Matomo Cloud deployment may differ from the core Site-level anonymous permission model.
