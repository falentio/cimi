I have everything I need. Here are my findings.

---

## Components Found

### 1. Event ingestion resource (`apps/api/src/resources/event-ingestion/`)

| File | Role |
|---|---|
| `service.ts` (862 L) | `EventIngestionService` — `collectEvent` / `collectEvents`, policy admission, normalization, identity resolution |
| `repository.ts` (97 L) | Ports + types: `AcceptanceRepository`, `AcceptanceCandidate`, `AppendOutcome`, `NormalizedEvent` |
| `repository.drizzle.ts` (402 L) | `AcceptanceRepositoryDrizzle` — the real journal writer |
| `coalescer.ts` (536 L) | `AcceptanceCoalescer` — in-memory FIFO, assigns `replaySequence`, owns the flush |
| `router.ts` (29 L) | oRPC handlers |
| `index.ts` (223 L) | `createEventIngestion({...})` factory + re-exports |
| `fingerprint.ts` (24 L) | `fingerprintAcceptedEvent` — sha256 over canonical JSON |
| `identity-session.ts` (368 L) | `DefaultIdentitySessionResolver` |
| `retention-cleanup.ts` (764 L) | `AcceptanceRetentionCleanup` |

Note: `service.ts` never calls `acceptance.append` directly. It calls `coalescer.reserveMany(...)`, and the **coalescer** calls `repository.append` at `coalescer.ts:393-394`.

### 2. `accepted_event` — 26 columns

Declared in `packages/db/src/schema/collection.ts:65-123` (`TAcceptedEvent`, table name `accepted_event`). Exactly 26 columns:

| # | TS field | SQL column | Nullable |
|---|---|---|---|
| 1 | `eventPk` | `event_pk` | PK, autoincrement |
| 2 | `siteId` | `site_id` | NOT NULL, FK→`site.id` (restrict) |
| 3 | `eventId` | `event_id` | NOT NULL |
| 4 | `eventKind` | `event_kind` | NOT NULL, enum `EVENT_KINDS` |
| 5 | `anonymousIdentityId` | `anonymous_identity_id` | nullable |
| 6 | `pageViewId` | `page_view_id` | nullable |
| 7 | `occurrenceTime` | `occurrence_time` | NOT NULL, ts_ms |
| 8 | `receiptTime` | `receipt_time` | NOT NULL, ts_ms |
| 9 | `late` | `late` | NOT NULL bool, default `false` |
| 10 | `visitorId` | `visitor_id` | nullable |
| 11 | `identifiedUserId` | `identified_user_id` | nullable |
| 12 | `analyticsSessionId` | `analytics_session_id` | nullable |
| 13 | `botPolicyOutcome` | `bot_policy_outcome` | NOT NULL enum `included`\|`recorded_excluded`, default `included` |
| 14-16 | `utmSource`/`utmMedium`/`utmCampaign` | `utm_*` | nullable |
| 17 | `deviceType` | `device_type` | nullable |
| 18 | `browser` | `browser` | nullable |
| 19 | `operatingSystem` | `operating_system` | nullable |
| 20 | `country` | `country` | nullable |
| 21 | `policyRevisionId` | `policy_revision_id` | NOT NULL, FK→`collection_policy_revision.id` (restrict) |
| 22 | `replaySequence` | `replay_sequence` | NOT NULL, **unique** |
| 23 | `payloadFingerprint` | `payload_fingerprint` | NOT NULL |
| 24 | `projectionState` | `projection_state` | NOT NULL enum `pending`\|`projected`\|`failed`, default `pending` |
| 25 | `projectedAt` | `projected_at` | nullable ts_ms |
| 26 | `createdAt` | `created_at` | NOT NULL ts_ms |

**Indexes** (`collection.ts:105-122`):
- `accepted_event_site_event_unique` — unique on `(site_id, event_id)` ← the dedup key
- `accepted_event_anonymous_identity_idx` — `(site_id, anonymous_identity_id)`
- `accepted_event_page_view_unique` — unique partial on `(site_id, page_view_id) WHERE page_view_id IS NOT NULL`
- `accepted_event_site_occurrence_idx`, `accepted_event_site_receipt_idx`
- `accepted_event_identity_idx` — `(site_id, visitor_id, identified_user_id)`
- `accepted_event_session_idx` — `(site_id, analytics_session_id)`
- `accepted_event_acceptance_metadata_unique` — unique on `(event_pk, replay_sequence, payload_fingerprint, receipt_time, policy_revision_id)` ← this is the FK target of `event_acceptance_journal`

