# anti-slop provenance

- Source repository: https://github.com/dmmulroy/anti-slop
- Source commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (pristine clone at `/tmp/opencode/anti-slop`, `git status --short` empty at install time)
- Installed via: `node /tmp/opencode/anti-slop/skills/install-anti-slop/scripts/install.mjs` (default target)
- Installed plugin path: `tools/oxlint/anti-slop/index.ts` (registered as `anti-slop` in `vite.config.ts` `lint.jsPlugins`)
- Vendored license: `tools/oxlint/anti-slop/vendor/eslint-stylistic/LICENSE` (+ `vendor/eslint-stylistic/UPSTREAM.md`)

## Intentional deviations

- Effect rules skipped: this repo has no direct `effect` dependency (zero hits), so
  `tools/oxlint/anti-slop/effect/` is vendored but not registered in `jsPlugins` and its
  five `anti-slop-effect/*` rules are not enabled.
- `@oxlint/plugins` pinned at `1.81.0` (exact, via `catalog:`) to match this repo's
  installed Oxlint 1.81.0, not upstream's 1.78.0 devDependency.
- Ignore-pattern additions beyond upstream's agent-dir list: `.audit/**` (generated
  arena/decision logs), `.grok/**` (generated rhai workflow), `.vite-hooks/**`
  (generated git-hook shims calling `vp staged`). `.agents/**` and `.opencode/**`
  are from the upstream list (installed skills/agent config). `.cimi/**` was already
  ignored before this change.
