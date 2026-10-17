# PR #168 review: seed a demo site with an incremental DuckDB projection append

- PR: https://github.com/falentio/cimi/pull/168 (falentio/cimi), branch `fix/issue-164`
- Head reviewed: `8c332b64906c55bf91e227a8cd20d64386576752`
- Fixed point: merge-base with `origin/main`, `24ee376fcfadf1998d45b2ca131b835af39adb8f` (three-dot diff, 48 files, +7084 / -572)
- Worktree: `/home/kevin/.t3/worktrees/cimi/t3-1dd9a7ae`. Paths below are relative to that worktree root.
- Originating spec: GitHub issue 164 (`gh issue view 164 --repo falentio/cimi`), plus the PR body and the committed trail under `./.audit/issue-164/`.
- Standards sources read: `./AGENTS.md`, `./docs/agents/domain.md`, `./docs/agents/lint-format.md`, `./docs/adr/0001..0008`, `./vite.config.ts`, and the repo's own enforcement tests.
- Method: two independent sub-agents, one per axis, plus the author's own read of the append path, the seed service, the trigger wiring, the site release path and the acceptance evidence. Every finding below was re-verified against the file at HEAD before it was written down. Nothing here is inferred unless the finding says so.

Read-only limits honoured: no file in any worktree was modified, no test suite was run, no worktree was created. The two axes are reported separately and are not merged or reranked; one axis passing does not excuse the other.

Caveat on worktree state: `./apps/api/src/resources/organization/mutation-lease.ts`, `./packages/db/src/migrations/0002*.sql` through `0005*.sql`, and `./packages/utils/src/retry/` are untracked in this worktree and are not in PR #168's file list. They belong to other in-flight work and are excluded from this review. `packages/utils/src/retry/` is not referenced by the tracked barrel (`grep -n "retry" packages/utils/src/index.ts` returns nothing), so it cannot affect this branch's typecheck.

## Standards

5 major, 10 minor, 0 blocker.

### S1 (major) A resource test file lives outside `testing/`

Evidence: `./apps/api/src/resources/demo-seed/attribution.test.ts:13` declares `describe('pickSessionAttribution', () => {` at the resource root, while its three siblings sit in `./apps/api/src/resources/demo-seed/testing/`. `git ls-files apps/api/src/resources | grep '\.test\.ts$' | grep -v '/testing/'` returns this file and nothing else in the whole repository.

Rule: `./AGENTS.md:44` says "Resource tests live under `apps/api/src/resources/<resource>/testing/`".

Enforcement gap: `./apps/api/src/testing/resourceTestLayout.test.ts` builds its scan from `join(resourcesRoot, name, 'testing')` and filters on that exact directory, so a test file one level up is never scanned. The rule only catches the two banned filenames inside `testing/`.

Fix: move to `./apps/api/src/resources/demo-seed/testing/attribution.test.ts`, and extend the layout test to assert every `*.test.ts` under `resources/**` sits in a `testing/` directory. The second half is what stops this from reappearing.

### S2 (major) A hand-rolled PRNG where `packages/utils` already ships one

Evidence: `./apps/api/src/resources/demo-seed/fabric.ts:361-384` implements mulberry32 (`createRandom`) plus FNV-1a (`hashSeed`) inline. `./packages/utils/src/rng/index.ts:25` exports `createXoroshiro128PlusPlus`, re-exported through `./packages/utils/src/index.ts:142`.

Rule: `./AGENTS.md:4`, "utilize packages/utils as much as possible, keep it DRY".

Nuance: the utils generator takes `{ seed: bigint }` or an explicit state pair, so reuse needs a string-to-bigint seed helper. That helper is five lines and belongs in `packages/utils`, where the next caller gets it too. Fixing this is the difference between one seeded generator in the repo and two.

### S3 (major) The demo release overrides ADR-0006 without recording it

