# Cimi

Domain language for Cimi's self-hosted web and product analytics product.

## Language

**Domain**:
A cohesive capability boundary that owns related concepts and invariants. A domain may contain multiple resources and API operations.
_Avoid_: route group, package, table

**Resource**:
An externally meaningful entity or operation within a domain. A resource is not required to map one-to-one to a database table or endpoint.
_Avoid_: endpoint, model

**Contract**:
The observable behavior and caller-facing boundary of a resource or domain, including its inputs, outputs, errors, side effects, and invariants.
_Avoid_: implementation interface

**Resource Specification**:
The normative documentation for one coherent API capability, including its behavior, contract, data meaning, and acceptance scenarios. A Resource Specification belongs to a bounded Domain but is stored in the central specification collection.
_Avoid_: endpoint documentation, database design

**Logical Data Contract**:
The concepts, fields, relationships, lifecycle, retention, privacy, and consistency rules that callers and domains rely on, without prescribing physical tables, indexes, migrations, or ORM models.
_Avoid_: database schema, storage implementation

**Operating Envelope**:
The documented boundary within which a Cimi installation is expected to remain operable, including host resources, installation scale, storage policy, offline behavior, recovery guarantees, and explicit non-goals for capacity and performance.
_Avoid_: service-level objective, throughput promise

**Core Operability**:
The guarantee that installation, authentication, Site management, collection, basic analytics, retention, backup, and restore function on the minimum supported host, without promising a numeric capacity or performance target.
_Avoid_: full-feature performance

**Organization**:
The collaborative ownership and access boundary for Sites. An Organization has User memberships, exactly one Owner membership, and may have additional Administrator and Member memberships.
_Avoid_: tenant, workspace

**User**:
The authenticated Cimi principal represented by Better Auth. Better Auth owns authentication mechanics and persisted Organization membership authority; Cimi enforces the persisted Organization/Site scope and lifecycle invariants. A User is distinct from a Site-scoped Identified User.
_Avoid_: account member, Identified User, unauthenticated principal

**Membership**:
The persisted relationship between one User and one Organization, carrying one Organization Role and its access scope. A Membership is not the User and is not a role by itself.
_Avoid_: Member, account, permission

**Organization Role**:
A role carried by a Membership. The canonical roles are `Owner`, `Administrator`, and `Member`; `Owner` is the singular ownership role, while `Administrator` and `Member` are separate non-owner roles.
_Avoid_: Admin, administrator account, membership

**Personal Organization**:
The designated Organization provisioned lazily for a User on the first authenticated dashboard open. It follows the normal Organization lifecycle but cannot be destructively removed while it owns Sites.
_Avoid_: default tenant

**Member**:
The canonical non-owner Organization Role carried by a Membership. Use `User` for the person and `Membership` for the persisted relationship; do not use `Member` for either.
_Avoid_: collaborator, account member

**Invitation**:
An expiring, single-use custom bearer link that carries a fixed Organization role and is accepted after the recipient authenticates or signs up. It is intentionally transferable and not bound to an email address; Better Auth owns the resulting Organization membership, while email delivery and verification are outside the core acceptance boundary.
_Avoid_: access link, invite code

**Site**:
A website or web application whose analytics belong to exactly one Organization. A Site owns its reporting timezone and week-start preference; transfer between Organizations is outside the first-release boundary. Its `Site.status` is `active`, `deleting`, `deleted`, `recovering`, or `purged`; every non-`active` Site is hidden, blocks new ingestion admission, and is non-queryable except for the privileged deletion-status surface where specified. Event candidates admitted before a deletion boundary may finish durable acceptance. Deletion is recoverable for thirty days, and purge removes live Site data while a Site Deletion Tombstone prevents resurrection from older backups.
_Avoid_: property, project

