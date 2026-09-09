# FINDING-1e3d11f — audit of `feat-collection-event-ingestion-coalescer`

Two-axis review per `.agents/skills/skills/code-review/SKILL.md`. Standards and Spec were reviewed by independent sub-agents against the same diff, then spot-checked in the working tree.

- **Fixed point.** `ed038bd` (merge-base with `origin/main`), diff `git diff ed038bd...HEAD`
- **Commits.** `6938be8` feat(event-ingestion): add FIFO acceptance coalescer; `5dc561e` test(invitation): keep pending fixtures future-dated; `1e3d11f` fix(event-ingestion): address review findings for production ingestion
- **Spec sources.** GitHub issue falentio/cimi #42 ("C-02: collection — event-ingestion coalescer") and `docs/specs/collection-analytics-identity/event-ingestion/SPECS.md` (259 lines, present on the base). The issue's four line-citations (`:26`, `:18-21`, `:109`, `:110-113`) were re-verified against the actual file; all match.
- **Standards sources.** root `AGENTS.md` (incl. Implementation Conventions), `docs/agents/domain.md`, `docs/agents/lint-format.md`, `CONTEXT.md`, plus the Fowler smell baseline from the skill.
- **Uncommitted work.** `fingerprint.ts`, `testing/fingerprint.test.ts`, `testing/repository.drizzle.test.ts`, `testing/router-context.test.ts` exist untracked and are outside this audit.

## Standards

**Compliant.** Router, service, and coalescer follow the aggregate oRPC implementer, `create<Resource>()` assembly, and named-dependency-object conventions (AGENTS.md Implementation Conventions). Tests use `vitest-mock-extended` repository mocks with real `CollectionPolicyService` and coalescer, per the sociable rule. `canonicalizeHostname`, `parseUserAgent`, `isBotUA`, `generateId`, `resolveSiteLocalCutoff` are correctly reused from `@cimi/utils`. Glossary vocabulary (Receipt Time, late, Acceptance Flush, 30min/24h Analytics Session bounds) matches CONTEXT.md.

### Hard violations

1. **HARD — DRY / packages/utils** (AGENTS.md "utilize packages/utils… keep it DRY" and "propose new package/utils"). The diff adds `isRecord` twice (`service.ts:623` and `payload-size.ts:4`), duplicating the pre-existing `backup-restore/retention-manifest.ts:191`. Verified in-tree: no `isRecord` exists in `packages/utils`. Extract once; the canonical key-sorted JSON in `sortRecord` (`service.ts:596`) is also a `@cimi/utils` candidate.

### Judgement calls (smells)

2. **Mysterious Name / Middle Man** — `payload-size.ts:33-38`. `isOversizedEvent` and `hasParsedPayloadSizeViolation` are both aliases of `isParsedPayloadOversized`. Three names, one behavior, and `index.ts:40` vs `apps/api/src/index.ts:40` import different ones. Collapse to one.
3. **Duplicated Code** — `service.ts:387-411`. `deriveAttribution(input, request.userAgent)` and `normalizeEvent(...)` each run twice in `prepare()`; only `identifiedUserId` differs between the two builds.
4. **Duplicated Code** — `existingResult`/`existingBatchResult` (`service.ts:540-559`) repeat the fingerprint-conflict-vs-duplicate decision across singular and batch paths.
5. **Data Clump** — `{ receiptTime, payloadFingerprint }` is a named type `AcceptedEventRecord` (`repository.ts:60-63`) but re-spelled inline at `service.ts:540` and `service.ts:548`. Reuse it.
6. **Shotgun Surgery risk** — `apps/api/src/index.ts:351-355`. `eventRawRequestLimit` string-matches `/event-ingestion/collectEvent(s)` paths; renaming the procedure silently drops the body limit. Derive from contract route metadata.
7. **Duplicated Code** — `site/repository.drizzle.ts:50-54` adds a fifth copy of the tombstone `notExists` subquery already at lines 27, 70, 209, 232. Extract a live-site `where` helper.
8. **Primitive Obsession** — two stringly composite keys. `reservationKey` joins with `\u0000` (`coalescer.ts:379`), `sessionKey` joins with a space (`identity-session.ts:19`). Inconsistent separators; SId permits spaces.
9. **Speculative Generality** — `index.ts:74-90` `combineAcceptanceQuiescence` has one caller; inline or justify.
10. **Spec note** — `identity-session.ts:38-41` fabricates a fresh Visitor per anonymous Event. CONTEXT.md defines a Visitor as keyed by a persisted Anonymous Identity; no anonymous identity field exists in the contract, so anonymous session analytics cannot match the documented model.

## Spec

