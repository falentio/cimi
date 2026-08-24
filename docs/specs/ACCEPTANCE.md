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

### Empty Personal Organization deletion

**Given** an empty Personal Organization and its Owner

**When** the Owner calls `deleteOrganization`

**Then** the procedure returns `204` and deletes the Organization; a Personal Organization is protected only while it owns a Site

### Organization deletion error precedence

**Given** a Personal Organization that owns a Site

**When** its Owner calls `deleteOrganization`

**Then** the command returns `PERSONAL_ORGANIZATION_PROTECTED`, not `ORGANIZATION_NOT_EMPTY`, and does not mutate the Organization

**Given** a non-personal Organization that owns a Site

**When** its Owner calls `deleteOrganization`

**Then** the command returns `ORGANIZATION_NOT_EMPTY` and does not mutate the Organization

### Owner protection

**Given** the last Organization Owner

**When** a demotion, removal, or leave command would violate the ownership invariant

**Then** the command returns `OWNER_PROTECTED` and does not mutate membership or ownership

### Explicit ownership transfer

**Given** an Organization Owner and another active member

**When** the Owner calls `transferOrganizationOwnership` for that member

**Then** the target becomes the sole Owner, the previous Owner becomes an Administrator atomically, and the procedure returns the complete promoted Owner Membership

### Ingestion identifier rotation

**Given** a Site whose Ingestion Identifier has been rotated

**When** a caller submits an Event using the old identifier

**Then** collection fails with `NOT_FOUND` and does not create an Event, Visitor, Identity Profile, or Analytics Session

### Invitation token lifecycle

**Given** a pending invitation with a seven-day expiry and a token stored only as a hash

**When** an authenticated recipient accepts it, repeats the same acceptance, or presents an expired or revoked token

**Then** the first valid acceptance atomically creates the resulting Membership and consumes the invitation, while every replay, expired token, or revoked token returns indistinguishable `NOT_FOUND`

### Transferable invitation bearer

**Given** a valid pending invitation token is forwarded to another person

**When** that person authenticates or signs up through Better Auth and calls `acceptInvitation`

**Then** the authenticated User becomes the fixed non-owner (`admin` or `member`) Organization member regardless of email verification or the token's delivery path, and the token is consumed exactly once

### Invitation before authentication

**Given** an unauthenticated person presents a valid invitation token

**When** they call `acceptInvitation`

**Then** the procedure returns `UNAUTHORIZED` without consuming the token, and the person may authenticate or sign up before retrying it

### Site hostname lifecycle

**Given** a Site create or update request containing a hostname with case or trailing-dot variation

**When** the Site command normalizes and checks the Organization-scoped hostname uniqueness rule

**Then** equivalent hostnames resolve to one lowercase value with any terminal DNS root dot removed, Organization-scoped duplicates return the documented conflict, and deletion remains asynchronous without exposing a removed Site as active

### Recoverable Site deletion

**Given** an active Site and an Owner who requests deletion

**When** `deleteSite` acquires the lifecycle lock

**Then** it returns HTTP `202` with `status: deleting` and an operation ID, new collection admission stops, pre-admitted candidates drain through the acceptance flush, normal Site reads and all analytics/public requests fail closed for every non-`active` state (`deleting`, `deleted`, `recovering`, and `purged`), and `getSiteDeletionStatus` exposes the asynchronous lifecycle without returning Site configuration or identifiers

### Site recovery

**Given** a Site in `deleting` or `deleted` state within its 30-day recovery window

**When** an Owner or Administrator retries `recoverSite`

**Then** it returns HTTP `202` with `status: recovering`, cancels pending deletion work under the global lifecycle lock, restores the prior Ingestion Identifier and Public Dashboard configuration, and eventually returns the Site to `active`

### Site purge and restore

**Given** a Site reaches `deleted` and its 30-day recovery deadline expires

**When** automatic purge runs or an older backup is restored

**Then** all live Site data is purged except minimal anti-resurrection tombstone/audit metadata, retained backup payloads follow normal backup retention, and restore honors the tombstone rather than resurrecting the Site or its identifiers

## Event Acceptance

### Durable singular acceptance

**Given** a valid new Event within the configured size, timestamp, policy, and rate boundaries

**When** `collectEvent` admits the normalized candidate and its sequential SQLite acceptance flush commits

**Then** it returns HTTP `200` with `accepted`, and the response does not imply that DuckDB is already queryable

### Raw payload limits

