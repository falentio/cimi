---
name: reporting-issues
description: Use when filing any structured issue report as a markdown file — bug reports, feature requests, or other issue types. Also use when creating issue templates for repositories or coaching others on writing actionable issues. Do NOT use for code review, pull request descriptions, or changelog entries.
---

# Reporting Issues

## Overview

A well-structured issue report is the difference between "can't reproduce" and a fix in production. Every missing detail multiplies investigation time. Provide complete, actionable information so maintainers can understand, reproduce, and resolve without follow-up questions.

## When to Use

- Filing a bug report — include exact reproduction steps, environment, and evidence
- Requesting a feature — include motivation, proposed behavior, and acceptance criteria
- Creating a repository template for others to use
- Coaching someone on writing a better issue

## Issue Templates

### Bug Report

```markdown
## Summary

One-line description of the bug.

## Environment

- **OS:** [e.g., macOS 14.5, Ubuntu 22.04, Windows 11]
- **Browser:** [e.g., Chrome 125, Firefox 128, Safari 18]
- **App version:** [e.g., v2.3.1, commit abc123, or "main @ 2026-05-01"]
- **Deployment:** [e.g., local dev, staging, production]

## Steps to Reproduce

1. Exact steps, from a clean state:
   - Include specific inputs (file names, URLs, button labels, form values)
   - Include file sizes and types if relevant
2. If the issue requires specific data/state, describe how to set it up
3. ...

## Expected Behavior

What should happen.

## Actual Behavior

What actually happens. Include exact error messages, stack traces, or console output.

## Evidence

- Screenshots, screen recordings, or HAR files
- Logs or error output (formatted as code blocks)
- Network request/response payloads if relevant

## Regression

- Did this ever work? If so, what changed?
- Last known working version

## Severity

- **Impact:** [critical / high / medium / low]
- **Frequency:** [always / intermittent / rare]
- **Affected users:** [all / specific roles / edge case]

## Workarounds

Any temporary fix, even if partial.

## Related

Links to related issues, PRs, or discussions.
```

### Feature Request

```markdown
## Summary

One-line description of the requested feature.

## Motivation

- Problem this solves
- User demand (links to discussions, feedback, analytics)
- Current workarounds users rely on

## Proposed Behavior

- How the feature should work end-to-end
- User-facing changes (UI, API, config)
- System behavior (performance, error handling, edge cases)

## Acceptance Criteria

- [ ] Bullet list of concrete, testable outcomes
- [ ] Each criterion is measurable, not vague

## Technical Notes

- Affected components, modules, or services
- Suggested implementation approach (optional)
- Dependencies or prerequisites

## Alternatives Considered

Other approaches evaluated and why they were not chosen.

## Related

Links to related issues, PRs, discussions, or RFCs.
```

## Other Issue Types

Adapt the bug report template for these:

- **Security vulnerability:** Keep repro steps and impact — a dev must verify the bug exists and confirm the fix. Add vulnerability type (CWE reference) and a suggested fix. Omit environment if server-side. Never include exploit payloads in public issues.
- **Performance:** Add metrics (response time, memory, CPU), baseline comparison, and data scale. Repro steps must include the load/size that triggers the issue.
- **Documentation:** Reference the doc URL and specific section. Describe the gap and what the reader would expect to find.

## Handling Missing Information

When the user hasn't provided details for a section:

1. **Mark it explicitly** — write `> **Missing:** describe what info is needed` so the reporter or assignee can fill it in
2. **Never omit the section** — an empty section signals what's missing; a missing section hides the gap
3. **Make reasonable assumptions** only if you're confident (e.g., "server-side error" doesn't need browser info)

## Common Mistakes

| Baseline Failure                              | Fix                                             |
| --------------------------------------------- | ----------------------------------------------- |
| "Attempt to upload a file" — no file details  | Specify filename, size, type, and upload method |
| Missing OS, browser, or app version           | Always include all three with exact versions    |
| No error messages or logs                     | Paste exact output in code blocks               |
| "Possible memory issue" (guessing root cause) | Report symptoms, not diagnoses                  |
| No regression info                            | Check when it last worked and what changed      |
| No screenshots                                | A screenshot saves 3 rounds of questions        |
| Feature request missing acceptance criteria   | Define testable outcomes upfront                |
| "Users want it" with no evidence              | Link to discussions, polls, or analytics        |

## Red Flags — STOP and Fill the Gap

- "To reproduce: ..." with steps vaguer than 5 concrete actions
- "Error: something broke" with no actual error text
- No OS/version for a platform-specific bug
- "It doesn't work" — what does "work" mean? Define expected behavior first
- Guessing root cause instead of documenting observed symptoms
- Feature request with no acceptance criteria
- "Related: —" with nothing linked

A reporter who needs 3 follow-up questions will often abandon the issue. Give everything needed in one shot.
