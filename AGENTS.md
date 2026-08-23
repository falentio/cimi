## Mandatory Rules

- always use exa or context7 whenever you interact with third party library
- utilize packages/utils as much as possible, keep it DRY
- propose new package/utils utils whenever you saw repeatable code that can be shared across apps/resource/domain
- package/utils are only for utilities that can be shared across apps or packages
- TDD whenever possible
- Sociable Unit testing rather than solitaire unit testing. so we only mock repository.
- Always run test/lint/fmt as a narrow, not broad, so we save much compute.
- If you spawn subagents for audit, review, track bug, check, etc. try to spawn 2x identical for that, and then synthesis from both spawned subagents, this help exhaustively audit, spawn in parallel, with no context shared from same subagents task.
- need an source code access for 3rd party library? create git submodule, vendored at ./docs/research/vendor/

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