**Given** a singular raw HTTP request body over 64 KiB or a batch raw HTTP request body over 256 KiB when measured as UTF-8 bytes before JSON parsing

**When** the transport adapter checks the request before handing the parsed value to the ingestion contract

**Then** it returns `PAYLOAD_TOO_LARGE` before appending any acceptance-journal record

### Consent and privacy-signal transport

**Given** `collectionContext` with optional `consent` (`granted` or `denied`), `gpc`, and `dnt` fields, where batch context appears once on the envelope

**When** collection evaluates the request

**Then** omitted consent is not treated as opt-in, `consent: denied` is an explicit opt-out, an honored true GPC/DNT signal returns generic `FORBIDDEN`, and a batch never accepts per-item consent context

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

### Synchronous acceptance coalescing

**Given** concurrent valid new Events pass policy, identity, Session, and lifecycle admission

**When** they enter the shared FIFO coalescer

**Then** the first candidate starts a fixed 1,000 ms window, the active flush commits at 500 candidates or the deadline in one SQLite transaction, each request waits for its own candidates to commit, and the response does not imply DuckDB is already queryable

### Pending duplicate

**Given** an Event ID is reserved by a new candidate and an identical request arrives before the flush commits

**When** the owning flush commits

**Then** the first request returns `accepted`, the retry returns `duplicate` with the original Receipt Time, and only one acceptance record exists

### Flush failure and retry

**Given** a candidate is in a flush and SQLite cannot complete the outer transaction

**When** the transaction rolls back

**Then** every affected request returns top-level `SERVICE_UNAVAILABLE` (503) with no success body, failed in-memory reservations are released, and retrying by Event ID is safe

### Queue capacity

**Given** the active flush has 500 candidates and the pending queue has 1,500 unique candidates

**When** a request would require additional queue capacity

**Then** it returns top-level `SERVICE_UNAVAILABLE` (503) before admitting any eligible candidate from that request; existing queued candidates remain eligible for their next flush

### Mixed batch recovery

**Given** a bounded batch containing new, duplicate, policy-refused, and malformed Events

**When** `collectEvents` processes items independently and the request is interrupted before the response arrives

**Then** every committed candidate remains recoverable by Event ID, policy refusals use generic `rejected` results when a response is available, malformed/collision/size failures use bounded `itemError` codes, accepted candidates may be split across sequential flushes, and retrying after an interrupted or failed flush is safe by Event ID

### Batch result cardinality

**Given** a valid non-empty batch of between 1 and 100 Events within the raw UTF-8 request-byte limit

**When** `collectEvents` returns successfully

**Then** the response contains exactly one result for every input Event; an empty successful result array is invalid

### Batch envelope consistency

**Given** a batch with one Site Ingestion Identifier and at most 100 Events within the raw UTF-8 payload limit

**When** an item uses another Ingestion Identifier or the payload exceeds 256 KiB

**Then** validation rejects the batch before candidate admission and no item result is returned

### Event-kind requirements

**Given** an Event with a declared kind

**When** kind-specific required fields are missing or an unknown field is supplied

**Then** validation fails before acceptance and no durable acceptance state is written

### Contract timestamp validity

**Given** an Event, lifecycle record, or report range containing an impossible calendar date or timestamp

**When** the contract validates the request or response

**Then** validation fails rather than normalizing the value into another calendar day

### Event clock boundaries

**Given** an Event more than five minutes in the future, older than analytical Event retention, or more than fifteen minutes behind Receipt Time

**When** ingestion validates and journals the Event

**Then** future or expired Events are rejected, valid late Events are marked late while retaining their validated Occurrence Time, and Receipt Time remains the candidate-admission timestamp

### Split batch flush failure

**Given** a valid batch has eligible candidates split across two internal flushes

**When** the first flush commits and the later flush rolls back

**Then** `collectEvents` returns top-level `SERVICE_UNAVAILABLE` (503) with no results; retrying the whole request returns `duplicate` for committed Event IDs and `accepted` for uncommitted Event IDs

### In-flight deletion

**Given** a candidate crosses the shared lifecycle boundary before its Site enters `deleting`

**When** deletion marks the Site non-ingestible and the current global flush drains

**Then** the pre-admitted candidate may commit and complete its response, while all later admissions for that Site return `NOT_FOUND`

### Quiesce drain

**Given** backup, maintenance, or graceful shutdown requests write quiescence

**When** new admissions stop

