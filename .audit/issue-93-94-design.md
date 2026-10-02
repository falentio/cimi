# Issues #93 and #94: site collection policy and site retention settings

Synthesized from two parallel architect candidates plus grounded exploration of the contract, API
services, and existing web features. This file is the recipe both implementation owners follow.

## Scope

| Issue | Route                                 | Deliverable                                                     |
| ----- | ------------------------------------- | --------------------------------------------------------------- |
| #93   | `/sites/[siteId]/settings/collection` | Inspect the effective collection policy, edit the Site override |
| #94   | `/sites/[siteId]/settings/retention`  | Inspect and set or clear the Site retention override            |

Both routes exist and render `Unimplemented`. Both pages sit inside the existing site-settings
chrome (`SiteSettingsContainer.vue` + `useSiteSettings`), which already owns site load, retry, and
error states.

## Grounded constraints

Server behavior the UI must match, verified in this worktree:

- `collection-policy` Site override is a **wholesale full-layer replacement**, not a per-field merge
  (`apps/api/src/resources/collection-policy/model.ts:75-87`). `source` is uniform across all nine
  fields. Clearing the override deletes the Site revision and falls back to the installation layer.
- Four combination rules surface as `BAD_REQUEST`: unique `reservedNames`, unique
  `profileFilterKeys`, `captureQueryStrings` incompatible with `urlPolicy.stripQueryStrings`, and
  `exclusions.ipRanges` must parse as IP patterns (`model.ts:104-117`).
- `retention-policy` Site override is taken **verbatim**; the only cross-field rule is the contract
  horizon check `profileMonths <= eventMonths` and `replayMonths < min(event, profile)`
  (`packages/contract/src/contract/retention-policy/schema.ts:5-17`). The "installation limits" in
  the spec means the `1..120` operating envelope, not a comparison against the current installation
  default. Do not invent a comparison rule the server does not enforce.
- `retentionPolicy.updateRetentionPolicy` with `scope: 'site'` and `policy: null` clears the
  override and restores inheritance (`repository.drizzle.ts:96-131`).
- Cleanup is queued only when a cutoff moves forward. `cleanup` in the response is an
  **installation-wide** aggregate with two ordered stages, derived before backup.
- `installation.getInstallationStatus` is `auth: 'admin'` (installation admin). A Site admin cannot
  call it, so the Site page must not derive a lock from it.
- Both pages need `admin` role on the Site. Inactive site: read `NOT_FOUND`, write `CONFLICT`.
  Lifecycle lock held: `CONFLICT`.

## Decisions

### D1. Two independent features, one shared retention extraction

`apps/web/app/components/features/collection-policy/` is new. Retention reuses
`apps/web/app/components/features/retention-policy/` and splits by scope rather than duplicating
into a second folder. Duplicating would put the "hidden immediately, cleanup asynchronous, purged
data does not return" guarantee in two places that can drift.

Shared, generalized in place: `RetentionPolicyMonthFields.vue`, `RetentionConfirmationDialog.vue`,
`RetentionPolicySummary.vue` (becomes `RetentionPolicyCard.vue`), plus `proposedPolicy` and the
scope-aware `normalizeRetentionError` in `retention-policy.utils.ts`.

Installation-only, unchanged in shape: `retention-policy.reducer.ts`, `useRetentionAdmin.ts`,
`deriveRetentionLock`, `cleanup-variants/*`.

### D2. Reduced controller for both pages

Both features use the reducer + discriminated view-model pattern already proven by
`useRetentionAdmin`. State lives in one reducer, not scattered refs, so a failed save keeps the
candidate draft and the view model derives dirty, validation, and summary from one place.

### D3. Collection draft mirrors the contract field-for-field

```ts
export type PolicyValues = Omit<CollectionPolicyResult['effective'], 'scope' | 'siteId'>
export type CollectionDraft = { [K in PolicyField]: EditableValue<K> }
```

A contract field added later breaks compilation instead of being silently dropped. The two bounded
integers use `number | null` so an emptied input is a validation error, never a silent `0`. Arrays
keep user order; `false` stays `false`; `[]` stays `[]`. No "touched" set is stored: dirty and
changed-field lists are derived by comparing the draft against the baseline.

### D4. Collection clear is a first-class action

The contract exposes `{ scope: 'site', policy: { siteId, clear: true } }`. Without it, a Site that
has an override can never return to inheriting the installation layer, because writing values equal
to the installation default still pins `source` to `site` and freezes future installation changes.
Ship clear; confirm it in a dialog because it can reduce privacy relative to the current override.

