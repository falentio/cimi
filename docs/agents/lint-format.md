# Lint and Format Fixes

## Standard commands

Run Vite Plus directly from the repository root. Do not invoke it through
pnpm.

```bash
vp check --fix path/to/file.ts
vp check path/to/file.ts
vp run --filter ./apps/api typecheck
```

`vp check --fix` forwards the supplied paths to the formatter and linter. In
this repository, the check configuration also enables type-aware checks, so
failures may include type errors. Keep paths narrow instead of checking the
whole workspace for a small change.

Run the affected package's typecheck once for each workspace package touched:

```bash
vp run --filter ./apps/frontend typecheck
```

## Focused worker

Use `@lint-fmt-fixer` when the task is limited to lint or formatting issues for
known files. Include Linux paths or glob patterns in the request, for example:

```text
Fix lint and format issues in apps/api/src/**/*.ts and packages/utils/src/**/*.ts.
```

The worker resolves multiple path patterns, limits work to tracked files,
preserves existing worktree edits, skips unsupported files, and reports all of
those decisions. It stops when the requested paths are missing or ambiguous.

The worker requires the globally installed `vp` command. It must not fall back
to a package-manager wrapper.

## Safety rules

- Pass individual resolved paths to `vp`; do not rely on unquoted shell glob expansion.
- Do not reset, clean, stash, or overwrite unrelated worktree changes.
- Do not add dependencies or make unrelated refactors.
- Change existing configuration only when it is directly responsible for the reported issue.
- Run the final non-fixing check after all source, configuration, and supported documentation changes.

## Durable lessons

Record reusable fixes here using this structure:

### Lesson: <short title>

- **Symptom:** What the lint or format check reported.
- **Root cause:** Why the check reported it.
- **Correct pattern:** What future code should do.
- **Avoid:** The pattern that causes the issue.
- **Validation:** The narrow `vp` command that confirms the fix.

Update an existing lesson when it covers the same rule. Do not add a duplicate
entry for every run.

### Lesson: Vitest mock methods and `unbound-method`

- **Symptom:** `vp check` reports `typescript(unbound-method)` on a Vitest
  matcher such as `expect(repo.method).toHaveBeenCalled()`.
- **Root cause:** The type-aware rule cannot determine that the matcher safely
  consumes the mock method reference without invoking it as an unbound
  callback.
- **Correct pattern:** Keep the intentional Vitest matcher and add a
  `// oxlint-disable-next-line typescript/unbound-method` comment immediately
  above that assertion, with a brief reason.
- **Avoid:** Broadly disabling `unbound-method` or extracting repository
  methods merely to silence the warning.
- **Validation:** `vp check path/to/test.ts`