**Then** the active and pending acceptance queues drain before the snapshot or close; if SQLite cannot commit the drain, the operation fails and uncommitted ingestion requests receive `SERVICE_UNAVAILABLE`

## Identity and Deletion

### Explicit identification

**Given** a valid Site Ingestion Identifier, an allowed opaque Identified User ID, and optional `collectionContext`

**When** `identify` links the current Anonymous Identity

**Then** the current Analytics Session and future Events may use the profile, unrelated anonymous history is not relabeled, omitted consent is not an opt-in, and traits remain bounded scalar values within the compact JSON UTF-8 16 KiB limit

### Deletion hiding

**Given** an Identified User deletion request

**When** SQLite commits the Identity Redaction record and overlay

**Then** profile and identity-sensitive queries hide the data immediately while deletion workers asynchronously update DuckDB projections

### Status-only inactive profiles

**Given** a profile in `deletion-requested`, `deleting`, or `deleted` state

**When** `getProfile` or `listProfiles` returns the profile

**Then** the item contains exactly its `status`; identifiers, traits, aliases, Profile Epoch history, and lifecycle timestamps are not returned

### Anonymous reclassification

**Given** a retained Event whose profile linkage was removed by Identity Redaction

**When** analytical facts are rebuilt

**Then** the Event contributes only to anonymous Site analytics when its remaining fields are non-personal, and it is excluded from Identified User-specific reports

### Monotonic deletion status

**Given** a profile in `deletion-requested`, `deleting`, or `deleted` state

**When** deletion status is queried or cleanup retries

**Then** status never moves backward, deleted profile data is not returned, and backup cleanup is reported separately from active-store completion

### Repeated profile deletion request

**Given** a profile in `deletion-requested`, `deleting`, or `deleted` state, including while cleanup is pending

**When** `requestProfileDeletion` is called again

**Then** it returns `CONFLICT` with HTTP `409` and does not create another deletion operation; the Identified User ID remains reserved through cleanup

### Separate deletion cleanup status

**Given** a deleted profile whose active-store and derived cleanup has completed while an older backup still contains its historical payload

**When** `getDeletionStatus` is queried

**Then** the response reports `derivedCleanup.status` as `complete`, `backupCleanup.status` as `pending`, and an `updatedAt` timestamp for each cleanup status without returning deleted profile data

### Profile retention redaction

**Given** an Identified User profile, Alias, or Trait whose last explicit profile activity is older than the effective `profileMonths` horizon while linked Events remain within `eventMonths`

**When** the retention boundary is applied

**Then** profile-dependent reads hide the identity data immediately, the physical cleanup is asynchronous, and retained non-personal Events remain available only as anonymous activity

### Profile-dependent retention rejection

**Given** an authenticated report that requires profile data older than the effective `profileMonths` horizon

**When** query admission runs

**Then** it returns `QUERY_LIMIT_EXCEEDED` rather than silently dropping the profile dependency; ordinary Event, Session, Visitor, Goal, Funnel, and Cohort reports continue under `eventMonths`

### Profile epoch restart

**Given** a Site-scoped Identified User ID whose previous Profile Epoch expired and was redacted

**When** the application explicitly identifies that ID again

**Then** Cimi creates a new Profile Epoch and does not restore the prior epoch's identity linkage or historical profile meaning

## Reporting

### Site-local date boundaries

**Given** a Site Reporting Timezone and an inclusive `fromDate`/`toDate` range

**When** an authenticated report runs

**Then** the query resolves the range to Site-local calendar boundaries, uses the requested procedure granularity, and rejects invalid or over-bounded ranges instead of widening them

### Authenticated report non-enumeration

**Given** an authenticated caller supplies a missing Site identifier or a Site identifier without persisted report scope

**When** an authenticated report, report definition read, or report list reaches authorization

**Then** both cases return indistinguishable `NOT_FOUND` (404); `FORBIDDEN` is reserved for a separate documented capability denial after the resource is known to exist

### Effective retention coverage

**Given** an authenticated report or comparison whose requested range is older than the effective retention of one required data dependency

**When** the report is admitted

**Then** the complete report is rejected with `QUERY_LIMIT_EXCEEDED`; the range is not clamped and no partial history is returned

### Empty and incomplete buckets

**Given** a valid timeseries range containing no Events in one or more buckets or an asynchronously incomplete current bucket

**When** the timeseries query runs

**Then** empty buckets return zero and incomplete buckets carry `complete: false`

### Minute report range and response bound