Note **no FK on installation** — site + policy revisions are the only FKs, and both are `restrict`.

### 3. `repository.append` — the transaction shape

`AcceptanceRepositoryDrizzle.append`, `repository.drizzle.ts:153-161`:

```ts
async append(candidates: readonly AcceptanceCandidate[]): Promise<readonly AppendOutcome[]> {
  const flushId = randomUUID()
  const outcomes = this.db.transaction((tx) =>
    candidates.map((candidate) => appendCandidate(tx, candidate, flushId)),
  )
  return outcomes
}
```

One **synchronous better-sqlite3/drizzle transaction per flush**, all-or-none, one `flushId` (UUID) shared by every candidate in the batch. The callback is synchronous (no `await`), and `.map` preserves input order so outcome index ↔ candidate index.

`appendCandidate` (`repository.drizzle.ts:217-324`) does, per candidate:

1. **Duplicate pre-check** — `SELECT receipt_time, payload_fingerprint FROM accepted_event WHERE site_id = ? AND event_id = ? LIMIT 1` (lines 226-239). If found: same fingerprint → `{status:'duplicate', receiptTime}`; different → `{status:'conflict'}`. Returns early, writes nothing.
2. **Page-view pre-check** — only when `event.kind === 'page_view'`, same shape keyed on `page_view_id` (lines 247-268).
3. **Insert `accepted_event`** (lines 270-300) with `.returning({ eventPk })`. `projectionState: 'pending'`, `projectedAt: null`, `createdAt = receiptTime`, `pageViewId` set only for page_view (else `null`).
4. **Insert `event_payload`** (lines 304-306) — `canonicalPayloadJson: JSON.stringify(event)` — the full normalized event, not the raw request.
5. **`appendKind`** (lines 326-366) — exactly one row into one of the 5 per-kind tables. `page_view` writes `pagePath: event.pagePath ?? '/'`. Exhaustive `switch` with `const exhaustive: never = event` guard.
6. **`appendProperties`** (lines 368-402) — one `event_property` row per key; value is bucketed into `value_type` ∈ `string|number|boolean|null` with the other two value columns forced `NULL` (the DB enforces this via `event_property_typed_value_check`, `collection.ts:188-191`). Uses `isStringValue` / `isNumberValue` from `@cimi/utils`.
7. **Insert `event_acceptance_journal`** (lines 309-321) — `acceptanceState: 'accepted'`, `projectionState: 'pending'`, `committedAt = receiptTime`, plus the shared `flushId`.

If step 3 returns no row it throws `'Accepted Event insert returned no row'` (line 302).

`AppendOutcome` (`repository.ts:76-79`):
```ts
type AppendOutcome =
  | { readonly status: 'accepted' }
  | { readonly status: 'duplicate'; readonly receiptTime: string }
  | { readonly status: 'conflict' }
```

### 4. Per-kind tables + `event_property`

All in `packages/db/src/schema/collection.ts`, each with `eventPk` as PK and `ON DELETE CASCADE` to `accepted_event.event_pk`:

| Table | Lines | Columns |
|---|---|---|
| `event_payload` | 125-130 | `event_pk`, `canonical_payload_json` |
| `event_page_view` | 132-138 | `event_pk`, `page_path` (NOT NULL), `referrer` |
| `event_custom` | 140-145 | `event_pk`, `name` |
| `event_outbound` | 147-153 | `event_pk`, `destination`, `name` |
| `event_performance` | 155-162 | `event_pk`, `name`, `value` (real), `unit` |
| `event_error` | 164-171 | `event_pk`, `name`, `code`, `message` |
| `event_property` | 173-193 | PK `(event_pk, property_key)`, `value_type`, `string_value`, `number_value`, `boolean_value`, idx `event_property_key_idx` |
| `event_acceptance_journal` | 195-238 | see below |

