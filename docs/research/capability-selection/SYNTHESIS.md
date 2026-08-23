# First-Release Capability Selection

Decision record for Cimi issue [#9](https://github.com/falentio/cimi/issues/9), based on the Rybbit source audit at commit `64f8c4fb7f394bdfe9379717de8e6c21758b1ac2` and the resolved Cimi contracts in issues [#4](https://github.com/falentio/cimi/issues/4), [#5](https://github.com/falentio/cimi/issues/5), [#6](https://github.com/falentio/cimi/issues/6), [#7](https://github.com/falentio/cimi/issues/7), and [#8](https://github.com/falentio/cimi/issues/8).

## Rubric Application

The existing weights remain unchanged: value 30%, core-loop fit 25%, trust/privacy 20%, simplicity 10%, storage/operations 10%, and dependency readiness 5%. Scores are coarse `0–3`; Required remains `>=2.25` and must pass every Hard Gate.

The release promise was deliberately broadened during issue #9 clarification to include full identified-user profiles, dedicated dashboards for every standard event kind, Funnels, and cohort retention. Scores for those capabilities were rebaselined against that promise rather than silently overriding the threshold.

## Required

| Capability | Score | First-release boundary |
| --- | ---: | --- |
| Site, Organization, authorization, installation, and Core Operability | 2.80 | One-container offline operation, bounded failures, retention, backup, and restore. |
| Pageview and server-side Event collection | 2.55 | Shared immutable envelope, stable Event ID, idempotent accepted-for-processing acknowledgment, bounded occurrence/receipt times, and standard event kinds. |
| Durable anonymous Visitor identity and server-authoritative Analytics Sessions | 2.75 | Site-scoped first-party identity; 30-minute inactivity; 24-hour maximum; no IP/UA fingerprint identity. |
| Core traffic dashboard | 2.55 | Visitors, Sessions, pageviews, bounce, pages/session, duration, trends, and bounded time/filter inputs. |
| Traffic breakdowns and session-entry attribution | 2.55 | Pages, entry/exit pages, referrer/channels/UTM, device/browser/OS, and coarse geography with same-Site referral normalization. |
| Custom-event analytics and event exploration | 2.55 | Counts, trends, bounded scalar properties, authenticated event exploration, and outbound-event reporting. |
| Identified Users, Traits, Aliases, and profile explorer | 2.35 | Explicit opt-in opaque IDs, bounded scalar Traits, alias/backfill behavior, profile views, deletion state, and no inference from Cimi authentication. |
| Full standard event dashboards | 2.35 | Dedicated bounded reporting for pageview, custom, outbound, performance, and error events; sensitive URL, message, stack, and property data must be rejected or redacted before storage. |
| Single-action Goals/conversions | 2.30 | Event/action-based conversion definitions and reports aligned with Site, Session, identity, and dashboard filters. |
| Funnels | 2.35 | Bounded ordered step definitions and Session-consistent conversion semantics; no arbitrary SQL or unbounded query execution. |
| Cohort retention | 2.35 | Stable cohort and retention definitions with bounded recomputation and deletion-aware results. |
| Bot, exclusion, consent, URL, and property privacy controls | 2.65 | Apply hard exclusions and sanitization before Visitor/Identified User and Session assignment; honor GPC/DNT/opt-out decisions. |
| Retention, storage safety, backup, and restore | 2.55 | Twelve-month configurable default retention, shorter replay retention if later enabled, explicit write/recovery behavior, and quiesced backup/restore. |
| Aggregate Public Dashboard | 2.50 | Dedicated aggregate Public Query only: approved catalog, one-hour buckets, 90-day maximum, `k=5` suppression, no identities/raw rows/replay/GSC/exports, and selected rate limits. |

## Deferred

| Capability | Score | Promotion boundary |
| --- | ---: | --- |
| Broad autocapture of buttons, forms, copy, and input changes | 1.60 | Requires a reviewed collection policy that prevents sensitive labels, form values, copied text, and arbitrary metadata capture. |
| Journeys/path visualization | 1.65 | Requires a stable event-aware path model; the audited Rybbit implementation is pageview-only despite broader documentation. |
| Session Replay | 1.55 | Requires explicit consent, masking, short retention, storage sizing, deletion, and public-disclosure controls. |
| Detailed bot-inspection dashboard | 1.55 | Basic bot filtering is Required; per-layer bot analytics and bot-history retention are not. |
| Live visitor count and live event feed | 1.55 | Requires freshness, ordering, polling, and load contracts. |
| Tags and deployment labels | 1.75 | Custom scalar properties and approved filters cover the initial segmentation need. |
| Imports, member exports, and scheduled reports | 1.50 | Requires bounded large-file processing, partial-failure handling, filesystem pressure controls, and outbound delivery semantics. |
| Safe private sharing/embed redesign | 1.55 | Requires per-share records, expiry, scope allowlists, revocation, auditing, and cache semantics; do not copy Rybbit’s broad bearer key. |
| Google Search Console integration | 1.50 | Optional external OAuth dependency; if added later it remains member-only and never enters Public Query. |

## Excluded

| Capability | Score | Boundary failure |
| --- | ---: | --- |
| Rybbit-style broad Public Analytics/private-link dashboard | 1.10 | Fails the public disclosure gate by exposing Sessions, IDs, Traits, raw IP/location, replay, GSC, and raw/export paths. |
| Raw IP persistence and IP-based Visitor identity | 0.70 | Contradicts Cimi’s identity/privacy model; geography may be derived and discarded, but raw IP is not an analytics field. |
| Feature-flag management and A/B experimentation platform | 0.75 | Product control plane rather than first-release analytics; adds assignment, exposure, lifecycle, and statistical contracts. |
| Arbitrary SQL or custom dashboard builder | 0.55 | Conflicts with bounded execution, trustworthy curated analytics, and the minimum operating envelope. |
| Native mobile SDK lifecycle | Outside v1 | Explicitly outside the parent product boundary; web and product analytics remain the first-release scope. |

## Audit Ledger

The summary tables above are the product-facing disposition view. This ledger
records the per-capability rubric evidence required by issue #6. Score vectors
use `V/F/T/S/O/D`: user value, core-loop fit, trust/privacy, simplicity,
storage/operations, and dependency readiness. The weighted score is the value
shown in the summary tables.

| Capability | Disposition | V/F/T/S/O/D | Hard Gate | Evidence | Confidence | Dependencies / follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| Site, Organization, authorization, installation, and Core Operability | Required | 3/3/2/3/3/3 | Pass | documentation-confirmed | High | Issues #2-4, #11, #15; implement governance and lifecycle contracts |
| Pageview and server-side Event collection | Required | 2/3/3/2/3/2 | Pass | documentation-confirmed | High | Issues #7, #13, #14; implement durable acceptance and projection |
| Durable anonymous Visitor identity and server-authoritative Analytics Sessions | Required | 3/2/3/3/3/3 | Pass | documentation-confirmed | High | Issues #5 and #7; implement Site-scoped identity and Session resolver |
| Core traffic dashboard | Required | 2/3/3/2/3/2 | Pass | documentation-confirmed | High | Issues #7 and #12; implement metric catalog and bounded reports |
| Traffic breakdowns and session-entry attribution | Required | 2/3/3/2/3/2 | Pass | documentation-confirmed | High | Issues #7 and #12; implement approved dimensions and attribution |
| Custom-event analytics and event exploration | Required | 2/3/3/2/3/2 | Pass | documentation-confirmed | High | Issues #7, #12, #13; implement typed Event reports |
| Identified Users, Traits, Aliases, and profile explorer | Required | 2/2/3/3/2/3 | Pass | documentation-confirmed | High | Issues #5, #11, #17; implement redaction-aware profile lifecycle |
| Full standard event dashboards | Required | 2/2/3/3/2/3 | Pass | documentation-confirmed | High | Issues #7, #12, #16; implement typed reports and acceptance scenarios |
| Single-action Goals/conversions | Required | 1/3/3/2/3/3 | Pass | documentation-confirmed | High | Issues #9, #12, #16; implement Session conversion semantics |
| Funnels | Required | 2/2/3/3/2/3 | Pass | documentation-confirmed | High | Issues #9, #12, #16; implement bounded ordered steps |
| Cohort retention | Required | 2/2/3/3/2/3 | Pass | documentation-confirmed | High | Issues #9, #12, #17; implement deletion-aware periods |
| Bot, exclusion, consent, URL, and property privacy controls | Required | 3/3/3/2/1/2 | Pass | documentation-confirmed | High | Issues #5, #7, #13; implement policy-before-identity pipeline |
| Retention, storage safety, backup, and restore | Required | 3/3/3/1/2/2 | Pass | documentation-confirmed | High | Issues #4, #14, #15, #17, #18; implement lifecycle orchestration |
| Aggregate Public Dashboard | Required | 2/3/3/2/2/3 | Pass | documentation-confirmed | High | Issues #8, #12, #16; implement dedicated aggregate catalog |
| Broad autocapture of buttons, forms, copy, and input changes | Deferred | 0/2/3/1/3/2 | Not required | source-confirmed | Medium | Issue #9; requires a reviewed sensitive-data collection policy |
| Journeys/path visualization | Deferred | 0/2/3/2/2/3 | Not required | source-confirmed | Medium | Issue #9; requires a stable event-aware path model |
| Session Replay | Deferred | 0/2/2/2/3/3 | Not required | source-confirmed | Medium | Issues #5 and #9; requires consent, masking, retention, and deletion contracts |
| Detailed bot-inspection dashboard | Deferred | 0/2/2/2/3/3 | Not required | documentation-confirmed | Medium | Issue #9; basic exclusion remains Required |
| Live visitor count and live event feed | Deferred | 0/2/3/2/3/3 | Not required | documentation-confirmed | Medium | Issue #9; requires freshness, ordering, polling, and load contracts |
| Tags and deployment labels | Deferred | 0/2/3/2/3/3 | Not required | documentation-confirmed | Medium | Issue #9; reassess after bounded scalar properties |
| Imports, member exports, and scheduled reports | Deferred | 0/1/3/2/3/3 | Not required | documentation-confirmed | Medium | Issue #9; requires bounded file and delivery contracts |
| Safe private sharing/embed redesign | Deferred | 0/2/2/2/3/3 | Not required | documentation-confirmed | Medium | Issues #8 and #9; requires scoped share records and revocation |
| Google Search Console integration | Deferred | 0/1/3/2/3/3 | Not required | source-confirmed | Medium | Issue #9; optional OAuth dependency remains outside core release |
| Rybbit-style broad Public Analytics/private-link dashboard | Excluded | 0/0/2/3/3/2 | Fail | source-confirmed | High | Issues #8 and #9; fails aggregate-only disclosure gate |
| Raw IP persistence and IP-based Visitor identity | Excluded | 0/0/1/1/3/2 | Fail | documentation-confirmed | High | Issue #5; contradicts the identity/privacy boundary |
| Feature-flag management and A/B experimentation platform | Excluded | 0/0/1/2/2/3 | Outside boundary | documentation-confirmed | High | Issue #9; requires a separate product-control-plane effort |
| Arbitrary SQL or custom dashboard builder | Excluded | 0/0/0/1/3/3 | Fail | documentation-confirmed | High | Issues #4 and #9; conflicts with bounded execution |
| Native mobile SDK lifecycle | Excluded | 0/0/0/1/3/3 | Outside boundary | documentation-confirmed | High | Issues #4 and #9; web/product analytics only in v1 |

## Hard-Gate Notes

- Full profiles do not weaken the identity decision: application-supplied opaque IDs remain Site-scoped, Traits remain opt-in and bounded, and deletion remains asynchronous with derived-result invalidation requirements.
- Full event dashboards do not permit arbitrary event fields. Every dashboard consumes bounded, typed fields under the shared Event envelope and applies the same pre-storage privacy rules.
- Funnels and cohorts are Required only as bounded Cimi procedures. They cannot introduce arbitrary SQL, unbounded date ranges, raw public access, or identity behavior outside the resolved model.
- Public disclosure remains aggregate-only even when private Required capabilities store identified users, traits, detailed event data, or cohort membership.
- Every Required capability must remain operable under the agreed one-container envelope and participate in retention, backup, and restore semantics.

## Evidence

- Rybbit feature inventory and known defects: `rybbit/FEATURE_AUDIT.md`.
- Rybbit event/session behavior: `docs/research/event-session-alternatives/rybbit.md`.
- Rybbit identity behavior: `docs/research/visitor-identity-alternatives/rybbit.md`.
- Rybbit public disclosure behavior: `docs/research/public-dashboard-alternatives/rybbit.md`.
- Canonical domain terms and rubric: `CONTEXT.md`.
