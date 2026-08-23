# Acceptance Scenarios

These Given/When/Then scenarios are the executable-contract acceptance checklist for the first coherent release. They describe observable behavior without prescribing handlers, repositories, migrations, or query engines.

## Authorization and Governance

### Persisted Site authorization

**Given** an authenticated principal whose current session context names a Site they no longer access

**When** they call an authenticated Site query

**Then** the procedure rechecks persisted Organization membership and Site scope and returns the documented indistinguishable `NOT_FOUND` when access is absent

### Personal Organization convergence

**Given** a User with no Personal Organization and two concurrent dashboard opens

**When** both calls run `ensurePersonalOrganization`

**Then** both calls return the same persisted Organization and no duplicate Personal Organization is created

### Owner protection

**Given** a Personal Organization, an Organization with Sites, or the last Organization Owner

**When** a delete, demotion, removal, or leave command would violate the lifecycle invariant

**Then** the command returns its typed `409` error and does not mutate membership or ownership

### Ingestion identifier rotation

**Given** a Site whose Ingestion Identifier has been rotated

**When** a caller submits an Event using the old identifier

**Then** collection fails with `NOT_FOUND` and does not create an Event, Visitor, Identity Profile, or Analytics Session

### Invitation token lifecycle

**Given** a pending invitation with a seven-day expiry and a token stored only as a hash

**When** an authenticated recipient accepts it, repeats the same acceptance, or presents an expired or revoked token

**Then** the first valid acceptance atomically creates the resulting Membership and consumes the invitation, while every replay, expired token, or revoked token returns indistinguishable `NOT_FOUND`

### Site hostname lifecycle

**Given** a Site create or update request containing a hostname with case or trailing-dot variation

**When** the Site command normalizes and checks the Organization-scoped hostname uniqueness rule

**Then** equivalent hostnames resolve to one canonical value, duplicates return the documented conflict, and deletion remains asynchronous without exposing a removed Site as active

## Event Acceptance

### Durable singular acceptance

**Given** a valid new Event within the configured size, timestamp, policy, and rate boundaries

**When** `collectEvent` appends the normalized Event and immutable acceptance metadata to SQLite

**Then** it returns HTTP `200` with `accepted`, and the response does not imply that DuckDB is already queryable

### Serialized payload limits

**Given** a singular payload over 64 KiB or a batch payload over 256 KiB when measured as UTF-8 bytes

**When** the ingestion contract validates the request

**Then** it returns `PAYLOAD_TOO_LARGE` before appending any acceptance-journal record

### Exact retry

**Given** an accepted Event with the same Site-scoped Event ID and payload fingerprint

**When** the caller retries it after a restart or policy change

**Then** it returns HTTP `200` with `duplicate`, preserves the original Receipt Time, and creates no new identity or Session state

### Changed-payload collision

**Given** an accepted Event ID with a different payload fingerprint

**When** the caller submits the changed Event

**Then** it returns `CONFLICT` and leaves the original acceptance record unchanged

### Policy refusal before identity

**Given** a syntactically valid Event excluded by consent, GPC/DNT, bot, hostname, path, or other committed policy

**When** collection evaluates the policy

**Then** it returns generic `FORBIDDEN` and creates no accepted record, Visitor, Identified User, Alias, or Analytics Session

### Mixed batch recovery

**Given** a bounded batch containing new, duplicate, policy-refused, and malformed Events

**When** `collectEvents` processes items independently and the request is interrupted

**Then** the response contains per-item outcomes, each accepted item has its own SQLite sequence, and retrying unjournaled Event IDs is safe

### Batch envelope consistency

**Given** a batch with one Site Ingestion Identifier and at most 100 Events within the serialized payload limit

**When** an item uses another Ingestion Identifier or the payload exceeds 256 KiB

**Then** validation rejects the batch before partial acceptance and no item result is returned

### Event-kind requirements

**Given** an Event with a declared kind

**When** kind-specific required fields are missing or an unknown field is supplied

**Then** validation fails before acceptance and no durable acceptance state is written

### Contract timestamp validity