`event_acceptance_journal` columns: `event_pk` (PK, cascade), `replay_sequence` (unique), `payload_fingerprint`, `receipt_time`, `policy_revision_id`, `acceptance_state` (`accepted`), `projection_state`, `committed_at`, `flush_id`. It carries a composite FK `event_acceptance_journal_metadata_fk` back to the 5-tuple on `accepted_event` (lines 221-237).

### 5. The coalescer owns `replaySequence`

`AcceptanceCoalescer.reserveMany` (`coalescer.ts:142-256`) is the only writer of `replaySequence` — line 206: `replaySequence: ++this.sequence`, where `sequence` is seeded from `repository.lastReplaySequence()` (`coalescer.ts:339-354`, which reads `max(replay_sequence)` from **`event_acceptance_journal`**, not from `accepted_event`). `receiptTime` is also defaulted here (line 205).

Flush triggers (`flushActive`, `coalescer.ts:377-456`):
- splice `flushMaxEvents` (500) from `active`
- call `this.repository.append(batch.map(({ candidate }) => candidate))` (line 393-394)
- resolve each candidate's deferred with `accepted`/`duplicate`, reject on `conflict` (`AcceptanceReservationConflictError`)
- delete reservations in `finally`, then `activatePending()`

`flush()` / `stop()` / `drain()` at lines 258-293. Log operation string is `event-ingestion.flush` (`coalescer.ts:496`).

Window constants come from `@cimi/contract`: `EVENT_ACCEPTANCE_WINDOW_MS` (1000), `EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS` (500), `EVENT_ACCEPTANCE_PENDING_MAX_EVENTS` (1500).

`acceptanceReservationKey` (`coalescer.ts:512-520`): `page-view:<pageViewId>` for page_view, else `event:<eventId>`.

### 6. The discriminated union — three declarations

1. **Contract (valibot variant)** — `packages/contract/src/contract/event-ingestion/schema.ts:73-105`, `export const SEvent = v.variant('kind', [...])` with 5 `v.strictObject` branches. Shared fields in `SEventCommonFields` (lines 58-71): `eventId`, `ingestionIdentifier`, `occurrenceTime?`, `pagePath?`, `referrer?`, `identifiedUserId?`, `anonymousIdentityId?`, `utm*`, `properties?`, `collectionContext?`. Per-kind: `page_view` (`pageViewId?`, `pagePath` required), `custom_event` (`name`), `outbound` (`destination`, `name?`), `performance` (`value`, `unit?`), `error` (`code?`, `message?`). `SEventKind = v.picklist(EVENT_KINDS)` at `packages/contract/src/schema/index.ts:169`. `SId` for ids, `SDateTime`, `SName`, `SScalarKey` validators.
2. **`EventInput`** — `repository.ts:6`, `InferOutput<typeof SEvent>`.
3. **`NormalizedEvent`** — `repository.ts:8-32`, a hand-written TS discriminated union over the same 5 kinds intersected with `NormalizedEventCommon` (`repository.ts:34-48`). Note it renames `os` from the transport, and every field is `readonly`.

`EVENT_KINDS` lives in `packages/utils/src/event-filter/index.ts:3-9` (`page_view`, `custom_event`, `outbound`, `performance`, `error`), re-exported from `packages/utils/src/index.ts:111`, and consumed as the drizzle enum at `packages/db/src/schema/collection.ts:74`.

### 7. Personal organization

`OrganizationService.ensurePersonal`, `apps/api/src/resources/organization/service.ts:98-171`. Route: `POST /organization/ensurePersonalOrganization` (`packages/contract/src/contract/organization/command/ensure-personal-organization.ts:17-34`, input is an **empty strict object** `{}`, output is `SOrganization`, auth `authenticated`). Handler at `organization/router.ts:16-18`.

Signature: `ensurePersonal(_input, user: Pick<AuthUser,'id'|'name'>, headers: Headers): Promise<SOrganizationEnsurePersonalOutput>`.

