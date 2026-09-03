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

### Implementation Conventions

- The API module owns one reusable aggregate oRPC implementer for server-supported resources: create it with `implement({ ... }).$context<ApiContext>()`, define resource handlers from its branches, return implemented resource routers from `create<Resource>()`, and let the API composition root assemble those routers.
- Constructors with dependencies receive one named dependency object with explicit property names rather than positional arguments.
- Sociable fixtures use `vitest-mock-extended` for typed repository mocks, configure behavior in each test, and expose assertions through the repository mock rather than returning duplicate method references.

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