Evidence: `./apps/api/src/resources/site/service.ts:194` calls `this.repository.purge(...)` from inside the deletion path, and `./apps/api/src/resources/site/service.ts:189` states the deviation in a source comment: `// Nobody has seen this site, so it does not wait out the recovery window the request path owes.`

`./docs/adr/0006-recoverable-site-deletion.md` says "`deleted` begins a thirty-day recovery window when entered. Automatic purge then removes all live Site data". Rule: `./docs/agents/domain.md:30-34`, "If your output contradicts an existing ADR, surface it explicitly rather than silently overriding", with an example of the required framing.

The sequence is also duplicated from its owner. `./apps/api/src/resources/site/lifecycle.ts:84` (`completeDelete`), `:116` (`repository.purge`), `:123` (`onPurgedSite`) is the same three-call shape as `./apps/api/src/resources/site/service.ts:179`, `:194`, `:203`.

The behaviour may be the right call for a site no user has seen. As merged it is an unrecorded ADR override, and a second purge path that will silently skip any step a future ADR inserts between `completeDelete` and `purge`. Fix: either record the deviation in ADR-0006 (a short "unseen site release" clause) or move the release onto the worker's path with an explicit flag.

### S4 (major) The purge is stamped 30 days in the future

Evidence: `./apps/api/src/resources/site/service.ts:187-197` reads the deletion status, takes `const purgedAt = new Date(deletion.purgeAt)`, and passes it as `requestedAt`. For a site in `deleted`, `getDeletionStatus` returns `purgeAt: site.purgeAt`, the recovery deadline (`./apps/api/src/resources/site/repository.drizzle.ts:863`). That value is roughly now plus 30 days.

That is the only timestamp that gets past the repository's own guard, `./apps/api/src/resources/site/repository.drizzle.ts:659-666`: `input.requestedAt < site.purgeAt` returns `{ status: 'conflict' }`. So the caller must claim the purge happened at the deadline to be allowed to purge before it.

The future value is then written to `site_tombstone.purged_at` (`./apps/api/src/resources/site/repository.drizzle.ts:701`), to the lifecycle operation's `requestedAt`/`startedAt`/`completedAt`/`createdAt`/`updatedAt`, and it is echoed back by `getDeletionStatus` as `requestedAt`, `deletedAt`, `recoveryDeadline` and `purgeAt` (`./apps/api/src/resources/site/repository.drizzle.ts:813-816`). Backup-restore reads it as the tombstone's purge time (`./apps/api/src/resources/backup-restore/executor.ts:693`).

Effect: the audit trail reports a purge that has not happened yet, for the one row the ADR calls minimal audit metadata. Fix at the source: a repository operation that models "release a site no user has seen" explicitly (a flag, or a separate `releaseUnseen` call), so both the intent and the timestamp stay honest. Do not fix it by passing `new Date()`, which the guard rejects.

### S5 (major) A failed release is silent, and the failure mode is a personal organization that can never be deleted

Evidence: `./apps/api/src/resources/site/service.ts:177`, `:185` and `:190` each `return` with no error and no log when `beginDelete` is not `accepted`, `completeDelete` is not `completed`, or the deletion status has no deadline. The caller adds a second swallow: `./apps/api/src/resources/demo-seed/service.ts:93-98` catches a release failure and discards it (`// The original failure is the one worth reporting; a release that also fails adds nothing.`).

Consequence the issue itself names: "a personal organization that owns a site cannot be deleted (`PERSONAL_ORGANIZATION_PROTECTED`)". A leaked demo site therefore locks the user out of deleting their personal organization, and the only trace is one `operation.failure` log event from `./apps/api/src/resources/organization/service.ts:198-205`. Nothing surfaces the inconsistency, and no retry is scheduled.

Fix: at minimum log each non-accepted status with the site id and the current lifecycle status, and give the site a recovery path the lifecycle worker can pick up (a site left in `deleted` is already picked up by `findDuePurges`; a site left in `deleting` is not obvious). Then the organization is not permanently stuck.

### Minor findings