Flow:
1. `repository.findPersonalByOwner(user.id)` — if found → `reusePersonal` (lines 173-182: `reconcileOrganization` → `assertReadable` → `toOrganization`).
2. Slug is deterministic: `` `personal-${user.id}` `` (line 107), name `` `${user.name}'s Organization` `` (line 108).
3. `authority.getOrganizationBySlug({slug, headers})` — if absent, `authority.createOrganization({name, slug, ownerUserId})`, then `listAllMembers`, then `assertAuthorityOwner` (throws `CONFLICT` unless exactly one owner == the user). A thrown create falls back to re-reading by slug (lines 127-138).
4. `repository.insertWithOwner({...isPersonal: true}, {userId, now})` (lines 148-160). `id: generateId('org')`, `name` copied from the **authority** organization (not the local string), `authorityOrganizationId`, `ownerUserId`.
5. On insert failure: re-read `findPersonalByOwner`; if a concurrent winner exists, reuse it (line 166); else `CONFLICT` on a constraint error.

**It creates no site.** The only `site` writes in the whole flow are the FK checks inside `insertWithOwner`. Uniqueness is enforced at the DB layer: `organization_personal_owner_unique` — unique on `owner_user_id WHERE is_personal = 1` (`packages/db/src/schema/governance.ts:28-30`), plus `membership_one_owner_unique` on `organization_id WHERE role = 'owner'` (lines 50-52).

Lazily ensured by the web client: `loadWorkspaceData` in `apps/web/app/composables/useWorkspaceData.ts:78-108` calls `ensureInstallation` (admin only) then `ensurePersonalOrganization` then `listOrganizations`, then per-org `listSites`.

Reads guard on the owner invariant: `assertReadable` → `repository.isOwnerInvariantValid` → `isOwnerInvariantValid` (`apps/api/src/resources/organization/owner-invariant.ts:4-26`), which requires exactly one `owner` membership whose `userId` equals `organization.owner_user_id`.

### 8. Auth hooks

`packages/auth/src/first-user-admin.ts` — `firstUserAdmin(): BetterAuthPlugin` (30 lines total). Registers `databaseHooks.user.create.after` in `init(ctx)`; counts users via `ctx.adapter.count({model:'user'})` and if `count === 1` promotes via `ctx.adapter.update({model:'user', where:[{field:'id', value:user.id}], update:{role:'admin'}})`.

Registered in `createAuth` at `packages/auth/src/server.ts:46`, third in the `plugins` array after `admin()` and `organization({ allowUserToCreateOrganization: false, schema: { organization/modelName:'authOrganization', member:'authMember', invitation:'authInvitation' } })`.

**This is the only database hook in the repo** — grep for `databaseHooks` outside tests returns exactly one hit, `first-user-admin.ts:9`. A deferred post-ensure hook would be a new `init(ctx)` block on the same plugin shape (or a second `BetterAuthPlugin` appended to `plugins`), riding the `user.create.after` hook. Nothing currently bridges auth signup → `ensurePersonal`; that coupling is done client-side by `loadWorkspaceData`.

### 9. Site resource

`SiteService.create`, `apps/api/src/resources/site/service.ts:91-118`:
1. `reconcileOrganization` (membership), then `assertOrganizationRole(user, organizationId, scope, { requiredRole:'admin', missingCode:'NOT_FOUND' })`
2. `repository.insert({ id: generateId('ste'), organizationId, name, hostname: canonicalizeHostname(input.hostname), ingestionIdentifier: generateId('ing'), reportingTimezone: 'UTC', weekStartsOn: 'monday', createdAt, updatedAt })`
3. catches `isConstraintError` (regex `/constraint|unique|reserved/i`) → `ORPCError('CONFLICT', {status:409})`

`SiteRepositoryDrizzle.insert`, `apps/api/src/resources/site/repository.drizzle.ts:89-135`:
- opens `this.db.transaction`
- **tombstone pre-check first**: select from `TSiteTombstone` where `organization_id` + `hostname` match → throws `'Site hostname is reserved by a tombstone'` (line 103)
- insert into `TSite` with `status:'active'`, all lifecycle columns null, `cleanupStatus:'not-required'`
- also inserts `TProjectionCheckpoint` (line 134)

Hostname uniqueness: `uniqueIndex('site_organization_hostname_unique').on(organizationId, hostname)` (`packages/db/src/schema/governance.ts:214`) — unique per **organization**, not global. Canonicalization via `canonicalizeHostname` (`apps/api/src/resources/site/service.ts:107`, 132). `ingestionIdentifier` is globally `.unique()` (line 185).