**Scoped Lifecycle Status**:
Lifecycle states are qualified by their aggregate: `Site.status`, `Profile.status`, `Installation.status`, and `AnalyticsStore.status`. `Profile.status` uses `active`, `deletion-requested`, `deleting`, or `deleted`; `derivedCleanup` and `backupCleanup` are separate Profile Cleanup Status fields, not profile lifecycle states. Bare `ready` or `recovering` is incomplete vocabulary and must be interpreted through the owning aggregate's state machine.
_Avoid_: unqualified ready, unqualified recovering, cleanup as a lifecycle state

**Reporting Timezone**:
The IANA timezone stored by a Site for resolving calendar dates, bucket boundaries, comparisons, and report labels. It defaults to UTC and is distinct from a caller's display preference.
_Avoid_: display timezone, browser timezone

**Week Start**:
The persisted Site preference for the first weekday used by weekly buckets and calendar comparisons. It is explicit rather than inferred from server or browser locale.
_Avoid_: locale week, server week

**Active Organization**:
A User's navigation and creation context. It is not an authorization boundary; resource access is checked against the persisted Organization scope and current membership.
_Avoid_: selected tenant, authorization organization

**Ingestion Identifier**:
A non-secret Site identifier embedded in browser or server telemetry requests to select the destination Site. It is not a read or management credential.
_Avoid_: API secret, access token

**Visitor**:
A Site-scoped reporting projection for one browser or device, keyed by an Anonymous Identity until explicit identification links it to an Identified User. A Visitor is not a natural-person record and is not a Cimi User.
_Avoid_: person, account, device fingerprint

**Anonymous Identity**:
A Site-scoped pseudonymous identifier persisted in first-party browser storage for the Site that sent it. It survives reloads and browser sessions until cleared, opt-out, or deletion, and is never derived as a cross-Site identifier.
_Avoid_: fingerprint, cross-site tracker

**Analytics Session**:
A contiguous interval of events for one Visitor on one Site, bounded by thirty minutes of inactivity and a twenty-four-hour maximum duration. An Analytics Session is not a Cimi authentication Session.
_Avoid_: auth session, visit without bounds

**Query Date Range**:
An inclusive pair of Site-local calendar dates resolved through the Site's Reporting Timezone. Internally it becomes a half-open interval from the first local midnight through the midnight after the final date.
_Avoid_: all-time query, timestamp range

**Effective Retention**:
The current installation/Site retention cutoff for one requested data dependency, resolved at the Site-local start of day. `eventMonths` governs Event-derived analytics, `profileMonths` governs profile-dependent data and reports, and `replayMonths` governs replay when configured. A report must have complete coverage for every requested dependency across its full current and comparison windows; effective retention is a data-availability horizon, not an automatic range clamp.
_Avoid_: partial history, query duration cap

**Query Bucket**:
A Site-local reporting period such as minute, hour, day, week, month, or year. A procedure declares its supported buckets and invalid range/bucket combinations are rejected rather than silently changed.
_Avoid_: arbitrary interval, chart bucket without a calendar

**Fact-Work Budget**:
A fixed per-procedure bound on estimated analytical work before execution. It accounts for fact cardinality, buckets, metrics, dimensions, filters, and distinct-count operations using the canonical weights of 1.0 for base facts, 0.25 for extra metrics, 0.10 for bucket work, 0.50 for dimensions, 0.25 for filters, and 1.0 for distinct-count work; an uncertain or over-budget report is rejected rather than partially evaluated.
_Avoid_: returned-row count, database-specific cost

**Metric Grain**:
The domain unit counted by a metric: Event, Analytics Session, Visitor, or Identified User. A metric's grain determines its denominator and whether values across buckets or dimensions are additive.
_Avoid_: generic count, unique users without scope

**Comparison Window**:
The immediately preceding, equal-length Site-local calendar interval used to compare an analytical report with the requested range. Current and previous ranges are returned explicitly rather than inferred by bucket position.
_Avoid_: arbitrary comparison range, delta-only comparison

**Event**:
An immutable, Site-scoped telemetry record carried by one shared strict typed envelope. It has a stable Event ID, a discriminated Event Kind, Visitor/Identified User and Analytics Session context, validated occurrence and receipt times, page and attribution context, and bounded properties. The first envelope supports `page_view`, `custom_event`, outbound, performance, and error kinds.
_Avoid_: raw hit, arbitrary payload

