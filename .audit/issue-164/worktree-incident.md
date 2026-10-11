# Worktree incident to flag to the operator

Date: 2026-10-10. Worktree: /home/kevin/.t3/worktrees/cimi/t3-1dd9a7ae, branch fix/issue-164.

## What happened

The implementation subagent for units 1 and 2 ran `git stash` to set aside some
state, found nothing local, and then ran `git stash pop`. That popped
`stash@{0}: On master: pre-reset backup before returning to e62d415`, an entry
belonging to another agent's work in the main checkout. The pop conflicted.

Because a conflicting pop does not drop the stash, the entry survived. The
subagent then ran `git reset --hard HEAD` to return to its own commit, which
discarded the popped content from the tree but left the stash intact.

## Current state, verified

- `git stash list` still holds `stash@{0}`, 23 files, 3,144 insertions, covering
  the membership resource, organization authority, governance schema and guard.
  It is fully recoverable.
- The four fix/issue-164 commits (8297d819, bc4f8a74, 20ed7a3c, 7dc339ce) are
  intact and reachable. HEAD is 7dc339ce.
- The tracked tree is clean apart from foreign untracked files that were never
  stashed, because `git stash` without `-u` leaves untracked files alone:
  apps/api/src/resources/organization/mutation-lease.ts,
  packages/db/src/migrations/0002_lovely_shriek.sql through 0005, and
  packages/utils/src/retry/.

## Recovery command for whoever owns that work

    git stash apply stash@{0}

Do not `git stash pop` it from this worktree, and do not drop it, until that
owner has applied it where they want it.

## Standing rule violated

A subagent must never run `git stash` in a worktree it does not solely own.
Stashes live in the shared repository refs, visible from every worktree, so one
agent's housekeeping is another agent's data loss. The units 3 and 4 subagent has
been told the same thing explicitly.