`TSiteTombstone` (`governance.ts:281-298`): `site_id` (PK), `organization_id`, `hostname`, `purge_operation_id`, `purged_at`, `created_at`; unique on `(organization_id, hostname)`; check `purged_at >= created_at`. Written by purge at `repository.drizzle.ts:635-636`.

Site lifecycle statuses: `active | deleting | deleted | recovering | purged`, default `active` (`governance.ts:192-196`). `SiteService.delete` is Owner-only and goes through `withLifecycleLease('site_deletion', ...)` which acquires the shared `LifecycleLock` and rejects incompatible active operations.

Ingestion port for event ingestion: `createSiteIngestionPort` (`apps/api/src/resources/site/ingestion-port.ts:8-25`) exposes only `findActiveByIngestionIdentifier` → `{ id, hostname, reportingTimezone }`.

### 10. Existing seeding code — none in production

- No `demo`/`fabricated`/`seedData`/`seeder` anywhere in `apps`, `packages`, `scripts`, `tools`.
- The two closest things are **test-only fixtures**:
  - `apps/api/src/testing/reporting-fixture.ts` — `createOwnerSite` (27-56), `seedRetentionCutoff` (63-114), `seedAcceptedEvents` (141-219), `insertProperty` (221-242), `readEventPk` (244-253), `readMaxReplaySequence` (255-262), `ensurePolicyRevision` (264-292).
  - `apps/api/e2e/fixture.ts` — live e2e app fixture.
- `apps/api/src/resources/organization/fixture.ts` — `createOrganizationFixture` with `vitest-mock-extended` mocks (sociable-test convention).
- `vp` has no seeding task (`vite.config.ts` only sets `tasks: true`).

---

## Flow

### Append path (real, production)

```
POST /event-ingestion/collectEvent|collectEvents        router.ts:13-18
  └─ EventIngestionService.collectEvent|collectEvents   service.ts:173 / 273
     └─ withAdmissionLease(ingestionIdentifier, ...)    service.ts:674-693   (LifecycleLock 'ingestion')
        ├─ resolveSite → sites.findActiveByIngestionIdentifier  :479
        ├─ consumeProtection(siteId, sourceIp, units)  :655-666
        ├─ acceptance.findByEventId(siteId, eventId)   :490  → duplicate short-circuit
        ├─ findByPageViewId (page_view only)           :498
        ├─ coalescer.pendingReservation(...)           :366
        ├─ prepare(input, site, request)               :506-607
        │    ├─ retention.effective(site.id)
        │    ├─ collectionPolicy.admit({...})          :514-526  → PolicyRejectionError → 403
        │    ├─ occurrence bounds (≤ +5min, ≥ cutoff)  :530-544
        │    ├─ sanitizeDestination (outbound)         :546-551
        │    ├─ deriveAttribution                       :553
        │    ├─ deriveAnonymousIdentityId(eventId)      :555-556
        │    ├─ normalizeEvent(...) → NormalizedEvent    :558 / 751-830
        │    └─ identitySession.resolve(...) → visitorId/analyticsSessionId  :571
        └─ coalescer.reserveMany([candidate])          :668 / coalescer.ts:142
             ├─ ensureSequence() → repository.lastReplaySequence()   :339
             ├─ replaySequence = ++this.sequence                     :206
             ├─ active/pending queue, startTimer(1000ms)             :213-251
             └─ flushActive()                                        :377
                  └─ repository.append([candidates])                 :393
                     └─ db.transaction(tx => candidates.map(appendCandidate))  repo.drizzle.ts:156
                          ├─ dup pre-check (site_id+event_id)
                          ├─ dup pre-check (site_id+page_view_id)  [page_view]
                          ├─ INSERT accepted_event  → eventPk
                          ├─ INSERT event_payload
                          ├─ INSERT one per-kind table
                          ├─ INSERT event_property × N
                          └─ INSERT event_acceptance_journal (flushId)
```

### Append path a seeding service would use

Short version: bypass `EventIngestionService` and construct `AcceptanceCandidate`s, then hand them to `AcceptanceRepositoryDrizzle.append` (or to `AcceptanceCoalescer.reserveMany` if you want the sequence/fingerprint bookkeeping done for you).