- m1 `./apps/api/src/resources/demo-seed/testing/seed.integration.test.ts:61` names its describe `'ensurePersonal seeds the demo site'`, and the file name matches none of the three permitted forms in `./AGENTS.md:44`. Repo precedent for a cross-method concern is `./apps/api/src/resources/site/testing/service.deletionStatusLeak.test.ts:37`, `describe('SiteService.getDeletionStatus allowlist')`. Naming only, and the assertion is honest.
- m2 `ProjectionEventScope` is declared twice in this PR: `./packages/db/src/duckdb/projection-source.ts:96` and `./packages/db/src/duckdb/projection-append.ts:66`, with the same three optional fields. `./packages/db/src/duckdb/projection-append.ts:61` types its own port with the local copy instead of importing the source's. Duplicated Code.
- m3 `placeholders` is byte-identical in `./packages/db/src/duckdb/projection-append.ts:369` and `./packages/db/src/duckdb/projection-fold.ts:229`. `MS_PER_DAY` is declared twice inside one resource, `./apps/api/src/resources/demo-seed/fabric.ts:6` and `./apps/api/src/resources/demo-seed/service.ts:9`.
- m4 The `onPurgedSite` hook shape is spelled out three times: `./apps/api/src/resources/site/index.ts:44` (predates this PR), `./apps/api/src/resources/site/lifecycle.ts:13`, `./apps/api/src/resources/demo-seed/ports.ts:12`. Two call sites also write the same body: `./apps/api/src/composition.ts:158` and `./apps/api/src/resources/demo-seed/service.ts:95-96`. A shared type wants to be born.
- m5 `./packages/db/src/duckdb/fact-writer.ts:284` defines `appendBoolean(appender, value) { appender.appendBoolean(value) }`, one call site at `:152`. Middle Man; call the appender directly.
- m6 `./apps/api/src/resources/demo-seed/index.ts:36-44` destructures five named dependencies and rebuilds the identical object for the constructor. `:47`, `export type DemoSeedModule = DemoSeedService`, has no reader anywhere in the repo. Speculative Generality.
- m7 `./apps/api/src/resources/demo-seed/ports.ts:68`, `export type DemoSeedRetentionPort = RetentionResolver`, renames a kernel type without adding meaning. The other two ports in that file declare real shapes.
- m8 `./apps/api/src/resources/demo-seed/fixture.ts:26-28` branches `policy === undefined ? new InMemoryRetentionResolver() : new InMemoryRetentionResolver(policy)`, two arms that are the same call because the constructor defaults its policy (`./packages/kernel/src/ports.ts:176`). The fixture also takes overlapping `policy` and `retention` options.
- m9 `./apps/api/src/resources/site/service.ts:117-127` destructures only `organizationId` from `DemoSiteInput`, so `ownerUserId` travels through `./apps/api/src/resources/demo-seed/ports.ts:10-20` and `./apps/api/src/resources/demo-seed/service.ts:72-76` with no reader at any layer.
- m10 `./apps/api/src/resources/event-ingestion/seed-journal.ts:36-46` returns the non-conflict count from the last attempt. A batch that landed events on attempt one and different events on attempt two under-reports the total. The value is not read in production (`DemoSeedResult.appendedEventCount` has no consumer), so this is bookkeeping debt, not a live bug. See also P8.

### Checked and clean on the standards axis

No narrating comments in the changed source. The comments in this diff carry a non-obvious why (`./apps/api/src/resources/site/service.ts:189-190`, `:199-201`, `./apps/api/src/resources/collection-policy/service.ts:166-170`, the cursor guard in `./packages/db/src/duckdb/projection-append.ts:148-155`). No `vi.mock`/`vi.spyOn` in any new test, matching `./AGENTS.md:9`. Constructors take one named dependency object, matching `./AGENTS.md:42`. No cross-resource repository import: `demo-seed` reaches site and journal behaviour through `DemoSitePort` and `DemoSeedJournalPort`, which is what ADR-0008 asks for. Formatting, import order and unused-variable rules are tool-enforced and were not reviewed.

