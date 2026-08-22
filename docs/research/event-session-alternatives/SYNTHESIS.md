# Event and Session Alternatives: Local-Source Synthesis

Research for Cimi issue [#7](https://github.com/falentio/cimi/issues/7), checked 2026-08-23 from local Git submodules only. Candidate reports in this directory cite the exact local source paths.

## Comparison

| Alternative | Event identity/delivery | Pageviews/custom events | Session ownership | Time/attribution | Privacy/exclusion behavior |
| --- | --- | --- | --- | --- | --- |
| Umami | No client event ID or idempotency; best-effort fetch, no durable retry | Shared event row; pageview/custom/link/performance types | Server-derived session plus browser cache token; 30-min visit cache | Server timestamp unless caller supplies unrestricted timestamp; URL/referrer/UTM fields | Bot/IP/DNT/opt-out gates, but no server PII or query redaction policy |
| Matomo | Browser queue/offline worker; no visible event idempotency; bounded 50-entry/24h offline queue | Action factory selects pageview, event, download, outlink, ecommerce, etc. | Server visit model, default 30-min timeout with cookie/config matching | Validated custom time, campaign/referrer attribution, midnight/campaign boundaries | Rich bot, exclusion, consent, anonymization, and privacy processors |
| PostHog | V1 UUID events, per-event retry results, batch limits; full browser SDK absent | `$pageview` is ordinary event; custom names/property JSON | Caller-supplied session IDs for raw sessions; stateful cookieless path forms 30-min sessions | RFC3339 timestamps with skew correction; pageview-prioritized attribution | Event restrictions, filters, cookieless IP/source stripping; full browser privacy path unavailable |
| Plausible | No event ID/idempotency; keepalive only; server buffer and bounded internal retry | `pageview` ordinary event plus custom/system/engagement events | Server-derived user key plus in-memory 30-min session cache | Server receipt timestamp; first-session attribution; normalized source/referrer/UTM | Pre-storage bot, threat, hostname/path/IP/country filtering; structural property limits only |
| Rybbit | Strict single-event envelope, no event ID/idempotency, no normal offline queue; in-memory queue can drop on failure | Pageview/custom plus performance/outbound/error and interaction types | Server Redis `(Site, identity)` key with sliding 30-min TTL; no client session ID | Server receipt time only; first non-empty session attribution; raw querystring configurable | Pre-storage Site exclusions, bot routing, DNT/opt-out, optional raw IP and URL controls |
| Databuddy | Stable event IDs, retries, sendBeacon, Redis delivery reservations, bounded duplicate suppression | `screen_view` pageview, `page_exit`, custom spans, vitals/errors/outbound | Client-assigned session ID reused under 30-min age check; server groups supplied ID | Client timestamps with minimum/future limits; UTM/click IDs and page context | GPC/DNT/opt-out, bot/origin/IP controls, daily-salted IDs; no durable offline queue |
| Simple Analytics | Client UUIDs but no local server/idempotency evidence; one-shot image/beacon delivery | Initial pageview, normalized custom event, append lifecycle data | In-memory tracker-invocation session only; no server model locally | Browser transport time; normalized path/referrer/UTM; server semantics unavailable | Client DNT, bot flags, ignored metrics/pages; metadata is caller-controlled |

## Cross-product findings

1. **Event IDs are the clearest reliability seam.** Umami, Plausible, Rybbit, and Matomo lack a visible event idempotency contract. Databuddy and PostHog show the value of caller UUIDs, retryable per-event outcomes, delivery reservations, and duplicate suppression. Cimi should not call retries safe without a stable event ID and deduplication window.
2. **Browser transport success is not storage durability.** `keepalive`, `sendBeacon`, `202`, and `200` commonly mean the browser/server accepted or buffered a request, not that analytics storage has durably committed it. Cimi must define the ingestion acknowledgment level explicitly.
3. **Most alternatives disagree on Session ownership.** Rybbit, Plausible, and Umami form Sessions server-side; Databuddy and Simple Analytics send browser Session IDs; PostHog raw sessions group supplied IDs while its cookieless path forms stateful Sessions. Cimi already promises 30-minute inactivity plus a 24-hour maximum, so the server must remain authoritative even if the browser carries a convenience ID.
4. **Restart semantics are usually accidental.** Browser storage loss, Redis/cache loss, process restart, missing unload events, and open tabs past inactivity can create different outcomes. Cimi should define Session continuity from accepted event state, not from a browser lifecycle callback or cache survival alone.
5. **Server receipt time is the safe default, but offline/product analytics may need occurrence time.** Rybbit and Plausible use server time; Matomo, PostHog, and Databuddy accept bounded client/historical time; Umami accepts client timestamps without a visible skew window. Cimi should store both receipt and validated occurrence time, with a bounded acceptance window and a clear late-event policy.
6. **Pageview is generally an explicit event.** Plausible, Rybbit, Databuddy, and Simple Analytics emit automatic initial/SPA pageviews; PostHog treats `$pageview` as an ordinary event; Matomo selects a pageview Action. Cimi should define initial document load, SPA route transitions, duplicate route notifications, reloads, back/forward, and hash changes.
7. **Custom event validation is structural, not privacy enforcement.** Alternatives bound names, property counts/bytes, and scalar shapes, but do not reliably detect PII in paths or properties. Cimi needs separate schema limits and privacy rules.
8. **Attribution is usually session-entry state.** Plausible and Rybbit seed session attribution from the first relevant event; PostHog prioritizes pageview/screen events; Matomo can change visit boundaries on campaigns. Cimi should decide first-touch/session-entry versus last-touch behavior and normalize same-Site referrers.
9. **Pre-storage exclusions are more trustworthy than report filters.** Rybbit and Plausible apply Site/bot/path/IP/country exclusions before event persistence. Client-only skip flags can be bypassed by server callers and do not protect direct ingestion. Cimi should evaluate exclusions before identity and Session assignment.
10. **Privacy controls are fragmented.** DNT/GPC, opt-out, bot handling, URL/query redaction, IP handling, properties, consent, and replay masking are separate decisions. No alternative supplies a universal privacy policy through the event envelope alone.

## Cimi decision pressure

- Adopt one immutable typed Event envelope with explicit `event_id`, `event_type`, Site scope, Visitor/Identified User context, Session ID, validated occurrence/receipt timestamps, page context, attribution, and bounded properties.
- Include `page_view`, `custom_event`, outbound, performance, and error event kinds in the first standard event contract. Keep their kind-specific fields bounded under the shared envelope.
- Let the server own Session creation and inactivity/max-duration boundaries. A browser may send a candidate Session ID for correlation, but the server must not trust it as authorization or as the complete Session algorithm.
- Reject malformed events with a clear validation result; do not silently coerce arbitrary JSON or preserve sensitive query strings by default.
- Define a retry-safe acknowledgment with duplicate handling. A response must distinguish accepted-for-processing from durably stored if Cimi cannot guarantee the latter.
- Apply Site exclusions, bot policy, consent/opt-out policy, and URL/property sanitization before identity/session assignment and persistence.

## Confirmed Cimi Direction

The following choices were confirmed during issue #7 clarification:

- Use one shared immutable typed Event envelope.
- Require a stable client `event_id`; deduplicate repeated IDs and return idempotent accepted-for-processing semantics rather than claiming durable commit.
- Store both server receipt time and client occurrence time. Accept occurrence time only inside a configured skew window and identify late arrivals.
- Keep the server authoritative for Site-scoped Session creation and the 30-minute inactivity/24-hour maximum boundaries.
- Emit one initial document `page_view` and one pageview per actual SPA route transition; deduplicate repeated route notifications and treat reloads as new pageviews.
- Allow bounded scalar custom-event properties only; reject nested objects, arrays, reserved names, and oversized payloads.
- Include `page_view`, `custom_event`, outbound, performance, and error event kinds in the first standard event contract.
- Capture approved attribution at Session entry, normalize same-Site referrals, and keep attribution stable for the Session.
- Apply Site, bot, consent, URL, and property exclusions before Visitor/Identified User and Session assignment.