```ts
const repository = new AcceptanceRepositoryDrizzle({ db })

const outcomes = await repository.append([{
  siteId,                                   // must exist in site, status must allow the FK
  event: {                                   // NormalizedEvent — kind-discriminated
    eventId, occurrenceTime: isoString,
    identifiedUserId: null, anonymousIdentityId: null,
    properties: {},                          // scalar-valued only
    kind: 'custom_event', name: 'signup',
    utmSource: null, utmMedium: null, utmCampaign: null,
    deviceType: null, browser: null, os: null, country: null,
    botPolicyOutcome: 'included',
  },
  receiptTime: isoString,
  late: false,
  policyRevisionId,                          // MUST already exist in collection_policy_revision
  payloadFingerprint,                        // sha256 hex; any string works unless dedup matters
  visitorId: null,
  analyticsSessionId: null,
  replaySequence: n,                         // MUST be globally unique, incl. vs. journal rows
}])
```

Hard prerequisites a seeder must satisfy:
1. A row in `collection_policy_revision` (NOT NULL FK). Migration `0011_seed_collection_policy_defaults.sql` backfills one `installation`-scope revision per installation row. Tests bypass this with `ensurePolicyRevision` (`reporting-fixture.ts:264-292`), or find one via `SELECT id FROM collection_policy_revision LIMIT 1`.
2. A `site` row the events can reference (FK `restrict`, no cross-check against `status` at the DB level — but `site.status != 'active'` will make reads fail).
3. A globally-free `replay_sequence`. Note `lastReplaySequence()` reads `max(replay_sequence)` from **`event_acceptance_journal`**, while the constraint is on `accepted_event.replay_sequence` — so if you insert journal rows, keep the two in sync. `reporting-fixture.ts:255-262` reads it off `accepted_event` instead and is off-by-N if journal rows exist.
4. If the seeded events should be queryable downstream, the projection path needs them too — `projection_state` defaults to `'pending'` and nothing in `append` pops it.

### Personal-organization path

```
browser opens dashboard
  └─ loadWorkspaceData(orpc, isAdmin, signal)              useWorkspaceData.ts:78
     ├─ installation.ensureInstallation  (admin only, best-effort)   :84
     ├─ organization.ensurePersonalOrganization.call({})            :87
     │    └─ OrganizationService.ensurePersonal            service.ts:98
     │         ├─ repository.findPersonalByOwner(user.id)
     │         ├─ authority.getOrganizationBySlug('personal-<userId>')
     │         ├─ authority.createOrganization / listAllMembers / assertAuthorityOwner
     │         └─ repository.insertWithOwner({...isPersonal: true})
     ├─ organization.listOrganizations  (per org: reconcile + assertReadable)
     └─ site.listSites per organization
```

Signup path (`firstUserAdmin`) and personal-org path are **not connected** — no auth hook calls `ensurePersonal`.

---

## Files Read

- `apps/api/src/resources/event-ingestion/repository.ts`, `repository.drizzle.ts`, `service.ts`, `coalescer.ts`, `router.ts`, `index.ts`, `fingerprint.ts`, `identity-session.ts` (signatures), `ingestion-port.ts` is under site
- `packages/db/src/schema/collection.ts`, `governance.ts`
- `packages/contract/src/contract/event-ingestion/schema.ts`, `packages/contract/src/contract/organization/command/ensure-personal-organization.ts`
- `packages/utils/src/event-filter/index.ts` (1-15)
- `apps/api/src/resources/organization/service.ts`, `repository.ts` (signatures), `owner-invariant.ts`, `router.ts`, `fixture.ts`
- `packages/auth/src/first-user-admin.ts`, `packages/auth/src/server.ts`
- `apps/api/src/resources/site/service.ts`, `repository.ts`, `repository.drizzle.ts` (insert section), `ingestion-port.ts`
- `apps/api/src/composition.ts` (1-270)
- `docs/specs/collection-analytics-identity/event-ingestion/SPECS.md` (1-130), `docs/specs/organization-site-governance/site/SPECS.md` (headings + C1/C3)
- `apps/api/src/testing/reporting-fixture.ts`, `apps/api/src/testing/fixture.ts` (111-147)
- `packages/db/src/migrations/0011_seed_collection_policy_defaults.sql`