## Spec

1 major, 9 minor, 0 blocker.

### P1 (major) The end-to-end acceptance evidence is not reproducible from the branch

Evidence: the committed end-to-end test does not project. `./apps/api/src/resources/demo-seed/testing/seed.integration.test.ts:38-60` installs a proxy that replaces `appendProjectedEvents` with a recorder returning all-zero counts, and the file's own header comment says running the real thing "spends the CPU every other analytics test needs".

The evidence that does exist is prose plus a throwaway harness: `./.audit/issue-164/acceptance-evidence.md:3-5` says "one throwaway vitest file run with vp test run --dir /tmp, no file added to the repo tree", "7 of 7 verification tests pass".

What this costs: acceptance criteria 2 (27,000 events reach DuckDB with `ready()` true throughout) and 3 (the 90-day traffic query passes admission) are the two claims that prove the feature works, and neither can be re-run from the branch by a reviewer, a bisect, or CI. The mechanism underneath is well tested at unit level (`./packages/db/src/duckdb/testing/projection-append.test.ts`, 11 tests including `keeps the store ready before, during and after the append` at `:221` and `changes nothing when a committed chunk is replayed` at `:345`), so the gap is the end-to-end run, not the append.

Fix: commit the harness as a tagged slow integration test (an `e2e` file under `./apps/api/e2e/` with a small event count, or a gated full-volume variant), so AC2 and AC3 have a rerunnable artifact.

### P2 (minor) Acceptance criterion 5's rerun is not reachable in the product

The criterion asks for convergence "on rerun". `./apps/api/src/resources/organization/service.ts:118` returns the existing personal organization without scheduling, and `./apps/api/src/resources/demo-seed/service.ts:93-97` releases the site on failure, so the same organization never re-seeds (Decision 5 forbids backfill). The evidence's own "rerun" is a different organization seeded onto a second site, `./.audit/issue-164/acceptance-evidence.md` criterion 5. Convergence is proven where it can be, at the append's checkpoint (`./packages/db/src/duckdb/testing/projection-append.test.ts:311` and `:345`), not at the seed. Worth saying so in the PR body rather than implying a product-level rerun.

### P3 (minor) Decision 2's "same rules as a normal site" is bypassed on the failure path

Decision 2 says the demo site follows the same rules as a normal site. It does at creation, but the failure path purges in the same call (`./apps/api/src/resources/site/service.ts:194`), where a normal site waits out the 30-day recovery window. This is deliberate and commented, and it is the same evidence as S3. The issue accepted the hostname and undeletable-organization consequences of Decision 2, not an immediate-purge exception, so the exception deserves a line in the issue or the ADR.

### P4 (minor) Decision 4's identity rows are not fabricated

Decision 4 reads "Fabricate visitor, session, and identity rows." `./apps/api/src/resources/event-ingestion/seed-journal.ts:85-86` sets `identifiedUserId: null, anonymousIdentityId: null` for every candidate, and `./apps/api/src/resources/demo-seed/ports.ts:16-31` has no identity field, so no identity row is written and `readIdentities` returns empty. Visitor and session ids are fabricated as the decision's second sentence intends, and the resulting visitors all derive as anonymous. Defensible against the issue's own explanation of the mechanism, but the third noun of that sentence is unimplemented.

### P5 (minor) The attribution module is scope creep

`./apps/api/src/resources/demo-seed/attribution.ts` (87 lines), the user-agent registry, and the whole breakdown vocabulary (utm, device, browser, os, country) are not in issue 164. The issue asks only for correlated visitor and session ids. The PR body introduces the requirement itself ("Every breakdown renders non-null on a seeded site") and then satisfies it. The work is good and the breakdowns would otherwise be empty, so this is a note for the reader deciding what the PR is worth, not a defect.

### P6 (minor) Every organization's demo site advertises the same hostname