**Given** an Event, lifecycle record, or report range containing an impossible calendar date or timestamp

**When** the contract validates the request or response

**Then** validation fails rather than normalizing the value into another calendar day

### Event clock boundaries

**Given** an Event more than five minutes in the future, older than raw retention, or more than fifteen minutes behind Receipt Time

**When** ingestion validates and journals the Event

**Then** future or expired Events are rejected, valid late Events are marked late while retaining their validated Occurrence Time, and Receipt Time remains the ingest-order timestamp

## Identity and Deletion

### Explicit identification

**Given** a valid Site Ingestion Identifier and an allowed opaque Identified User ID

**When** `identify` links the current Anonymous Identity

**Then** the current Analytics Session and future Events may use the profile, unrelated anonymous history is not relabeled, and traits remain bounded scalar values

### Deletion hiding

**Given** an Identified User deletion request

**When** SQLite commits the Deletion Tombstone and Identity Redaction overlay

**Then** profile and identity-sensitive queries hide the data immediately while deletion workers asynchronously update DuckDB projections

### Anonymous reclassification

**Given** a retained Event whose profile linkage was removed by Identity Redaction

**When** analytical facts are rebuilt

**Then** the Event contributes only to anonymous Site analytics when its remaining fields are non-personal, and it is excluded from Identified User-specific reports

### Monotonic deletion status

**Given** a profile in `deletion-requested`, `deleting`, or `deleted` state

**When** deletion status is queried or cleanup retries

**Then** status never moves backward, deleted profile data is not returned, and backup cleanup is reported separately from active-store completion

### Separate deletion cleanup status

**Given** a deleted profile whose active-store and derived cleanup has completed while an older backup still contains its historical payload

**When** `getDeletionStatus` is queried

**Then** the response reports `derivedCleanup.status` as `complete`, `backupCleanup.status` as `pending`, and an `updatedAt` timestamp for each cleanup status without returning deleted profile data

## Reporting

### Site-local date boundaries

**Given** a Site Reporting Timezone and an inclusive `fromDate`/`toDate` range

**When** an authenticated report runs

**Then** the query resolves the range to Site-local calendar boundaries, uses the requested procedure granularity, and rejects invalid or over-bounded ranges instead of widening them

### Empty and incomplete buckets

**Given** a valid timeseries range containing no Events in one or more buckets or an asynchronously incomplete current bucket

**When** the timeseries query runs

**Then** empty buckets return zero and incomplete buckets carry `complete: false`

### Minute report range and response bound

**Given** a report requested with minute granularity

**When** its inclusive `fromDate` and `toDate` span more than one Site-local calendar date or its response would contain more than 1,800 buckets

**Then** the request or response is rejected by the contract rather than widening the range or returning an unbounded series

### Offset pagination

**Given** a live list ordered by its declared sort and final tie-breaker

**When** a caller supplies `offset` and `limit`

**Then** the response returns `nextOffset`, `hasMore`, and `totalCount`, and later pages may shift under concurrent ingestion without exposing an opaque cursor contract

### Query freshness and projection gaps

**Given** accepted Events whose DuckDB projection is asynchronous or contains a known quarantined sequence

**When** a report is queried

**Then** the response exposes projected acceptance sequence, occurrence-time coverage, and degraded/gap status rather than presenting incomplete data as complete

### Typed Event report filters and outputs

**Given** an authenticated Event report request with an allowlisted Event or `property.*` filter and a standard Event Kind

**When** the report validates the filter or returns a list item

**Then** unsupported scopes, fields, and malformed values are rejected, and each Event Kind exposes only its bounded typed fields without hidden identity or unsanitized private data

### Previous-period comparison

**Given** an analytical report with an ordered previous-period comparison range

**When** the report runs

**Then** the response returns the current and comparison periods separately with their own metrics and freshness metadata; raw lists and Public Query reject comparison input

### Goal conversion semantics

**Given** a Goal with an explicit Visitor or Identified User identity kind and a matching action repeated in one Analytics Session

**When** the Goal report runs

**Then** that Session contributes at most one conversion and the response exposes conversions, eligible Sessions, and the resulting rate