---

## Boundaries

- **Resource repository boundary** (`apps/api/src/resources/event-ingestion/repository.ts`) imports from `../collection-policy/evaluator.ts` — type-only (`ScalarValue`), which is allowed.
- A seed service that lives outside `event-ingestion` must go through `AcceptanceRepository` / `AcceptanceCoalescer`, not import `AcceptanceRepositoryDrizzle`'s internals — `repository.drizzle.ts` and `repository.ts` are the only files an owner may import.
- `accepted_event` is **immutable** once written: no update path exists anywhere in `repository.drizzle.ts` (only `insert` + `deleteExpired` + `deleteExpiredReplayMaterial`).
- `accepted_event.site_id` → `site.id` is `ON DELETE RESTRICT` and `policy_revision_id` → `collection_policy_revision.id` is `ON DELETE RESTRICT`, so a seeder cannot rely on cascade cleanup. The per-kind tables and `event_payload` / `event_acceptance_journal` *do* cascade from `accepted_event`.
- `event_ingestion` accepts only an `ingestionIdentifier` to resolve a site — no organization/user id in the payload at all.
- `EventIngestionService` requires an `IdentitySessionResolver`; `resolveIdentity` throws `ORPCError('BAD_REQUEST')` if none is wired (`service.ts:616-619`). Direct `repository.append` sidesteps this entirely.

---

## Non-Obvious Things

1. **`service.ts` never calls `append`.** The only production caller of `AcceptanceRepository.append` is `AcceptanceCoalescer.flushActive` at `coalescer.ts:393-394`. `EventIngestionService.reserve` → `coalescer.reserveMany` → deferred resolution.
2. **`replaySequence` is caller-supplied, not DB-generated** — `accepted_event.replay_sequence` is `.notNull().unique()` with no default, and the coalescer hands each candidate a pre-computed value at `coalescer.ts:206`. Any direct inserter must allocate it themselves.
3. **`lastReplaySequence()` reads the wrong table relative to the constraint.** It selects `max(replay_sequence)` from `event_acceptance_journal` (line 53), but the unique constraint lives on `accepted_event.replay_sequence`. Normally both are written in the same transaction so they agree — but a direct writer touching only `accepted_event` (like `seedAcceptedEvents`) makes the coalescer under-count.
4. **`append` is a synchronous transaction.** `this.db.transaction((tx) => candidates.map(...))` — the callback is not `async`, so there are no awaits inside the flush on the local control DB.
5. **`event_acceptance_journal` has a composite FK back to `accepted_event`** over 5 columns (`event_pk, replay_sequence, payload_fingerprint, receipt_time, policy_revision_id`) — `collection.ts:221-237`, named `event_acceptance_journal_metadata_fk`. Insert order matters: `accepted_event` first, journal second.
6. **There are two dedup layers.** The durable `accepted_event_site_event_unique` index *and* the in-memory reservation map in the coalescer (`pendingReservation`, `coalescer.ts:321-337`), keyed by `acceptanceReservationKey` which is `page-view:<pageViewId>` for page_view (not `event:<eventId>`).
7. **`fingerprintAcceptedEvent` excludes different keys per kind** — `ingestionIdentifier` always; `ingestionIdentifier` + `eventId` for `page_view` (`fingerprint.ts:5-20`). So page views dedup on page-view identity rather than event identity.
8. **`appendKind` defaults `pagePath` to `'/'`** when the normalized event carries `null` (`repository.drizzle.ts:334`) because `event_page_view.page_path` is `NOT NULL`.
9. **`createdAt` is set to `receiptTime`**, not wall-clock-now, and `projectedAt` is explicitly `null` at insert (`repository.drizzle.ts:294-296`).
10. **`one installation-wide FIFO coalescer`**, not per-site — `reservations` is a nested `Map<siteId, Map<key, state>>` but `active`/`pending`/`sequence` are flat globals (`coalescer.ts:103-106`). A seeding service alongside a live server shares this sequence space.
11. **`ensurePersonal` never creates a site** — confirmed by reading the whole method. Site creation requires an explicit `POST /site/createSite` with `admin` role.
12. **The personal-org slug is `personal-${user.id}`**, colliding only per-user; `name` comes back from the authority org, so renaming the authority org changes what `toOrganization` emits.
13. **`organization_personal_owner_unique` is a partial unique index** (`WHERE is_personal = 1`), so concurrent `ensurePersonal` calls resolve via the loser's `findPersonalByOwner` re-read (lines 163-166) rather than erroring.
14. **`firstUserAdmin` runs on `count === 1`** — it counts *after* insert, so it promotes the new user only when it is the very first row. Subsequent signups get whatever default role the schema supplies.
15. **Hostname uniqueness is org-scoped, tombstone-enforced.** `site_organization_hostname_unique` on `(organization_id, hostname)` plus a hard pre-insert check against `site_tombstone` that throws a plain `Error` (not a constraint error) at `repository.drizzle.ts:103` — which `SiteService.create` does *not* catch as CONFLICT; it propagates.
16. **`site_tombstone` has no FK** — `organization_id` and `hostname` are plain text, deliberate so the tombstone survives the purge of the org/site.
17. **Test fixture `seedAcceptedEvents` does not write `event_payload` or `event_acceptance_journal`** (`reporting-fixture.ts:149-218`) — it writes only `accepted_event` + the per-kind table + properties. Any code under test that reads payload JSON or journal state will behave differently against seeded vs. truly ingested rows.
18. **`seedRetentionCutoff` inserts an entire `installation` row** (status `ready`) with `ON CONFLICT DO NOTHING`, plus `retention_policy` and `retention_effective_cutoff` — because `retention.effective(site.id)` fails closed without a cutoff row.
19. **`PROPERTIES_REVERSED_NAME` is enforced twice** — once in the valibot `SEventProperties` reserved-name list (`event-ingestion/schema.ts:18-50`, 42 reserved keys) and again by collection policy at admission.
20. **Collection policy gates before identity**, per SPECS §"Exclusions precede identity and Session assignment" — `prepare` calls `collectionPolicy.admit` at `service.ts:514` and only resolves identity at `:571`.
21. **`late` is computed at prepare time**, `receipt.getTime() - occurrence.getTime() > 15 * 60 * 1000` (`service.ts:597`), and never normalized.

