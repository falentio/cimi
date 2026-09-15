## Mandatory Rules

- always use exa or context7 whenever you interact with third party library
- utilize packages/utils as much as possible, keep it DRY
- propose new package/utils utils whenever you saw repeatable code that can be shared across apps/resource/domain
- package/utils are only for utilities that can be shared across apps or packages
- TDD whenever possible
- Sociable Unit testing rather than solitaire unit testing. so we only mock repository.
- Always run test/lint/fmt as a narrow, not broad, so we save much compute.
- need an source code access for 3rd party library? plain `git clone` (never a submodule), vendored at `./docs/vendor/{gh,gl,bb,etc}/{orgname}/{reponame}/{ref}/`, gitignored (see `docs/vendor/README.md`).
- Always parallel subagents whenver the tasks are READ only, sequence otherwise.
- all pnpm/vp/npm scripts must be run-ed in sequence rather than parallel.
- specs, and docs are token expensive, it drain out context window so fast, so use subagents for specs and docs reading that output the narrowed summary wit file references.

## Tooling

pnpm workspace of `apps/*` and `packages/*`, driven by Vite Plus.

Run Vite Plus directly, never through a package manager wrapper:

```bash
vp check --fix path/to/file.ts   # format + lint + typecheck
vp test
vp run <script>                  # package.json scripts, e.g. db:push
vp run --filter ./apps/web <script>
vp install                       # only when deps change
```

- **pnpm** is the only package manager (`pnpm@11.18.0`, pinned via `packageManager`). Never npm or yarn.
- Dependency versions are pinned in the `pnpm-workspace.yaml` catalog; add new versions there rather than inline.
- **Vite Plus** (`vite-plus`) owns dev, build, test, format, and lint. It resolves to Vite via the `vite` → `@voidzero-dev/vite-plus-core` override, and its config, ignore patterns, and `fmt`/`lint` rules live in `vite.config.ts`.

### Implementation Conventions

- The API module owns one reusable aggregate oRPC implementer for server-supported resources: create it with `implement({ ... }).$context<ApiContext>()`, define resource handlers from its branches, return implemented resource routers from `create<Resource>()`, and let the API composition root assemble those routers.
- Constructors with dependencies receive one named dependency object with explicit property names rather than positional arguments.
- Sociable fixtures use `vitest-mock-extended` for typed repository mocks, configure behavior in each test, and expose assertions through the repository mock rather than returning duplicate method references.
- Resource tests live under `apps/api/src/resources/<resource>/testing/` and follow the per-method layout in `apps/api/src/resources/site/testing/`. One test file per service or repository method (`service.<method>.test.ts`, `repository.drizzle.<method>.test.ts`), one test file per cross-method concern (`service.<concern>.test.ts`), and `<module>.test.ts` for standalone modules. Each file has exactly one top-level `describe` named `<ClassName>.<method>`. A `service.test.ts` or `repository.drizzle.test.ts` bundling many methods is banned; `router.test.ts` is the only permitted single-file surface. `apps/api/src/testing/resourceTestLayout.test.ts` fails the suite when a banned filename reappears.

### Narrow lint and format fixes

Use `@lint-fmt-fixer` for focused lint and format fixes on known files. See
`docs/agents/lint-format.md` for the direct `vp` workflow and reusable fixes.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `falentio/cimi`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the canonical labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.