### Funnel ordering

**Given** a Funnel with two to ten distinct ordered steps and actions that repeat or cross an Analytics Session boundary

**When** the Funnel report runs

**Then** only the next matching step in the same Session advances, cross-Session continuation stops, and each step reports its entry and previous-step rates

### Cohort periods

**Given** a Visitor or Identified User Cohort definition and a Site-local day, week, or month period

**When** the retention report runs

**Then** the first qualifying action enters the identity once, later qualifying actions count at most once per period, and zero-retention periods remain explicit

### Distinct cohort actions

**Given** a Cohort definition whose entry and retention actions are identical

**When** the create or update contract validates the definition

**Then** validation returns `BAD_REQUEST` and does not accept the definition

## Public Disclosure

### Suppressed public result

**Given** a public dashboard query whose result would expose a cohort smaller than the configured suppression threshold

**When** the public query runs

**Then** it returns the normal suppression-safe shape with nullable/suppressed values and does not disclose the reason or underlying cohort size

### Public query bounds

**Given** a public query outside the 90-day range, with a non-hour granularity, or using a private/profile filter

**When** the request is validated

**Then** it returns `BAD_REQUEST` or `QUERY_LIMIT_EXCEEDED` without evaluating private analytics filters

### Public filter allowlist

**Given** a public query filter naming a raw, profile, or otherwise non-allowlisted field

**When** the request is validated

**Then** validation rejects the filter before any private or identity-sensitive data is evaluated

### Public rate limit

**Given** a Site or IP has exceeded its public query rate limit

**When** another public query arrives

**Then** it returns `429` with `Retry-After` and does not disclose whether the requested data exists

### Public identifier revocation

**Given** a public dashboard identifier is disabled or rotated while a previously cached response exists

**When** a caller submits a new request with the old identifier

**Then** the request returns indistinguishable `NOT_FOUND`, cached content does not authorize a new request, and the public response contract emits `noindex,nofollow` without publishing a sitemap entry

## Lifecycle and Recovery

### Accept-only degraded health

**Given** SQLite is ready and DuckDB is unavailable

**When** health and collection are queried

**Then** health reports `degraded` with separate control/analytics store states, collection may durably accept Events, and analytical queries report unavailable or stale state

### Read-only backup maintenance

**Given** an installation-wide backup operation holds the lifecycle lock

**When** analytics reads, collection, and another lifecycle command arrive

**Then** analytics reads may continue, collection and mutations return lifecycle `CONFLICT`, and the backup captures only the authoritative SQLite generation

### Installation initialization convergence

**Given** an uninitialized installation or an installation already in the same valid current state

**When** an administrator calls `initializeInstallation`

**Then** first initialization returns HTTP `201`, convergent reuse returns HTTP `200`, both return the detailed installation body, and no existing Site or analytics data is overwritten

### Restore and rebuild

**Given** an operator confirms a compatible SQLite backup

**When** restore replays the acceptance journal and rebuilds DuckDB

**Then** the installation remains recovering until structural health checks pass, may become ready with visible `cleanupPending`, and never treats DuckDB as the recovery authority

### Incompatible backup

**Given** an operator selects a backup with an incompatible format, schema, or retention contract

**When** restore validation runs

**Then** restore returns the typed incompatibility error before replacing the authoritative SQLite generation and leaves the current installation state unchanged

### Interrupted lifecycle operation

**Given** a process crashes during backup, restore, upgrade, or cleanup

**When** the application starts again

**Then** it resumes from durable operation state, exposes recovering status, and never reports a partial generation as ready

### Upgrade rollback

**Given** an upgrade has created an authoritative SQLite backup and writes are quiesced

**When** SQLite migration or the subsequent DuckDB rebuild fails

**Then** the whole pre-upgrade generation is restored and the installation does not lose an accepted Event

### Retention shortening

**Given** an administrator shortens the effective retention policy

**When** the policy commits

**Then** affected data becomes hidden immediately, physical cleanup is asynchronous, and lifecycle status reports progress without blocking the policy command on storage volume
