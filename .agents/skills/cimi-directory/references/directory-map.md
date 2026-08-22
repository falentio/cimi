# Cimi Directory Map — Full Reference

This is the disclosed reference for `cimi-directory`. Load only when placing code or answering layout questions.

## Table of Contents

1. [Workspace root](#workspace-root)
2. [Apps](#apps)
3. [Packages](#packages)
4. [Package skeleton](#package-skeleton)
5. [Import graph](#import-graph)
6. [Testing layout](#testing-layout)
7. [Config files](#config-files)
8. [Anti-patterns](#anti-patterns)

## Workspace Root

```
cimi/
├── .agents/skills/cimi-directory/  # this skill (single skill for placement)
├── .gitignore
├── pnpm-workspace.yaml             # members: apps/*, packages/*
├── tsconfig.base.json              # strict single source for all packages
├── tsconfig.json                   # root include for vite.config.ts only
├── vite.config.ts                  # vite-plus: fmt/lint
├── package.json                    # private cimi, engines node >=24.16.0, pnpm 11.18.0
├── apps/
├── packages/
└── rybbit/                         # gitignored, stays
```

`pnpm-workspace.yaml:1` is authoritative for what pnpm sees:

```yaml
packages:
  - apps/*
  - packages/*
```

Anything outside those globs is invisible to `pnpm -r` and `pnpm install`.

## Apps

### apps/api (`@cimi/api`)

```
apps/api/
├── package.json  # depends on @cimi/auth, @cimi/contract, @cimi/db, @cimi/utils
├── tsconfig.json # extends ../../tsconfig.base.json
└── src/
    ├── index.ts  # createApiApp(deps: {db, auth, analytics}) — Hono + oRPC OpenAPIHandler
    ├── health.ts # systemHealthHandler
    └── testing/api.test.ts
```

- Composition root: `apps/api/src/index.ts:20` `createApiApp`.
- Routes: `/api/auth/*` → `deps.auth.handler`, `/api/*` → `OpenAPIHandler` with `contract` router.
- No direct drizzle/better-auth imports — go through `@cimi/db` and `@cimi/auth`.

### apps/frontend (`@cimi/frontend`)

```
apps/frontend/
├── astro.config.mjs  # Astro + @astrojs/node + @astrojs/react + @tailwindcss/vite + @cloudflare/kumo
├── package.json      # depends on @cimi/api, @cimi/auth, @cimi/client, @cimi/contract, @cimi/db, @cimi/utils
├── tsconfig.json
└── src/
    ├── pages/index.astro
    ├── components/HealthStatus.tsx
    ├── middleware.ts
    ├── server/
    └── styles/
```

- Astro islands: React components in `src/components/`, pages in `src/pages/`.
- Do not add a separate `src/api/` that duplicates `@cimi/client` — import the client package.

## Packages

| Package             | npm name         | Purpose                                       | Key exports                                                                                                                 |
| ------------------- | ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/contract` | `@cimi/contract` | oRPC contract — single source for API shapes  | `packages/contract/src/contract.ts:1` → `contract.system.health`; `src/contract/system/query/health.ts`; `src/orpc/meta.ts` |
| `packages/db`       | `@cimi/db`       | control (sqlite/drizzle) + analytics (duckdb) | `packages/db/src/index.ts:1` → `createDb`, `schema`, `migrateControlDb`, `createAnalyticsDb`                                |
| `packages/auth`     | `@cimi/auth`     | better-auth wrapper                           | `packages/auth/src/server.ts`, `src/client.ts`, `src/first-user-admin.ts`                                                   |
| `packages/guard`    | `@cimi/guard`    | authz guards                                  | `packages/guard/src/guard.ts`, `src/index.ts`                                                                               |
| `packages/client`   | `@cimi/client`   | typed oRPC client for frontend                | `packages/client/src/index.ts` (wraps `@orpc/client` + `@orpc/openapi-client`)                                              |
| `packages/utils`    | `@cimi/utils`    | cross-cutting only                            | `packages/utils/src/index.ts:1` → `createSingleton`, `loadConfig`, `ConfigError`                                            |
| `packages/testing`  | `@cimi/testing`  | shared test helpers                           | `packages/testing/src/index.ts` → `temp-dir`, `orpc-error` helpers                                                          |

### packages/utils — Allowed vs. forbidden

Allowed (today): `src/singleton/`, `src/config/` — generic, no domain nouns, no imports from `@cimi/*` except other utils.

Forbidden: anything importing `@cimi/db`, `@cimi/auth`, `@cimi/contract`; any code used by only one consumer.

### packages/db internals

```
packages/db/src/
├── client.ts              # createDb, CONTROL_DB_FILENAME
├── migrate.ts             # migrateControlDb
├── schema/auth.ts         # auth tables
├── schema/index.ts
├── client/testing/client.test.ts
├── duckdb/index.ts        # createAnalyticsDb, ANALYTICS_DB_FILENAME
└── duckdb/testing/duckdb.test.ts
```

### packages/contract internals

```
packages/contract/src/
├── contract.ts            # export const contract = { system }
├── contract/system/index.ts
├── contract/system/schema.ts
├── contract/system/query/health.ts
├── orpc/index.ts
├── orpc/meta.ts
└── testing/contract.test.ts
```

## Package Skeleton

When creating a new package `packages/<name>` or app `apps/<name>`:

```jsonc
// package.json
{
  "name": "@cimi/<name>",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc -p tsconfig.json", "test": "vitest run" },
  "dependencies": { "@cimi/utils": "workspace:*" /* add only needed @cimi/* */ },
  "devDependencies": { "@types/node": "catalog:", "typescript": "catalog:", "vitest": "catalog:" },
}
```

```jsonc
// tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"],
  "compilerOptions": { "types": ["node"] },
}
```

```
src/
├── index.ts        # barrel — re-exports only, no logic
├── <domain>.ts     # implementation
└── testing/
    └── <domain>.test.ts
```

After scaffolding, verify:

1. `pnpm-workspace.yaml` globs still cover the new path (no edit needed if under `apps/*` or `packages/*`).
2. `pnpm install` links `@cimi/<name>` into consumers' `node_modules/@cimi/`.
3. Import from consumers as `import { x } from '@cimi/<name>'`, never relative `../../packages/<name>/src`.

## Import Graph

Allowed direction (no cycles):

```
contract  →  (no @cimi deps)
db        →  utils
auth      →  db
guard     →  auth, @orpc/server
client    →  contract
utils     →  (no @cimi domain deps)
testing   →  @orpc/server (for orpc-error helpers)
api       →  auth, contract, db, utils
frontend  →  api, auth, client, contract, db, utils
```

If a proposed import violates this direction, the placement is wrong — move the code, not the edge.

## Testing Layout

- Co-located: `src/testing/*.test.ts` next to implementation, not `__tests__/`.
- Example: `packages/db/src/client/testing/client.test.ts`, `apps/api/src/testing/api.test.ts`.
- Shared helpers: `packages/testing/src/temp-dir.ts`, `packages/testing/src/orpc-error.ts`.
- Rule from `AGENTS.md:6`: sociable unit tests — only mock the repository/DB boundary, never domain collaborators.

## Config Files

| File                   | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `tsconfig.base.json`   | single compiler config, strict          |
| `tsconfig.json` (root) | includes `vite.config.ts` only          |
| `vite.config.ts`       | `vite-plus` fmt/lint + `ignorePatterns` |
| `.gitignore`           | ignores `rybbit/`, build outputs        |
| `pnpm-workspace.yaml`  | workspace members                       |

## Anti-Patterns

- Adding any new top-level folder without a `pnpm-workspace.yaml` entry — it will be invisible to pnpm but will confuse `rg` and onboarding.
- Putting shared code in `apps/api/src/` that is needed by `apps/frontend` — extract to a `packages/*` instead.
- Re-exporting `better-sqlite3` or `drizzle-orm` from `packages/utils` — belongs in `packages/db`.
- Creating `packages/utils/src/auth-helpers.ts` — domain leak; belongs in `packages/auth`.
