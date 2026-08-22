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
The collaborative ownership and access boundary for Sites. An Organization has Members, exactly one Owner, and may have additional Administrators and Members.
_Avoid_: tenant, workspace

**Personal Organization**:
The designated Organization provisioned lazily for a User on the first authenticated dashboard open. It follows the normal Organization lifecycle but cannot be destructively removed while it owns Sites.
_Avoid_: default tenant

**Member**:
A User's active membership in an Organization, carrying an Organization role that determines which Organization and Site operations the User may perform.
_Avoid_: collaborator, account member

**Invitation**:
An expiring, single-use bearer link that carries a fixed Organization role and is accepted after the recipient authenticates or signs up.
_Avoid_: access link, invite code

**Site**:
A website or web application whose analytics belong to exactly one Organization. Site transfer between Organizations is outside the first-release boundary.
_Avoid_: property, project

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

**Event**:
An immutable, Site-scoped telemetry record carried by one shared typed envelope. It has a stable Event ID, a discriminated Event Kind, Visitor/Identified User and Analytics Session context, validated occurrence and receipt times, page and attribution context, and bounded properties.
_Avoid_: raw hit, arbitrary payload

**Event ID**:
A caller-supplied identifier for one intended Event. Ingestion uses it for duplicate suppression and retry-safe acceptance within the configured deduplication window; it is not an authorization credential.
_Avoid_: request ID, session ID

**Event Kind**:
The bounded classification of an Event. The first standard contract includes `page_view`, `custom_event`, outbound, performance, and error kinds, each with bounded kind-specific fields under the shared Event envelope.
_Avoid_: arbitrary event name, endpoint type

**Occurrence Time**:
The client-reported time at which an Event occurred. Cimi accepts it only inside a configured clock-skew window and identifies late arrivals; it is distinct from Receipt Time.
_Avoid_: ingest time, trusted client time

**Receipt Time**:
The server time when Cimi accepts an Event for processing. It provides the authoritative ingest ordering and remains available even when an occurrence time is absent, delayed, or rejected.
_Avoid_: client timestamp

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
A Site-scoped link from one Anonymous Identity to one Identified User that makes past and future activity for that browser attributable to the Identified User according to the linking rule.
_Avoid_: merge, identity graph

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

**Public Dashboard Identifier**:
A random Site-specific identifier used in an open public dashboard URL. It is distinct from the Site ID and Ingestion Identifier, is not a management credential, and is invalidated when public access is disabled or the identifier is rotated.
_Avoid_: API key, ingestion secret

**Public Query**:
A dedicated aggregate analytics query governed by the Public Dashboard contract: an approved filter and metric catalog, one-hour granularity, a bounded time window, small-cohort suppression, and public-specific rate limits. It is not an authenticated analytics query with its authorization removed.
_Avoid_: public API passthrough, unrestricted report query

**RPC Procedure**:
An externally callable Cimi operation defined in the contract-first oRPC tree with typed input, typed output, declared errors, authorization posture, and explicit OpenAPI route metadata. An RPC Procedure is an operation contract, not a REST resource route.
_Avoid_: REST endpoint, controller method

**Procedure Version**:
A separately contracted version of an RPC Procedure introduced only when its input, output, or behavior changes incompatibly. The initial Procedure is unversioned; compatible additive changes remain on it, and breaking successors use `V2` or later before old versions are deprecated and removed.
_Avoid_: API release version, database migration

**Cursor**:
An opaque pagination continuation containing the declared sort position and stable `createdAt` tie-breaker. A Cursor is valid only with the same procedure, filters, and sort contract that produced it.
_Avoid_: page number, offset

**Query Filter**:
A typed, procedure-specific selection from an explicit field/operator allowlist. Different filter fields combine with AND, repeated values within one field combine with OR, and unknown fields/operators are invalid.
_Avoid_: arbitrary expression, SQL predicate