**Given** a report requested with minute granularity

**When** its inclusive `fromDate` and `toDate` span more than one Site-local calendar date or its response would contain more than 1,800 buckets

**Then** the request or response is rejected by the contract rather than widening the range or returning an unbounded series

### Per-granularity report bounds

**Given** an authenticated timeseries request with minute, hour, day, week, month, or year granularity

**When** the derived bucket count exceeds that granularity's bound of 1,800, 720, 366, 104, 36, or 10 respectively

**Then** admission returns `BAD_REQUEST` before cache or execution and does not reuse the minute bound for a coarse report

### Offset pagination

**Given** a live list ordered by its declared sort and final tie-breaker

**When** a caller supplies `offset` and `limit`

**Then** the response returns `nextOffset`, `hasMore`, and `totalCount`, and later pages may shift under concurrent ingestion without exposing an opaque cursor contract

### Query freshness without a gap

**Given** accepted Events whose DuckDB projection is asynchronous but has no relevant Projection Gap

**When** a report is queried

**Then** the response exposes projected acceptance sequence and occurrence-time coverage, reports `current` only when coverage reaches the resolved range end, and otherwise reports `stale`

### Relevant Projection Gap

**Given** a known Projection Gap for a Site whose bounded Occurrence Time interval overlaps the report's resolved half-open interval, or a Site gap whose interval cannot be bounded

**When** any authenticated report, comparison, list, stateful report, or Public Query reaches preflight, including a request with a cached result

**Then** the query checks the current gap ledger before cache or execution and returns generic `QUERY_LIMIT_EXCEEDED` without a partial or degraded report

### Projection Gap repair

**Given** a report blocked by a Projection Gap

**When** the gap is closed and every affected dependency has a rebuilt checkpoint covering the relevant accepted sequence and Occurrence Time range

**Then** the report becomes eligible for admission; unrelated Site dependencies do not require a full Site or installation rebuild

### Typed Event report filters and outputs

**Given** an authenticated Event report request with an allowlisted Event or `property.*` filter and a standard Event Kind

**When** the report validates the filter or returns a list item

**Then** unsupported scopes, fields, and malformed values are rejected, and each Event Kind exposes only its bounded typed fields without hidden identity or unsanitized private data

### Typed Event property and action-presence filters

**Given** an authenticated Event report uses a `property.*` filter or a Session `has_done`/`has_not_done` filter

**When** a property comparison supplies a compatible number, boolean, string, or explicit null, or an action-presence filter supplies a discriminated action with `range: same_range`

**Then** compatible typed values are accepted, incompatible operators are rejected, and the action-presence filter evaluates over the report's same range; Public Query does not accept these operators

### Event ordering and breakdown pagination

**Given** an authenticated Event list or breakdown request

**When** it supplies a sort

**Then** Event lists accept only Occurrence Time with Event ID as the final tie-breaker, and breakdowns accept their declared count/value sort and direction with dimension value as the stable tie-breaker; Receipt Time and Event kind are not list sort modes

### Previous-period comparison

**Given** an analytical report with an ordered previous-period comparison range

**When** the report runs

**Then** the response returns the current and comparison periods separately with their own metrics and freshness metadata; raw lists and Public Query reject comparison input

### Fact-Work preflight

**Given** a report whose projection-checkpoint-aligned cardinality statistics are stale, contains a relevant or unbounded Projection Gap, or produces Fact-Work above the fixed family budget

**When** the report is admitted

**Then** it returns `QUERY_LIMIT_EXCEEDED` before execution rather than running with an uncertain or over-budget plan

### Goal conversion semantics

**Given** a Goal with an explicit Visitor or Identified User identity kind and a matching action repeated in one Analytics Session

**When** the Goal report runs

**Then** that Session contributes at most one conversion and the response exposes conversions, eligible Sessions, and the resulting rate

### Goal denominator semantics

**Given** a Goal report with a selected identity population, Site-local interval, and authenticated filters

**When** no eligible Session remains after those predicates, or eligible Sessions remain without a matching Goal action

**Then** `eligibleSessions` is the filtered denominator, conversions count matching Sessions once, and `conversionRate` is zero when the denominator is zero

### Funnel ordering

**Given** a Funnel with two to ten distinct ordered steps and actions that repeat or cross an Analytics Session boundary

**When** the Funnel report runs

**Then** only the next matching step in the same Session advances, cross-Session continuation stops, and each step reports its entry and previous-step rates

### Funnel output shape

