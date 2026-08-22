---
name: cimi-directory
description: Cimi monorepo placement guide. Use whenever you create, move, or refactor files, add a new package or app, decide between packages/utils and a domain package, or edit pnpm-workspace / vite / tsconfig config — even if the user did not mention directories explicitly.
---

# Cimi Directory — Placement

Leading word: **placement**. Every file decision is a placement decision. Anchor on it.

## Branches

| Branch             | Trigger                                                     | Pointer                       |
| ------------------ | ----------------------------------------------------------- | ----------------------------- |
| A — Place new code | new file, new package/app, refactor, "where does X belong?" | `references/directory-map.md` |
| B — Lookup         | read-only question about existing layout                    | `references/directory-map.md` |

Inline what every branch needs; disclose what only some branches need behind the pointer above.

## Steps

### Step 1 — Determine placement intent

Classify the task before touching the filesystem.

- `new code` — creating or moving source
- `lookup` — answering without writing

**Completion criterion:** intent labeled as one of the two branches and recorded in your next action message.

### Step 2 — Resolve placement via directory map

Read `references/directory-map.md` if you need the full tree. Then apply the placement rule:

- `apps/api` — Hono + oRPC server, `createApiApp` composition root (`apps/api/src/index.ts:20`). Only app-level wiring; domain logic lives in packages.
- `apps/frontend` — Astro + React + Tailwind (`apps/frontend/astro.config.mjs`), pages in `src/pages/`, islands in `src/components/`.
- `packages/contract` — oRPC contract single source of truth (`packages/contract/src/contract.ts:1`). All API shapes start here.
- `packages/db` — drizzle + better-sqlite3 + duckdb (`packages/db/src/index.ts:1`). Schema in `src/schema/`, clients in `src/client.ts` / `src/duckdb/`.
- `packages/auth` — better-auth wrapper (`packages/auth/src/server.ts`, `packages/auth/src/client.ts`).
- `packages/guard` — authorization guards over `@cimi/auth` + `@orpc/server` (`packages/guard/src/guard.ts`).
- `packages/client` — typed oRPC client (`packages/client/src/index.ts`).
- `packages/utils` — **only** cross-cutting utilities shared by >=2 packages/apps (`packages/utils/src/index.ts:1`). Never domain code. See utils gate below.
- `packages/testing` — sociable-test helpers, temp-dir, oRPC error helpers (`packages/testing/src/index.ts`). Only place to add shared test infra.

If undecided between `packages/utils` and a domain package, default to the domain package and propose a `packages/utils` extraction only when you see duplication across >=2 consumers.

**Completion criterion:** target path resolves to an existing or new `apps/*` or `packages/*` entry that is listed in `pnpm-workspace.yaml:1` (`apps/*`, `packages/*`).

### Step 3 — Apply package/app skeleton and naming

Create files using the repo's skeleton. Every package/app:

```
<name>/
├── package.json  # name: "@cimi/<name>", private, type: module, exports ".": "./src/index.ts"
├── tsconfig.json # extends "../../tsconfig.base.json" (apps/frontend extends via astro check), include ["src"]
└── src/
    ├── index.ts      # public barrel — only re-exports
    ├── <domain>.ts   # implementation
    └── testing/      # co-located sociable tests (*.test.ts) — never __tests__
```

Additional rules (co-located here because every branch needs them):

- Package names are `@cimi/*`, app names are `@cimi/api`, `@cimi/frontend`. Never introduce a new scope.
- `tsconfig.base.json:1` is the single compiler source — strict, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- Formatting/lint is `vite.config.ts:1` (`vite-plus` — `vp check --fix`). Do not add eslint/prettier configs.
- Tests are sociable: only mock the repository boundary (`AGENTS.md:6`). Shared helpers come from `@cimi/testing`.

**Completion criterion:** any new `package.json` / `tsconfig.json` matches the skeleton above and `pnpm-workspace.yaml` globs still resolve; no new top-level directory outside `apps/` or `packages/`.

### Step 4 — Enforce the utils gate

Before writing to `packages/utils`, check:

1. Is the code used by >=2 packages/apps today (not hypothetically)?
2. Can it be described without domain nouns (config, singleton, etc.)?
3. Does it avoid importing any domain package (`@cimi/auth`, `@cimi/db`, `@cimi/contract`, `@cimi/guard`, `@cimi/client`)?

If any answer is no, place the code in the domain package that owns it and note the duplication as a future extraction candidate. When you do write to `packages/utils`, export via `packages/utils/src/index.ts:1`.

**Completion criterion:** no domain import appears in `packages/utils/src/**` and every new util has at least two verified consumers or an explicit TODO with the second consumer named.

### Step 5 — Verify placement

Run the verification that matches the branch:

- For placement (A): `pnpm -r typecheck` and `vitest run` for the touched package.
- For lookup (B): cite the file and line (`apps/api/src/index.ts:20` style) for every placement claim.

**Completion criterion:** verification command output is clean and every newly created import uses `@cimi/*` workspace alias, never a relative path escaping `apps/` or `packages/`.

## Reference — Compact Rules (every branch needs these)

- **Monorepo scope:** only `apps/*` and `packages/*` are workspace members. Do not add a new top-level folder without updating `pnpm-workspace.yaml:1`.
- **No cross-import of utils internals:** consumers import from `@cimi/utils`, not `@cimi/utils/src/singleton`.
- **Contract is upstream:** `apps/api` and `packages/client` both depend on `@cimi/contract`; never duplicate a schema outside `packages/contract/src/contract/`.
- **DB boundary:** `packages/db` owns `drizzle-orm`, `better-sqlite3`, `@duckdb/node-api`. No other package imports those directly.

## Progressive Disclosure Pointer

- Full annotated tree, package purposes, and file-level patterns → `references/directory-map.md`

Read the pointer only when its branch fires.