**Cimi Identifier**:
A Cimi-generated opaque identifier produced by the in-house prefixed generator exposed by `@cimi/utils`. Contract boundaries validate identifiers as `SId` values from one through 128 characters; the generator's prefix and encoding are implementation details, not API grammar.
_Avoid_: provider-generated ID, unbounded identifier

**Event ID**:
A caller-supplied identifier for one intended Event. Ingestion uses the Site-scoped ID for duplicate suppression and retry-safe acceptance for the full raw-event retention period; an exact retry is a duplicate and a changed payload is a conflict. It is not an authorization credential.
_Avoid_: request ID, session ID

**Event Kind**:
The bounded classification of an Event. The first standard contract includes `page_view`, `custom_event`, outbound, performance, and error kinds, each with bounded kind-specific fields under the shared Event envelope.
_Avoid_: arbitrary event name, endpoint type

**Occurrence Time**:
The client-reported time at which an Event occurred. Missing values use Receipt Time; future values beyond five minutes or values older than the analytical Event retention cutoff are rejected, while accepted arrivals more than fifteen minutes behind Receipt Time are marked late. It is distinct from Receipt Time.
_Avoid_: ingest time, trusted client time

**Receipt Time**:
The server time when Cimi admits a normalized Event candidate for processing. It is captured before the synchronous acceptance flush, provides the authoritative ingest ordering, is retained in the durable acceptance record, supplies a missing Occurrence Time, and remains available even when an occurrence time is delayed. A candidate that never commits has no durable acceptance record.
_Avoid_: client timestamp

**Event Acceptance Record**:
The durable record of a normalized Event and immutable acceptance metadata written by a committed SQLite acceptance flush before successful ingestion acknowledgment. It supports idempotent recovery but is not the queryable analytics-store commit or a transient queue item.
_Avoid_: analytics table, transient queue item

**Analytical Fact**:
A normalized, accepted Event representation used for analytical queries. It is rebuildable from Event Acceptance Records and is not the authority for collection acknowledgment, identity policy, or deletion intent.
_Avoid_: raw request body, acceptance record, report snapshot

**Analytical Projection**:
A derived read model computed from Analytical Facts, such as a session, aggregate, Goal, Funnel, Cohort, or report index. It may be regenerated without changing accepted Event meaning.
_Avoid_: source of truth, immutable Event, query cache

**Identity Projection**:
A derived DuckDB dimension for analytical identity filtering, rebuilt from SQLite-canonical Identity Profiles, aliases, and deletion state. It is not the authority for identity mutation or deletion intent.
_Avoid_: identity source of truth, copied profile authority

**Query Freshness**:
The boundary through which a report or query surface reflects accepted Events. It exposes projected acceptance sequence and occurrence-time coverage; no-gap projection lag may produce a `stale` report, while a relevant Projection Gap blocks the report before execution. Query Freshness is distinct from collection acknowledgment and may advance asynchronously.
_Avoid_: receipt time, ingestion success, report correctness

**Projection Gap**:
A known accepted Event sequence that has not been materialized into one or more analytical read models because projection was quarantined. A gap is relevant when its Occurrence Time interval overlaps any resolved half-open current or comparison interval for the same Site; if that interval cannot be bounded, the whole Site is blocked until repair. A relevant gap returns `QUERY_LIMIT_EXCEEDED` before cache or report execution, and affected dependencies become queryable again only after the gap closes and their rebuilt checkpoints cover the relevant sequence and time range.
_Avoid_: rejected Event, missing acceptance, silent data loss

**Site Deletion Tombstone**:
A Site-scoped canonical lifecycle record that makes deleted data invisible immediately in the live installation and prevents normal replay or backup restore from reactivating the Site while physical cleanup proceeds asynchronously. Restoring an older backup may temporarily rehydrate or expose historical payload while cleanup catches up; the tombstone still prevents Site activation and normal collection, query, or Public Query visibility, and cleanup-pending state is reported. Backup copies follow their normal retention policy. `Deletion Tombstone` is shorthand only when the Site scope is explicit.
_Avoid_: hard-delete request, query filter only