**Given** a persisted Funnel definition with two to ten steps

**When** its report is returned

**Then** the output contains exactly that definition's step count with unique contiguous indexes starting at zero and ordered `rateFromEntry` and `rateFromPrevious` values

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

**Given** a public query outside the 90-day range or effective retention, with a non-hour granularity, a resolved interval producing more than 2,161 hourly bucket starts, using a private/profile filter, or exceeding the shared aggregate Fact-Work budget

**When** the request is validated

**Then** it returns `BAD_REQUEST` for invalid ranges, bucket bounds, granularity, or filters, or `QUERY_LIMIT_EXCEEDED` for retention and Fact-Work admission, without evaluating private analytics filters

### Public dimension row budget

**Given** a Public Query with a non-time dimension whose result would contain more than 100 rows

**When** public admission runs

**Then** it returns typed `QUERY_LIMIT_EXCEEDED` before cache or execution; the 2,161 limit remains reserved for resolved hourly interval starts

### Public DST bucket boundaries

**Given** a valid 90-day inclusive Site-local Public Query range crossing a daylight-saving transition

**When** the server resolves the range to a half-open interval and derives hourly bucket starts

**Then** nonexistent spring-forward hours produce no bucket, repeated fall-back hours produce distinct offset-qualified keys with absolute UTC instants, and a derived count above 2,161 returns `BAD_REQUEST` before cache or execution

### Public filter allowlist

**Given** a public query filter naming a raw, profile, or otherwise non-allowlisted field

**When** the request is validated

**Then** validation rejects the filter before any private or identity-sensitive data is evaluated

### Public identity-kind segmentation

**Given** a public query using the approved `identityKind` Visitor filter or `identity_kind` dimension

**When** the filter uses only `equals` with `anonymous` or `identified`, including alongside approved Event and Session filters

**Then** the query returns only aggregate results, applies `k=5` suppression independently to each identity segment and the total, and never exposes an individual identity, profile, or identity ID

### Public identity-kind validation

**Given** a public query using a Visitor filter with an unsupported operator or value, or an individual identity/profile field

**When** the request is validated

**Then** validation returns `BAD_REQUEST` before private data is evaluated

### Public rate limit

**Given** a Site or IP has exceeded its public query rate limit

**When** another public query arrives

