# D-02 grounding for design sketch

Repo: /home/kevin/.herdr/worktrees/cimi/feat-reporting-d02 (Cimi self-hosted analytics).
Deliverable for issue #45: real traffic-report + event-report over the DuckDB projection.

## What already exists (do NOT redesign these)

- Contract trees are authored and validated:
  - packages/contract/src/contract/traffic-report/schema.ts
  - packages/contract/src/contract/event-report/schema.ts
  Read them for the exact input/output shapes. They fix everything the service must produce.
- Reporting admission kernel: packages/kernel/src/reporting/
  - ReportingAdmissionService.admit(input: ReportAdmissionInput): Promise<ReportAdmissionTicket>
  - Ticket = { periods: ResolvedPeriods; freshness: {current, comparison|null}; factWork }
  - ResolvedPeriod = { key, dates, interval: {start, endExclusive}, calendarDays, bucketStarts: BucketStart[]|null }
  - BucketStart = { at: InstantMs, localLabel: string, offsetMinutes: number }
  - Branded SiteId/CalendarDate/InstantMs + create* constructors.
  - ReportingAdmissionError { code, reason }; codes BAD_REQUEST|NOT_FOUND|QUERY_LIMIT_EXCEEDED|SERVICE_UNAVAILABLE.
- Served reference resource: apps/api/src/resources/traffic-report/{index,service,router,errors,readiness,evidence.drizzle-duckdb,metadata.drizzle}.ts
  - service.ts currently ZERO-FILLS metrics and returns complete:false; breakdowns return items:[].
  - index.ts wires ReportingMetadataDrizzle + ReportingEvidenceDrizzleDuckDb + ReportingAdmissionService + TrafficReportService, returns {metadata,evidence,admission,service,router}.
  - errors.ts toOrpcReportingError maps ReportingAdmissionError.code -> ORPCError.
  - readiness.ts createReportingReadinessPort gives AnalyticsReadinessPort from health+lifecycle.
- API composition: apps/api/src/orpc.ts builds `api`/`authenticatedApi` from `implement({...})`. apps/api/src/index.ts registers routers in one api.router({...}) call and has the analytics-read admission gate already.
  - NOTE: eventReport is NOT yet in orpc.ts implement({...}) and NOT registered in index.ts.

## The gap D-02 must fill

- packages/db/src/duckdb/index.ts (AnalyticsDb) exposes ONLY readProjectionSnapshot; no windowed read/aggregate API. All reads must go through the same serial `enqueue()` queue as rebuild/deleteExpired/purgeSite (single connection, serialized).
- DuckDB tables (packages/db/src/duckdb/schema.ts):
  - events(event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, late, visitor_id, anonymous_identity_id, identified_user_id, analytics_session_id, bot_policy_outcome, utm_source, utm_medium, utm_campaign, device, browser, operating_system, country, page_path, referrer, name, destination, value, unit, code, message, properties_json, policy_revision_id, replay_sequence, payload_fingerprint, projected_at)
  - analytics_sessions(site_id, session_id, visitor_id, identified_user_id, started_at, ended_at, entry_page, referrer, utm_source, utm_medium, utm_campaign, device, browser, operating_system, country, region, city)
  - visitors(site_id, visitor_id, identity_kind, first_seen_at, last_seen_at, profile_id)
  - event_properties(site_id, event_id, property_key, value_type, string_value, number_value, boolean_value)
  - Times are DuckDB TIMESTAMP; the existing read selects `epoch_ms(col)` to avoid host-timezone skew and rebuilds a Date via readInstant(). Follow that.
- Raw event payloads / canonical identity profiles live in SQLite (the control Db): accepted_event, event_property, identity_profile, identity_profile_epoch, identity_link, identity_redaction, site, site_tombstone, retention_effective_cutoff. DuckDB is the analytical projection.

## Discipline constraints (AGENTS.md + specs)

- package/utils only for cross-app/package utilities; DRY.
- TDD, sociable unit tests, mock only the repository.
- Run test/lint/fmt narrowly, sequentially (vp / pnpm). No parallel script runs.
- Integration/fixture test harness: apps/api/src/testing/fixture.ts (createApiTestFixture, apiTestRequest, signUpTestUser); fixture.analytics.rebuild({controlDb}).
- Boundaries: validate at system boundary, trust internal types. Pure business logic; thin shell.
- Storage/framework/wire types must not leak to public surface.

## Normative rules the design must honor (from specs; all cited)