`./apps/api/src/resources/site/service.ts:22`, `const DEMO_SITE_HOSTNAME = 'demo.example.com'`. Uniqueness is per organization (`./packages/db/src/schema/governance.ts:214` for live sites, `:292-295` for tombstones), so the constraint holds and no seed fails, but the second user's demo site claims the same hostname as the first. If the demo site is ever meant to be reachable through the ingestion hostname, it needs to be per organization.

### P7 (minor) Deferred is not the same as off the event loop

`./apps/api/src/resources/organization/service.ts:197-206` defers the seed with `setTimeout(..., 0)`, which takes it off the ensure request. What runs next is synchronous work in the same process: fabric generation for ~27,500 events, then one `better-sqlite3` transaction over every candidate (`./apps/api/src/resources/event-ingestion/repository.drizzle.ts:153-161`, driver at `./packages/db/src/client.ts:15`). Acceptance criterion 4 is written about the triggering request and is met; the installation-wide stall on the following request is what is unmeasured here. The issue's own table prices journal writes at 0.3 s for 27,000 events and never lists it as a risk.

### P8 (minor) A short batch is reported as success

`./apps/api/src/resources/event-ingestion/seed-journal.ts:46-48` returns the non-conflict count once `MAX_REPLANS` is spent, and `./apps/api/src/resources/demo-seed/service.ts:80-90` never compares that count against `events.length`. A partial seed produces a smaller demo site and reports success. Nothing downstream can notice, because the checkpoint cardinality is compared against the DuckDB count it was just derived from (`./packages/db/src/duckdb/projection-append.ts:266-273`). Reachability inferred: a fresh site's event ids do not collide, so a conflict needs an unusual path.

### P9 (minor) PR-body numbers that do not match the head

The body says `packages/db/src/duckdb/index.ts` "shrinks from 1,507 lines to 1,085"; the file is 1,087 lines at `8c332b64`. The body's "`vp check --fix` over all changed TypeScript files: 0 errors" could not be checked, because this review is barred from running the checks.

### P10 (minor) An exact multiple of the chunk size buys an extra transaction

`./packages/db/src/duckdb/projection-append.ts:242` ends the loop on `complete: events.length < this.#chunkRows`. When a site's event count is an exact multiple of the chunk size, the next iteration reads zero events and still rewrites the checkpoint, bumping `projection_generation` and `statistics_refreshed_at` with no new data. Harmless, but it makes the generation number depend on the event count modulo the chunk size. The measured run at 27,456 events with 2,500-row chunks hits 11 chunks and does not trip it.

### Verified against the issue, implemented as asked

Units 1 through 4 land where the issue says. The shared projection body and the parameterized cursor reader exist (`./packages/db/src/duckdb/projection-source.ts:143-165`, `EVENT_SITE_CLAUSE`, `EVENT_AFTER_SEQUENCE_CLAUSE`), the append never sets `rebuilding` and reads queue behind each chunk (`./packages/db/src/duckdb/index.ts:554-576`, transaction wrapper at `:220-255`), the per-chunk checkpoint writes the values Unit 2 names (cursor, live per-site cardinality, merged coverage, readiness, version, generation), the seed writes through `repository.append`, and the trigger is deferred, insert-path only, and swallows its failure to a log. Decision 5 and the out-of-scope items hold: no `apps/web` file is in the diff, and `appendProjectedEvents` has exactly one production caller (`./apps/api/src/resources/demo-seed/service.ts:85`). The installation gate's per-site cardinality equality (`./apps/api/src/resources/installation/index.ts:92-108`) holds because both values are written in the same transaction. The three contract suites are untouched by the diff, which is acceptance criterion 1.

## Axis summary

- Standards: 5 major, 10 minor, 0 blocker. Worst: S5, a failed release can leave a personal organization permanently undeletable with only a log line, and S3, an unrecorded ADR-0006 override.
- Spec: 1 major, 9 minor, 0 blocker. Worst: P1, the two headline acceptance criteria rest on an uncommitted harness.