---

## Open Questions

1. **Should a seeding service go through the coalescer or directly through `repository.append`?** The coalescer free `append` path is simplest and exact, but it bypasses `DefaultIdentitySessionResolver`, so `visitorId` / `analyticsSessionId` must be supplied explicitly (they default to `null`, which makes `findIdentitySession` skip the row entirely — `repository.drizzle.ts:64`).
2. **Who allocates `replaySequence` for seed data?** Reading `max()` from `event_acceptance_journal` and continuing is the only self-consistent choice, but nothing in the repo does that today (`readMaxReplaySequence` reads `accepted_event`).
3. **Does the seeder need to project the events** (populate `projection_state = 'projected'`, `projected_at`, and the DuckDB analytics store), or is leaving them `pending` acceptable? `append` only ever writes `pending`.
4. **Does seeding need a real `collection_policy_revision` matching the seeded content?** The FK is only on `id`, but `payload_fingerprint` and `botPolicyOutcome` would be inconsistent with any policy if you reuse the bootstrap revision.
5. **Where would a seed entrypoint live?** There is no `vp` task, no CLI, and no composition-root slot for it. Candidates: a new `vp run` script, a new admin-only oRPC command, or a dev-only composition dependency following the `eventIdentitySession?: IdentitySessionResolver` injection pattern at `composition.ts:194`.
6. **Should a deferred post-`ensurePersonal` hook be a second plugin in `plugins: [...]` (`server.ts:36-47`) or folded into `firstUserAdmin`?** Folding it in makes the promotion of the first user race against org creation on the first-ever signup; a separate plugin keeps them independent.
7. **Tombstone collision on seed hostnames** — `SiteService.create` maps only *constraint* errors to 409 (`service.ts:115`); a tombstone-reserved hostname throws `'Site hostname is reserved by a tombstone'` and surfaces as a 500. Worth deciding the desired behavior before a seeder reuses hostnames.