### D5. Site retention has no client-side lock, and says so

`deriveRetentionLock` needs an installation resource a Site admin cannot read. Fabricating one would
state installation readiness the API refuses to disclose. The Site page disables submit only for
stale data, an in-flight save, or invalid horizons; a `409` is surfaced after the fact with a
refresh action.

### D6. Clear is a shortening-shaped proposal, not a draft state

The site form's draft is always three month strings. Clearing is
`RetentionProposal = { kind: 'inherit' }`, compared against the current effective policy so that
clearing a long override down to a shorter installation default raises the same typed confirmation
as a manual shortening. `policy: null` is constructed in exactly one place.

### D7. Privacy summary is derived, refusal copy is static

The collection page renders a summary card derived from the draft (stance, consent, bots, URL and
property capture, exclusion counts, changed fields). The explanation that a refused Event creates
no accepted record, Visitor, Identified User, or Session is static copy on the page, not derived
data. Same for the statement that the server resolves the policy at ingestion and the form only
edits the stored layer.

### D8. Report link is a path helper plus the settings tab

`siteRetentionSettingsPath(siteId)` joins `siteSettingsPath` in `organization-nav-config.ts`. Its
live caller today is the new Retention tab in `SiteSettingsContainer.vue`, which also fixes the
active tab on `/sites/:siteId/settings/retention`. No live report surface renders
`QUERY_LIMIT_EXCEEDED` yet, so no unused predicate is added for it.

## Files

### Shared (one writer: the lead)

- `apps/web/app/components/features/app-shell/organization-nav-config.ts`: add
  `siteRetentionSettingsPath`, `siteCollectionSettingsPath`.
- `apps/web/app/components/features/site-settings/SiteSettingsContainer.vue`: add General,
  Collection, Retention, Danger zone tabs.

### Collection feature (owner A)

- `collection-policy.types.ts`, `collection-policy.utils.ts`, `collection-policy.reducer.ts`,
  `useSiteCollectionPolicy.ts` plus their tests.
- `CollectionPolicyContainer.vue`, `CollectionPolicySummary.vue`,
  `CollectionPolicyPrivacySummary.vue`, `CollectionPolicyEditor.vue`,
  `CollectionPolicyCaptureFields.vue`, `CollectionPolicyPropertyFields.vue`,
  `CollectionPolicyExclusionFields.vue`, `CollectionPolicyListField.vue`,
  `CollectionClearOverrideDialog.vue`.
- `apps/web/app/pages/sites/[siteId]/settings/collection.vue`.

### Retention feature (owner B)

- `site-retention.types.ts`, `site-retention.utils.ts`, `site-retention.reducer.ts`,
  `useSiteRetention.ts` plus their tests.
- `SiteRetentionPanel.vue`, `SiteRetentionSummary.vue`, `SiteRetentionForm.vue`,
  `SiteRetentionClearDialog.vue`.
- Generalize `RetentionPolicyMonthFields.vue`, `RetentionConfirmationDialog.vue`; replace
  `RetentionPolicySummary.vue` with `RetentionPolicyCard.vue`; add `proposedPolicy` and the scope
  parameter on `normalizeRetentionError` in `retention-policy.utils.ts`; update
  `RetentionAdminContainer.vue`, `RetentionPolicyForm.vue`, and the affected tests.
- `apps/web/app/pages/sites/[siteId]/settings/retention.vue`.

## Contracts both owners follow

- Types derive from `CimiOrpc` in `~/plugins/orpc`. No inline transport shapes; no `any`.
- Only `{computed, ref, shallowRef, watch, reactive, onMounted, onScopeDispose, nextTick}` plus
  project composables in `<script setup>`. No `defineAsyncComponent`, no dynamic imports.
- Reuse `components/ui/*` and their documented composition. Read the local `AGENTS.md` first.
- Vue files over 200 lines get split (utils, then large element, then small element).
- No narrating comments. A comment only explains a non-obvious why.
- Tests: Vitest, `vi.hoisted` mock of `@/composables/useOrpc`, controllers exercised inside
  `effectScope()`. Pure utils and reducers get their own unit tests. Sociable over solitaire.
- Server error text is never copied into a failure message. Codes and statuses map to fixed safe
  strings through the existing error utilities.

## Verification

Per feature: unit tests for utils, reducer, and controller, run narrow with
`vp exec vitest run <paths>` from `apps/web`. Then `vp check --fix <files>`. Then an
agent-browser smoke test against the dev server on port 3010 driving both pages signed in as a Site
admin: load, edit, save, clear, and the mobile viewport.
