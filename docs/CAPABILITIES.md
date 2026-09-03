# First-Release Capabilities

This is the canonical release-scope disposition of Cimi's first-release capabilities. It owns only `Required`, `Deferred`, or `Excluded`; it is not an implementation-status report. Route and handler availability are defined by the implementation boundary in [`docs/specs/README.md`](specs/README.md). The resource specifications remain the normative behavior contracts and are still marked `draft` until implemented.

Accepted issue decisions and ADRs remain authoritative for product behavior. This document is authoritative for the cross-domain capability disposition. A disposition change requires an accepted product decision and an update here.

## Evidence Boundary

The [capability-selection research synthesis](research/capability-selection/SYNTHESIS.md) is evidence for the dispositions below. It contains the rubric, source audits, score vectors, and follow-up references, but it is non-normative and cannot override this document or the accepted decisions. Research alternatives remain evidence unless explicitly promoted through the authority chain in [`docs/specs/README.md`](specs/README.md).

## Required

| Capability                                                                     | Score | First-release boundary                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site, Organization, authorization, installation, and Core Operability          |  2.80 | One-container offline operation, bounded failures, retention, backup, and restore.                                                                                                  |
| Pageview and server-side Event collection                                      |  2.55 | Shared immutable envelope, stable Event ID, durable accepted-for-processing acknowledgment, bounded occurrence/receipt times, and standard event kinds.                             |
| Durable anonymous Visitor identity and server-authoritative Analytics Sessions |  2.75 | Site-scoped first-party identity; 30-minute inactivity; 24-hour maximum; no IP/UA fingerprint identity.                                                                             |
| Core traffic dashboard                                                         |  2.55 | Visitors, Sessions, pageviews, bounce, pages/session, duration, trends, and bounded time/filter inputs.                                                                             |
| Traffic breakdowns and session-entry attribution                               |  2.55 | Pages, entry/exit pages, referrer/channels/UTM, device/browser/OS, and coarse geography with same-Site referral normalization.                                                      |
| Custom-event analytics and event exploration                                   |  2.55 | Counts, trends, bounded scalar properties, authenticated event exploration, and outbound-event reporting.                                                                           |
| Identified Users, Traits, Aliases, and profile explorer                        |  2.35 | Explicit opt-in opaque IDs, bounded scalar Traits, alias/backfill behavior, profile views, deletion state, and no inference from Cimi authentication.                               |
| Full standard event dashboards                                                 |  2.35 | Dedicated bounded reporting for pageview, custom, outbound, performance, and error Events; sensitive URL, message, stack, and property data is rejected or redacted before storage. |
| Single-action Goals/conversions                                                |  2.30 | Event/action-based conversion definitions and reports aligned with Site, Session, identity, and dashboard filters.                                                                  |
| Funnels                                                                        |  2.35 | Bounded ordered step definitions and Session-consistent conversion semantics; no arbitrary SQL or unbounded query execution.                                                        |
| Cohort retention                                                               |  2.35 | Stable cohort and retention definitions with bounded recomputation and deletion-aware results.                                                                                      |
| Bot, exclusion, consent, URL, and property privacy controls                    |  2.65 | Apply hard exclusions and sanitization before Visitor/Identified User and Session assignment; honor GPC/DNT/opt-out decisions.                                                      |
| Retention, storage safety, backup, and restore                                 |  2.55 | Twelve-month configurable default retention, shorter replay retention if later enabled, explicit write/recovery behavior, and quiesced backup/restore.                              |
| Aggregate Public Dashboard                                                     |  2.50 | Dedicated aggregate Public Query only: approved catalog, one-hour buckets, 90-day maximum, `k=5` suppression, no identities/raw rows/replay/GSC/exports, and selected rate limits.  |

## Deferred

| Capability                                                   | Score | Promotion boundary                                                                                                                      |
| ------------------------------------------------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------------------- |
| Broad autocapture of buttons, forms, copy, and input changes |  1.60 | Requires a reviewed collection policy that prevents sensitive labels, form values, copied text, and arbitrary metadata capture.         |
| Journeys/path visualization                                  |  1.65 | Requires a stable event-aware path model; the audited Rybbit implementation is pageview-only despite broader documentation.             |
| Session Replay                                               |  1.55 | Requires explicit consent, masking, short retention, storage sizing, deletion, and public-disclosure controls.                          |
| Detailed bot-inspection dashboard                            |  1.55 | Basic bot filtering is Required; per-layer bot analytics and bot-history retention are not.                                             |
| Live visitor count and live event feed                       |  1.55 | Requires freshness, ordering, polling, and load contracts.                                                                              |
| Tags and deployment labels                                   |  1.75 | Custom scalar properties and approved filters cover the initial segmentation need.                                                      |
| Imports, member exports, and scheduled reports               |  1.50 | Requires bounded large-file processing, partial-failure handling, filesystem pressure controls, and outbound delivery semantics.        |
| Safe private sharing/embed redesign                          |  1.55 | Requires per-share records, expiry, scope allowlists, revocation, auditing, and cache semantics; do not copy Rybbit's broad bearer key. |
| Google Search Console integration                            |  1.50 | Optional external OAuth dependency; if added later it remains member-only and never enters Public Query.                                |

## Excluded

| Capability                                                 |      Score | Boundary failure                                                                                                            |
| ---------------------------------------------------------- | ---------: | --------------------------------------------------------------------------------------------------------------------------- |
| Rybbit-style broad Public Analytics/private-link dashboard |       1.10 | Fails the public disclosure gate by exposing Sessions, IDs, Traits, raw IP/location, replay, GSC, and raw/export paths.     |
| Raw IP persistence and IP-based Visitor identity           |       0.70 | Contradicts Cimi's identity/privacy model; geography may be derived and discarded, but raw IP is not an analytics field.    |
| Feature-flag management and A/B experimentation platform   |       0.75 | Product control plane rather than first-release analytics; adds assignment, exposure, lifecycle, and statistical contracts. |
| Arbitrary SQL or custom dashboard builder                  |       0.55 | Conflicts with bounded execution, trustworthy curated analytics, and the minimum operating envelope.                        |
| Native mobile SDK lifecycle                                | Outside v1 | Explicitly outside the parent product boundary; web and product analytics remain the first-release scope.                   |