traffic-report (docs/specs/analytics-reporting/traffic-report/SPECS.md):
- :48 overview metrics visitors/sessions/pageviews/bounce_rate/pages_per_session/average_session_duration_seconds; rates denominator eligibleSessions; duration denominator sessionsWithValidDuration.
- :48 bounce = exactly one accepted page_view, no custom_event/outbound engagement, full Session occurrence span <10s, identify excluded as engagement.
- :48 bucket limits minute1800/hour720/day366/week104/month36/year10; invalid/over bucket rejected not clamped.
- :58 breakdown rows fixed `sessions` metric at Session grain; percentage = row count / filtered pre-pagination total, also returned as denominator; zero-based live offset pages with allowlisted sort + canonical dimension-value tie-breaker; nextOffset/hasMore/totalCount.
- :58 profile filters may use approved trait keys, but trait values and identity fields are NEVER returned as dimensions.
- :48/:58 comparison optional, adjacent equal-length, own freshness.
- :91 no events -> zero metrics + empty rows, not an error. :92 late event placed by Occurrence Time. :93 deleted identity excluded, aggregates recomputed.

event-report (docs/specs/analytics-reporting/event-report/SPECS.md):
- :50 overview counts + unique Session/Visitor context by Event Kind; typed property.* + has_done/has_not_done session same_range; authenticated only.
- :60 timeseries buckets valid for range; empty buckets zero-filled; own freshness; granular limits same numbers.
- :70 listEvents sorted ONLY by validated Occurrence Time with Event ID final tie-breaker; receipt time and kind are NOT sort modes; duplicate Event IDs appear once; no comparison; placement by Occurrence Time.
- :80 breakdowns: event-kind-specific allowlisted fields; values preserve 2048-char bound; offset pagination + stable dimension-value tie-breaker; sanitize error message/stack/URLs.
- :115 deleted profile -> remove profile fields from output and recompute affected aggregates.
- :116 unsupported specialized field -> BAD_REQUEST, never silently ignored.

METRICS.md:
- :40 sessions = count DISTINCT Sessions intersecting range (non-additive). :41 visitors = count DISTINCT Visitors intersecting range (non-additive).
- :45 bounce_rate = bounced / eligible Sessions. :46 pages_per_session = pageviews / sessions. :47 average_session_duration_seconds = sum full Session occurrence spans / Sessions with valid duration.
- :38 events = count accepted Events. :39 pageviews = count accepted page_view Events.
- :76-84 trend point carries metric/grain/unit/denominator; count metrics use null denominator.
- :91-98 breakdowns: zero-based offset, stable tie-breaker AFTER sort.
- :105 event overview + timeseries metrics = events, unique_visitors, unique_sessions.

Criteria (ACCEPTANCE.md:363-529): site-local inclusive dates; non-enumeration (missing + out-of-scope both NOT_FOUND, never FORBIDDEN); retention coverage reject; empty buckets zero; per-granularity bounds BAD_REQUEST before exec; offset pagination; freshness current only when coverage reaches range end; projection gap -> generic QUERY_LIMIT_EXCEEDED before cache; typed event filters; event ordering; previous-period comparison; fact-work preflight.

## Design question to answer

Design the layer that turns the DuckDB projection + the kernel ticket into the exact contract
outputs, for all six procedures:
1. getTrafficOverview  2. getTrafficBreakdowns
3. getEventOverview    4. getEventTimeseries  5. listEvents  6. getEventBreakdowns

Resolve explicitly:
- Where does the SQL live? A new AnalyticsDb read method? A new port in kernel? An adapter in apps/api?
- What is the interface between the service and the store? What type crosses it?
- How are filters (event/session/visitor/profile scopes; property.*; has_done/has_not_done) compiled
  to SQL safely (no injection), and how are profile trait filters gated by profileFilterKeys?
- How is the trend/bucket fill done (kernel gives bucketStarts; store gives per-bucket rows)?
- How is offset pagination + canonical tie-breaker expressed once and reused by both breakdowns and
  listEvents?
- How is `complete` decided per bucket?
- How is duplicate-eventId de-duplication done for listEvents?
- How is the 2048-char / sanitization bound enforced without leaking raw fields?
- Keep the Fact-Work estimate honest relative to what the SQL actually scans.

Produce: caller's usage first, then type sketch, function signatures, module map, prose rationale
per architect's rationale-template.md. Include at least one concrete alternative shape rejected.
Do NOT write the implementation. Types, signatures, `not implemented` bodies, pseudocode only.