**Then** it returns `TOO_MANY_REQUESTS` (HTTP 429) with `Retry-After`, `X-RateLimit-Scope`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`, and does not disclose whether the requested data exists

### Public identifier revocation

**Given** a public dashboard identifier is disabled or rotated while a previously cached response exists

**When** a caller submits a new request with the old identifier

**Then** the request returns indistinguishable `NOT_FOUND`, cached content does not authorize a new request, and the public response contract emits `noindex,nofollow` without publishing a sitemap entry

## Lifecycle and Recovery

### Accept-only degraded health

**Given** SQLite is ready and DuckDB is unavailable

**When** health and collection are queried

**Then** health reports `degraded` with separate control/analytics store states, collection may durably accept Events, and every analytics read returns generic `SERVICE_UNAVAILABLE` (503) before cache or execution

### Health/readiness matrix

**Given** a health response reports `healthy`, `degraded`, `recovering`, `maintenance`, or `unavailable`

**When** its control-store, analytics-store, and cleanup fields are validated

**Then** only the documented matrix is accepted: `healthy` requires both stores ready and no cleanup, `degraded` requires accept-only analytics degradation or ready stores with cleanup pending, `recovering`/`maintenance` require a ready control store, and `unavailable` requires a non-ready control store

### Analytics read recovery

**Given** Events were durably accepted while the analytics store was unavailable

**When** DuckDB becomes ready but has not projected all accepted Events

**Then** analytics reads become eligible again and expose `stale` freshness with projected acceptance sequence and Occurrence Time coverage until projection catches up; health continues to expose the independent store states

### Analytics read during rebuild

**Given** the analytics store is `degraded`, `rebuilding`, or `unavailable`

**When** an authenticated report, analytics list, stateful report, or Public Query is requested, including when a cache entry exists

**Then** the request returns generic `SERVICE_UNAVAILABLE` (503) before cache or execution, without exposing the provider state in the error body

### Read-only backup maintenance

**Given** an installation-wide backup operation holds the lifecycle lock

**When** analytics reads, collection, and another lifecycle command arrive

**Then** analytics reads may continue, collection returns top-level `SERVICE_UNAVAILABLE` (503) with no result body, other lifecycle mutations return `CONFLICT`, and the backup captures only the authoritative SQLite generation

### Installation initialization convergence

**Given** an uninitialized installation or an installation already in the same valid current state

**When** an administrator calls `initializeInstallation`

**Then** first initialization returns HTTP `201`, convergent reuse returns HTTP `200`, both return the detailed installation body, and no existing Site or analytics data is overwritten

### Restore and rebuild

**Given** an operator confirms a compatible SQLite backup

**When** restore replays the acceptance journal and rebuilds DuckDB

**Then** the installation remains recovering until structural health checks pass, exposes progress/checkpoint/last-safe-sequence/readiness through `getBackupStatus`, may become ready with visible `cleanupPending`, and never treats DuckDB as the recovery authority

### Pre-restore safety artifact

**Given** an operator confirms a compatible SQLite backup while the installation has an active generation

**When** restore starts

**Then** it persists a separate `preRestoreSafetyArtifact` before replacing active SQLite state, keeps the selected `restoreSourceBackupId` distinct, and leaves the active generation unchanged with `INSUFFICIENT_STORAGE` (507) if the artifact cannot be created

### Restore status state machine

**Given** restore has rebuilt SQLite and DuckDB but the final structural transition has not committed

**When** `getBackupStatus` is polled

**Then** it may return `status: restoring`, `phase: ready`, `checkpoint: structurally_ready`, and ready component states; one atomic transition subsequently returns `status: available`, `phase: ready`, and a non-null `completedAt`

### Backup polling cleanup stages

**Given** a restore or retention operation has structural readiness but cleanup remains

**When** its status is polled

**Then** `derivedCleanup` and `backupCleanup` expose independent progress, timestamps, and safe errors, and historical-backup cleanup does not start until active-derived cleanup is complete

### Backup timestamp invariants

**Given** a backup status is being validated

**When** it is active or terminal

**Then** `completedAt` is null for `creating`/`restoring`, non-null for `available`/`failed`, and never precedes `createdAt`

### Incompatible backup

**Given** an operator selects a backup with an incompatible format, schema, or retention contract

**When** restore validation runs

**Then** restore returns the typed incompatibility error before replacing the authoritative SQLite generation and leaves the current installation state unchanged

### Interrupted lifecycle operation

**Given** a process crashes during backup, restore, upgrade, or cleanup

**When** the application starts again

**Then** it resumes from durable operation state, exposes recovering status, and never reports a partial generation as ready

### Explicit installation upgrade

**Given** an administrator submits `{ confirmation: "UPGRADE" }` to `upgradeInstallation`

**When** the installation is not already holding the lifecycle lock

**Then** the command returns HTTP 202, creates an authoritative SQLite safety artifact, exposes `activeOperation.kind: upgrade` and a safe operation ID through `getInstallationStatus`, and polls migration/rebuild progress without an implicit startup trigger

### Site lifecycle lock observability

**Given** Site deletion, recovery, or purge holds the installation-wide lifecycle lock

**When** `getInstallationStatus` is queried

**Then** `activeOperation.kind` identifies `site_deletion`, `site_recovery`, or `site_purge` and exposes a safe correlation ID while the detailed Site status remains on its privileged status procedure

### Upgrade rollback

**Given** an upgrade has stopped new Event admission, drained the active and pending acceptance queues, created an authoritative SQLite backup, and quiesced writes

**When** SQLite migration or the subsequent DuckDB rebuild fails

**Then** the whole pre-upgrade generation is restored and the installation does not lose an accepted Event

### Retention shortening

**Given** an administrator shortens the effective retention policy

**When** the policy commits

**Then** affected data becomes hidden immediately, physical cleanup is asynchronous, and lifecycle status reports both ordered cleanup stages without blocking the policy command on storage volume

### Retention default and override clearing

**Given** initialization omits `defaultRetention`, or an administrator updates a Site scope with `policy: null`

**When** the retention contract resolves the policy

**Then** omitted initialization stores `eventMonths: 12`, `profileMonths: 12`, and `replayMonths: null`, while Site `null` clears only the Site override and inherits the installation default; an installation-scope `null` is rejected with `BAD_REQUEST`

### Retention horizon ordering

**Given** a retention policy whose `profileMonths` exceeds `eventMonths` or whose configured `replayMonths` is greater than or equal to either non-replay horizon

**When** the policy contract validates the update

**Then** it returns `BAD_REQUEST` and does not accept the policy