**Profile Cleanup Status**:
A profile-scoped pair of statuses that independently reports whether active derived results and historical backup payloads require cleanup. Each status is `not-required`, `pending`, or `complete` with its own update time; backup cleanup may remain pending after live deletion completes.
_Avoid_: installation health, profile deletion status

**Identity Redaction**:
A SQLite-canonical overlay that removes an expired or deleted Identified User's profile, alias, trait, and identity linkage from analytical meaning without rewriting accepted Event sequence history. Retained Events may continue as anonymous activity when their remaining fields are not personal.
_Avoid_: mutable Event history, profile archive, hard delete only

**Profile Deletion Semantics**:
Profile deletion is represented by `Profile.status`, Identity Redaction, and Profile Cleanup Status. It does not create a Site Deletion Tombstone; no profile tombstone is implied unless a separate persisted profile marker is explicitly introduced.
_Avoid_: profile tombstone, Site Deletion Tombstone for a profile

**Contract Error Code**:
A stable typed semantic identifier declared by an RPC Procedure for a defined failure condition. It is distinct from the transport HTTP status and from the human-readable message.
_Avoid_: HTTP status, status text, exception name

**HTTP Status**:
The transport-level status mapped from a declared contract error code. It communicates protocol class, but does not replace the procedure's typed error code in normative behavior or acceptance documentation.
_Avoid_: contract error code, batch result status

**Event Batch**:
A separate non-atomic collection request containing up to one hundred Events for one Site and no more than 256 KiB measured as raw UTF-8 bytes before JSON parsing. Boundary failures reject the request before results; otherwise each item receives its own `accepted`, `duplicate`, generic policy `rejected`, or bounded `itemError` outcome and counts separately against ingestion protection buckets. Policy refusals and item errors are not acceptance records and are re-evaluated on retry. It is distinct from Cimi's internal acceptance flush.
_Avoid_: transaction, bulk import

**Acceptance Flush**:
An internal sequential SQLite transaction containing normalized Event candidates admitted through the installation-wide acceptance coalescer. The first candidate opens a fixed coalescing window, candidates are ordered by admission, and the flush either commits all its candidates or commits none. It is not a public Event Batch, an acknowledgment by itself, or an analytics-store projection.
_Avoid_: Event Batch, in-memory acknowledgment, report freshness

**Batch Item Outcome**:
The per-Event result in a successfully boundary-validated Event Batch. `accepted` and `duplicate` identify committed or previously committed acceptance records; `rejected` and `itemError` are response-only outcomes and never create acceptance records. All four are item outcomes, not top-level HTTP errors; a batch may return them independently in its normal HTTP 200 response.
_Avoid_: top-level error, HTTP response, batch transaction result

**Collection Policy Rejection**:
A valid Event refused by the effective Site collection policy before Visitor, Identified User, or Analytics Session assignment. Singular collection returns a generic 403 and creates no identity or Session state.
_Avoid_: validation error, authorization grant

**Attribution**:
Approved referrer, campaign, device, and coarse location context captured at Analytics Session entry. Same-Site referrals are normalized away, and the Session-entry values remain stable for that Session.
_Avoid_: raw URL metadata, last-touch attribution

**Identified User**:
A Site-scoped stable opaque identifier explicitly supplied by the instrumented application to represent its own application user. It is distinct from a Cimi User, is never inferred from authentication, and may link that application user across devices on the same Site only after explicit identification on each device.
_Avoid_: Cimi User, email identity

**Trait**:
Optional scalar metadata explicitly attached to an Identified User via identification. A Trait value may be a string, number, boolean, or null as a removal marker, is bounded by a small serialized size limit, and never inferred from authentication, URLs, referrers, or event properties.
_Avoid_: inferred profile, event property

**Alias**:
A Site-scoped link from one Anonymous Identity to one Identified User that makes the current Analytics Session from its beginning and future activity for that browser attributable to the Identified User according to the linking rule; prior Sessions remain anonymous.
_Avoid_: merge, identity graph