All four issue line-citations verified against SPECS.md. Byte limits at :26, coalescer 1000/500/1500 at :18-21 (also :100, :147), grandfathering at :109, batch non-atomic/per-item at :110-113.

### (a) Missing / partial

1. **SPA pageview dedup** — spec :73 "Repeated route notifications are deduplicated; reloads create new pageviews". No such logic exists anywhere in the diff.
2. **identifiedUserId reference validation** — spec :73 "unknown IDs fail validation". `service.ts` prepare/`resolveIdentity` never checks the identity-profile store (verified: no profile lookup in `service.ts`).
3. **Session-stable attribution** — spec :105 "Session-entry attribution uses first-touch values … remains stable for the Session". `attribution.ts:11-24` derives utm per-event from each request; `SessionState` (`identity-session.ts`) stores no attribution.
4. **Coarse location** — spec :44 "approved referrer/campaign/device/coarse-location values". `attribution.ts:26` hardcodes `country: null`.
5. **IP protection effectively unwired** — spec :26/:107 transient source-IP buckets. `router.ts:13` defaults `trustProxyHeaders=false` and no composition-root call site enables it, so `sourceIp` is always undefined in the shipped wiring.
6. **Lifecycle coverage** — `site/repository.drizzle.ts:38-57` implements active+tombstone lookup (rotated-identifier NOT_FOUND is covered by code), but zero tests cover site deletion/recovery or grandfathering (:109).

### (b) Scope creep

1. `payload-size.ts:36-38` — `isOversizedEvent`/`hasParsedPayloadSizeViolation` are pure aliases of `isParsedPayloadOversized` (redundant surface).
2. `repository.drizzle.ts:48` — diagnostics read runs `wal_checkpoint(PASSIVE)`, a stateful side effect inside an observability getter.
3. Unrelated ride-alongs: `invitation/fixture.ts` future-dating, `backup-restore/service.ts` resume-error swallowing, README/docs status edits. (Same-Site referral stripping in `collection-policy/evaluator.ts` is spec'd at :44/:105 — in scope, not creep.)

### (c) Implemented but looks wrong

1. **Rate thresholds hardcoded** — spec :107 "numeric thresholds are installation settings, not API quotas". `protection.ts:4-7` constants (`SITE_RATE_PER_SECOND = 100`, `SITE_BURST = 500`, `SOURCE_IP_RATE_PER_SECOND = 25`, `SOURCE_IP_BURST = 100`).
2. **Lifecycle linearization race** — spec :109 "candidate admission linearize with Site deletion through the shared lifecycle boundary". `service.ts:472-482` (`withAdmissionLease`) checks `isLocked()` then admits without holding a lease. Deletion starting between check and `reserveMany` admits post-transition candidates.
3. **Anonymous identity** — `identity-session.ts:43-47` mints a fresh `visitorId`+`sessionId` per anonymous event. "Server owns Session boundaries" (:98) only holds for identified users.
4. **Coalescer timer restart** — `coalescer.ts` flushActive-finally restarts the 1,000 ms timer for candidates already queued during an active flush, vs :18-21 "the first candidate starts a fixed 1,000 ms coalescing window" (one non-sliding window per queue).

### Unverifiable from diff alone / untested acceptance criteria

- **500/1500 saturation 503**: no `reserveMany`-saturation test exists (unit tests use 1/0/1-shaped params).
- **Split-flush failure** (:224-230): only single-flush failure tested; no batch split across two flushes.
- **Cross-request pending duplicate** (:184-190): only same-request batch duplicate tested.
- **WAL growth observable**: `walBytes` untested; multi-process "installation-wide" claim unverifiable from a diff.
- HTTP-level 403/409/429/503 mappings: asserted only at service level; router tests cover 200/413 only.

Coalescer core (FIFO order, all-or-none transaction, commit-wait, duplicate/conflict, reservation release on rollback, refusal non-journaling) is correctly implemented and well tested.

## Summary

- **Standards.** 6 findings. Worst: triplicated `isRecord` across three files while `packages/utils` is the sanctioned home (hard AGENTS.md DRY violation).
- **Spec.** 13 findings. Worst: the lifecycle linearization race in `withAdmissionLease` (`service.ts:472`), because it violates the spec's strongest invariant (admission linearizes with Site deletion) silently, and the missing SPA dedup / identity validation / session attribution cluster, which are whole spec behaviors absent rather than mistuned.
- The two axes disagree in character. The implementation core (coalescer, transaction, per-item semantics) is faithful and well tested. The gaps are at the edges the spec calls boundaries: proxy trust, lifecycle locking, identity reference validation, and session-stable attribution.