**Profile Epoch**:
One lifecycle of a Site-scoped Identified User profile. When profile retention expires, the prior epoch is redacted and a later explicit identification starts a new epoch; retained Events from the prior epoch remain anonymous.
_Avoid_: restored profile, identity resurrection

**Capability**:
A coherent user-recognizable outcome Cimi offers, which may span multiple Domains, Resources, API operations, and stored concepts. A Capability is the unit used to decide release scope.
_Avoid_: feature checkbox, endpoint

**Capability Disposition**:
The first-release decision assigned to a Capability: Required, Deferred, or Excluded. Required capabilities support the release promise and pass all hard gates; Deferred capabilities remain viable but are not in the first release; Excluded capabilities are outside the intended product or operating boundary.
_Avoid_: priority, implementation status

**Hard Gate**:
A non-negotiable product, privacy, security, dependency, contract, or operating-envelope condition that a Capability must satisfy before it can be Required. A score cannot override a failed Hard Gate.
_Avoid_: recommendation, soft constraint

**Capability Selection Rubric**:
The auditable method for assigning a Capability Disposition using evidence, Hard Gates, and a weighted coarse score for user value, core-loop fit, trust and privacy alignment, implementation simplicity, storage and operational burden, and dependency readiness.
_Avoid_: roadmap ranking

**Public Dashboard**:
An unauthenticated, read-only presentation of a Site's approved aggregate analytics through a Site-wide Public Dashboard Identifier. It is separate from Organization membership and does not expose member-only analytics resources.
_Avoid_: public Site API, shared account

**Identity-Kind Segmentation**:
A Public Query aggregate split or filter over the two public identity states, `anonymous` and `identified`. It never selects an individual Visitor, Identified User, profile, or identity ID, and each segment remains subject to the Public Dashboard suppression threshold.
_Avoid_: identity selection, public profile filter

**Public Dashboard Identifier**:
A random Site-specific identifier used in an open public dashboard URL. It is distinct from the Site ID and Ingestion Identifier, is not a management credential, and is invalidated when public access is disabled or the identifier is rotated.
_Avoid_: API key, ingestion secret

**Public Query**:
A dedicated aggregate analytics query governed by the Public Dashboard contract: an approved filter and metric catalog, one-hour granularity, a maximum 90-day Site-local calendar window further bounded by Effective Retention, at most 2,161 actual hourly interval starts after timezone resolution, small-cohort suppression, and public-specific rate limits. Spring-forward gaps are omitted and fall-back hours remain distinct; a derived count above 2,161 returns `BAD_REQUEST` before cache or execution and is never clamped. It is not an authenticated analytics query with its authorization removed.
_Avoid_: public API passthrough, unrestricted report query

**RPC Procedure**:
A Cimi operation declared for external calling in the contract-first oRPC tree with typed input, typed output, declared errors, authorization posture, and explicit OpenAPI route metadata. The declaration becomes served only after a runtime handler is registered and its authorization, persistence, lifecycle, transport, and error boundaries are implemented. An RPC Procedure is an operation contract, not a REST resource route.
_Avoid_: REST endpoint, controller method

**Procedure Version**:
A separately contracted version of an RPC Procedure introduced only when its input, output, or behavior changes incompatibly. The initial Procedure is unversioned; compatible additive changes remain on it, and breaking successors use `V2` or later before old versions are deprecated and removed.
_Avoid_: API release version, database migration

**Offset Page**:
A zero-based paginated result selected by `offset` and `limit`, ordered only by a procedure's allowlisted sort fields followed by a stable ID tie-breaker. Offset pages are live and may shift while new data is ingested.
_Avoid_: page number, opaque cursor

**Query Filter**:
A bounded JSON predicate with an explicit `event`, `session`, `visitor`, or `profile` scope and a procedure-specific field/operator allowlist. Different filters combine with AND, repeated values within one field combine with OR, and unknown fields/operators are invalid.
_Avoid_: arbitrary expression, SQL predicate
