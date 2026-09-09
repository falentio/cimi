# Frontend route structure for apps/web

Decision document for the Nuxt 4 frontend (`apps/web`) on branch `feat-new-frontend`. It fixes the route tree, the layouts, the sidebar information architecture, page content, and navigation behavior. Vocabulary follows `CONTEXT.md` (Organization, Site, Personal Organization, Active Organization, Public Dashboard).

## Starting point

The placeholder shell copies a generic dashboard template. That copy made three choices: put everything authenticated under `/app`, wrap every page in one sidebar, and fill the sidebar with template navigation (Playground, Models, Documentation, Projects). All three are placeholders, and this branch exists to replace them.

Cimi is a self-hosted, single-node analytics product. There is no marketing site, no multi-app origin, no app switcher surface. The routes that are not the dashboard are sign-in, sign-up, first-run setup, Invitation acceptance, and the Public Dashboard. A fixed `/app` prefix adds a segment that does no routing work, lengthens every deep link, and pairs with the breadcrumb label `Workspace` in `apps/web/app/layouts/app.vue:33`, a term `CONTEXT.md` avoids for Organization.

The replacement principle: prefix a route subtree only when its trust boundary differs from the authenticated dashboard. That yields exactly two prefixed areas, `/admin` (installation operator posture) and `/public` (unauthenticated, noindex). Everything else sits flat at the root. This is also the conventional shape for self-hosted analytics products: the logged-in home lists Sites, a click opens a Site dashboard, reports are tabs inside it.

## Route structure

```text
apps/web/app/pages/
  index.vue                          /                        Sites of the Active Organization. Ships (site, organization).
  login.vue                          /login                   Sign in. Exists; stays.
  signup.vue                         /signup                  Sign up. Exists; stays.
  setup.vue                          /setup                   First-run installation flow. Ships (installation).
  invite/[token].vue                 /invite/:token           Invitation acceptance. Ships (invitation).
  sites/[siteId].vue                 /sites/:siteId           Site shell: Site header, tab bar, <NuxtPage />. Ships (site).
  sites/[siteId]/index.vue           /sites/:siteId           Overview tab. Ships as a shell; traffic content reserved (trafficReport).
  sites/[siteId]/events.vue          /sites/:siteId/events    Reserved (eventReport is contract-only).
  sites/[siteId]/goals.vue           /sites/:siteId/goals     Reserved (goal).
  sites/[siteId]/funnels.vue         /sites/:siteId/funnels   Reserved (funnel).
  sites/[siteId]/cohorts.vue         /sites/:siteId/cohorts   Reserved (cohortRetention).
  sites/[siteId]/settings/index.vue  /sites/:siteId/settings  Redirect to /sites/:siteId/settings/general. Ships.
  sites/[siteId]/settings/general.vue         Site name, Reporting Timezone, Week Start. Ships (updateSiteV2, rotateIngestionIdentifier).
  sites/[siteId]/settings/retention.vue       Site retention override. Ships (retentionPolicy).
  sites/[siteId]/settings/danger.vue          Delete Site, recovery, deletion status. Ships (deleteSite, recoverSite, getSiteDeletionStatus).
  sites/[siteId]/settings/collection.vue      Reserved (collectionPolicy, eventIngestion).
  sites/[siteId]/settings/public-dashboard.vue  Reserved (publicDashboard configuration).
  settings/index.vue                 /settings                Redirect to /settings/general. Ships.
  settings/general.vue               /settings/general        Organization profile. Ships (organization).
  settings/members.vue               /settings/members        Members and Invitations. Ships (membership, invitation).
  settings/danger.vue                /settings/danger         Leave, delete Organization. Ships (membership, organization).
  settings/account.vue               /settings/account        User profile, email verification, sign out. Ships (Better Auth session).
  admin/index.vue                    /admin                   Installation status, upgrade, health probe. Ships (installation, health).
  admin/retention.vue                /admin/retention         Installation retention defaults. Ships (retentionPolicy).
  admin/backup-restore.vue           /admin/backup-restore    Backups and restore. Ships (backupRestore).
  public/[identifier].vue            /public/:identifier      Public Dashboard. Reserved (publicDashboard is contract-only).
```

Nuxt nesting note: `sites/[siteId].vue` is the parent route. It renders the Site header, the tab bar, and `<NuxtPage />`; every sibling file under `sites/[siteId]/` renders inside it. Without `<NuxtPage />` in the parent, the tab pages render nothing.

The old `apps/web/app/pages/app/index.vue` placeholder and the `/` redirect to `/login` in `apps/web/app/pages/index.vue` are deleted by this decision. `/` becomes the dashboard home; the auth guard sends unauthenticated visitors to `/login`.

Ship state follows `apps/api` registration: `health`, `installation`, `organization`, `membership`, `retention-policy`, `site`, `invitation`, and `backup-restore` are served; `hello` is an illustrative sample and is never a navigation candidate. The rest of the 18 resources in `packages/contract/src/contract.ts` are contract-only and reserved above. Reserved routes are files created now with an explicit unavailable state, so shipping a resource adds a page implementation and flips one config entry; no shipped URL changes shape. `docs/specs/README.md`'s status paragraph still lists `backup-restore` as contract-only, which is stale against the current router; the README's own rule is to track route registration, and this doc follows the router.

## Organization and Site scoping in URLs

The Organization never appears in a URL. `CONTEXT.md` defines the Active Organization as a navigation and creation context, not an authorization boundary, and the server checks persisted membership per request and masks foreign resources as 404. Site URLs therefore need no Organization segment to be safe, and the Personal Organization, which `CONTEXT.md` says is provisioned lazily on first authenticated dashboard open, stays out of every URL.

Consequences:

- Site deep links are `/sites/:siteId/...` and work regardless of which Organization the linker had active.
- Opening a Site whose Organization differs from the Active Organization switches the Active Organization to that Site's Organization, so the sidebar always matches the URL subject.
- `/admin` and `/public` carry prefixes because their posture differs from the dashboard, not because they are "areas".

The Public Dashboard URL is `/public/:identifier`, where the parameter is the random, rotatable Public Dashboard Identifier from `docs/specs/analytics-reporting/public-dashboard/SPECS.md`. No Site ID, Organization ID, or Ingestion Identifier appears in a public URL. The identifier is a locator, not a credential; rotation and disable invalidate it, and the route renders whatever the identifier currently resolves to or a plain not-found.

## Layouts

`apps/web/app/app.vue` currently sniffs `route.path` for `/app` to pick a layout (`apps/web/app/app.vue:3`); that goes away and becomes a plain `NuxtLayout` around `NuxtPage`. Each page declares its layout with `definePageMeta({ layout: ... })`. Pages that omit the meta get the authenticated shell, which is loud enough to notice in review.

| Layout    | File                                                       | Provides                                                                        | Routes                                          |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| `default` | `app/layouts/default.vue` (renamed from `layouts/app.vue`) | SidebarProvider, AppSidebar, SidebarInset, breadcrumb header                    | `/`, `/sites/**`, `/settings/**`, `/admin/**`   |
| `bare`    | `app/layouts/bare.vue` (new)                               | Centered panel, no navigation, no session requirement                           | `/login`, `/signup`, `/setup`, `/invite/:token` |
| `public`  | `app/layouts/public.vue` (new)                             | Thin header with Site name, `noindex,nofollow` head tags, no links into the app | `/public/:identifier`                           |

Settings and admin do not get their own layouts. One installation has one operator; dedicated chrome would imply a product split that does not exist. The `public` layout exists so the meta hardening required by the Public Dashboard spec cannot be forgotten per page; the 90-day window cap and rate limits are server-side.

## Sidebar

The shell components live in `apps/web/app/components/features/app-shell/` (`AppSidebar.vue`, `NavMain.vue`, `NavProjects.vue`, `NavSecondary.vue`, `NavUser.vue`, `OrganizationSwitcher.vue`). All nav data there is hardcoded placeholder with raw `<a>` tags (`NavMain.vue:43`) and `url: '#'` entries. The final anatomy:

- Header: `OrganizationSwitcher.vue`, made real. Lists the User's Organizations from `organization.listOrganizations` (served), marks the Active Organization with a Personal Organization marker, and offers `createOrganization`. The template's plan labels (`Enterprise`, `Growth`, `Free`) are deleted; no billing resource exists in the contract.
- Content: the Sites list, repurposing `NavProjects.vue`. Group label "Sites", data from `site.listSites(organizationId)`, which is member-scoped. Each item links to `/sites/:siteId`. The per-item dropdown holds Open and Site settings. A "New Site" action in the group header opens a create dialog (`createSite`, Organization administrator posture). Deleted-Site recovery for administrators (30-day window per `docs/adr/0006-recoverable-site-deletion.md`) gets a filtered view here and in the danger zone. The template's project rows and the trailing "More" button (`NavProjects.vue:76`) do not survive.
- Secondary, bottom of the content area via `NavSecondary.vue`: Settings (`/settings`) and Admin (`/admin`). Admin is visible only when the session exposes the installation grant. The template's Support and Feedback entries are deleted; no contract resource backs them.
- Footer: `NavUser.vue`, real session data from `apps/web/app/composables/useAuth.ts`, with Sign out wired to `useAuth().signOut`. The `Upgrade to Pro`, Billing, and Notifications items are deleted.
- `NavMain.vue` leaves the composition. Report navigation moves to the Site tab bar (see below), so its only remaining job was template content.

Report navigation inside a Site is a tab bar in the `sites/[siteId].vue` shell: Overview, Events, Goals, Funnels, Cohorts, Settings. Each tab is a real route, so every report stays deep-linkable. Tabs appear per the ship rule; nothing renders disabled. This replaces the earlier draft's sidebar context switch, which swapped the sidebar's contents on `/sites/**` routes and hid the Site list while a Site was open. The tab bar keeps one stable sidebar and matches the convention of established analytics products.

All sidebar entries render `NuxtLink` instead of raw `<a>`, so active states and prefetching work. Nav metadata lives in one typed nav config under `components/features/app-shell/` per the feature convention in `apps/web/AGENTS.md`, and each entry declares the contract resource it depends on. The ship rule is enforceable in one place: an entry renders only when its resource is served, and the same served-resource module drives the reserved pages' empty states.

`useAuth.ts` exposes `id/name/email/emailVerified/image` only; no role and no installation grant. Until the session surface exposes the grant, the Admin entry hides and `/admin` relies on the server's 403. Exposing `role` and `installationGrant` through the Better Auth session customization (the client already loads the admin plugin in `apps/web/app/plugins/auth.client.ts`) is a prerequisite.

## Page content

- `/` (Sites home): the Active Organization's Sites from `listSites`. Site rows with name, hostname, and status. New Site action for administrators. Deleted-Site recovery view for administrators. Pagination uses the contract's zero-based `offset`/`limit` live pages (`nextOffset`, `hasMore`); the installation envelope is up to 20 Sites (`docs/specs/system-data-lifecycle/installation/SPECS.md`), so the list fits one page in practice. First open triggers `ensurePersonalOrganization`, which is idempotent.
- `/sites/:siteId` (Overview): Site facts from `getSite` while reports are reserved. When `trafficReport` ships, it becomes the traffic overview with the Query Date Range picker and bucketed timeseries from `docs/specs/analytics-reporting/METRICS.md`.
- `/sites/:siteId/settings/general`: name, Reporting Timezone, Week Start (`updateSiteV2`); Ingestion Identifier display and rotation (`rotateIngestionIdentifier`).
- `/sites/:siteId/settings/retention`: Site-level retention override over the installation default (`retentionPolicy`).
- `/sites/:siteId/settings/danger`: delete Site (owner only), with 30-day recovery copy and `recoverSite`; deletion status for installation admins (`getSiteDeletionStatus`).
- `/settings/general`: Organization profile (`updateOrganization`, administrator posture).
- `/settings/members`: Members table with Organization Role (Owner, Administrator, Member) and role actions (`changeMemberRole`, `removeMember`, `transferOrganizationOwnership`), plus the Invitation list (`listInvitations`, `createInvitation`, `revokeInvitation`) with link copy.
- `/settings/danger`: leave (`leaveOrganization`) and delete Organization (`deleteOrganization`, owner only). Hidden for the Personal Organization, which `CONTEXT.md` says cannot be destructively removed.
- `/settings/account`: Better Auth profile, email verification state, sign out. This is the User account; the `identityProfile` resource is an analytics dimension for report filters and has no route here or anywhere.
- `/admin`: installation status and operation progress (`getInstallationStatus`), upgrade action (`upgradeInstallation`), health probe.
- `/admin/retention`: installation retention defaults (`getRetentionPolicy`, `updateRetentionPolicy`).
- `/admin/backup-restore`: backup list, create (`createBackup`), restore (`restoreBackup`) with the explicit `RESTORE` confirmation the contract requires.
- `/setup`: first-run flow. Offers account creation when no User exists (the first registered User is auto-promoted to admin, `packages/auth/src/first-user-admin.ts`), then `initializeInstallation`, then redirects to `/`. Redirects to `/` when the installation is already ready.
- `/public/:identifier`: read-only Public Dashboard aggregates. Reserved until `publicDashboard` ships.

## Navigation

- Active Organization persistence: a cookie the server can read, mirrored in the client store. Not a URL segment. Resolution order on load: the cookie value if the User holds a Membership in it, else the Personal Organization, else the first Membership. Switching writes the cookie, refetches organization-scoped queries (Colada keys scoped by `organizationId`, client from `apps/web/app/plugins/orpc.ts`), and navigates to `/`. Opening a foreign Site switches the Active Organization to that Site's Organization; the switch is correct per the URL-subject rule and should be observable in the breadcrumb.
- Deep links: `/sites/:siteId/...` links are stable and shareable. Organization-scoped links (`/`, `/settings/**`) resolve against the Active Organization, so copying them means "for whichever Organization I was in". That is the accepted cost of keeping the Organization out of the URL.
- Guards: `apps/web/app/middleware/app-auth.global.ts` becomes `auth.global.ts` and keys on route meta instead of the `/app` prefix. Bare and public pages declare `auth: false`; everything else requires a session, so the default is fail-closed and a new authenticated page cannot forget the guard. Today's middleware early-returns on `import.meta.server` and the auth client throws server-side (`useAuth.ts:145`), so the redirect stays client-side; the real boundary is the server's 401. Redirect after sign-in keeps the existing `redirect` query behavior (`app-auth.global.ts:11`).
- Breadcrumbs derive from route matches, not from capitalized path segments: Active Organization name, then Site name when a Site is open, then the section. The hardcoded `Workspace` label is removed.
- Active states come from `NuxtLink` matching: Site items match on the `siteId` param, tabs match their exact path.
- Errors map through the catalog in `packages/contract/src/schema/errors.ts`: 401 redirects to `/login` with `redirect`; 403 renders an inline permission notice; the masked 404 renders the standard not-found state inside the shell rather than a redirect, so the User sees which context failed. Pending governance operations make Organization reads fail closed with 409; org pages show a retry state.
- When a contract-only resource ships, its reserved page gets an implementation and its nav entry appears additively. No shipped URL changes shape.

## Coverage: served resources to routes

| Served resource   | UI homes                                                |
| ----------------- | ------------------------------------------------------- |
| `health`          | `/admin` probe                                          |
| `installation`    | `/setup`, `/admin`                                      |
| `organization`    | `/`, `/settings/general`, `/settings/danger`            |
| `membership`      | `/settings/members`, `/settings/danger`                 |
| `invitation`      | `/invite/:token`, `/settings/members`                   |
| `site`            | `/`, `/sites/:siteId/**`                                |
| `retentionPolicy` | `/admin/retention`, `/sites/:siteId/settings/retention` |
| `backupRestore`   | `/admin/backup-restore`                                 |

Reserved: `trafficReport` fills the Overview tab; `eventReport`, `goal`, `funnel`, `cohortRetention` own their named tabs; `collectionPolicy` and `eventIngestion` own `settings/collection`; `publicDashboard` owns `/public/:identifier` and the Site settings public-access page; `identityProfile` is a filter dimension, not a page.

## Trade-offs

| Decision                                         | Alternative                               | Why this wins                                                                                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flat URLs, no `/app` prefix                      | Keep the prefix                           | The prefix does no routing work on a single-product origin; deep links get shorter; the `Workspace` vocabulary conflict disappears. A future co-tenant app on the origin would need a prefix added back, which is additive. |
| Organization in a cookie, not the URL            | Org segment in every URL                  | Active Organization is navigation context, not authorization (`CONTEXT.md`). Site URLs stay stable across switches, and the Personal Organization stays invisible. Org-scoped links are context-relative.                   |
| `/` is the Site list                             | Separate overview page and `/sites` index | One less page; matches the 20-Site envelope; a cross-Site aggregate home can be added later without URL churn.                                                                                                              |
| Report tabs inside the Site shell                | Sidebar context switch per route          | One stable sidebar; deep-linkable reports; the familiar analytics convention.                                                                                                                                               |
| Reserved route files for contract-only resources | Omit routes until served                  | No URL churn at ship time; stale links degrade to an explicit state instead of a 404.                                                                                                                                       |
| Client-only guard for now                        | Server-side session resolution during SSR | The auth state machine lives in client `useState`. The server's 401 is the real boundary. Server-side resolution is deferred, not cancelled.                                                                                |

## Conflicts surfaced

- `apps/web/app/layouts/app.vue:33` and `apps/web/app/pages/app/index.vue` use `Workspace`. Both are placeholders this decision replaces; the term conflicts with `CONTEXT.md` and is banned in this surface.
- `docs/specs/README.md`'s status paragraph still lists `backup-restore` as contract-only while `apps/api/src/orpc.ts` registers its router. The paragraph's own rule is to track route registration; it should be updated.

## Deferred open questions

- Server-side session resolution for SSR of authenticated pages. The browser-only auth client cannot answer a session probe on the server today.
- Cookie name, lifetime, and cross-tab sync for the Active Organization.
- Overview tab composition; decides when `trafficReport` ships.
- Whether `/admin` splits into more sub-routes; only if operator surfaces grow beyond installation, retention, and backup-restore.
- The exact Invitation URL format the API emits; `docs/adr/0007-custom-bearer-invitations.md` fixes the bearer semantics, not the frontend landing path.

<!-- arena synthesis
Base: candidate-3 (flat URL space, trust-boundary prefixes, cookie Active Organization, ship-rule sidebar). Cross-judge verdict agreed: C3 scored highest on factual precision and domain fidelity and was the only candidate honoring CONTEXT.md vocabulary.
Grafted from candidate-1: /settings/account page (User account from Better Auth; identityProfile correctly kept out), the served-resource module driving reserved empty states, and report navigation as in-page tabs inside the sites/[siteId].vue shell (replaces C3's sidebar context switch; familiar analytics convention).
Grafted from candidate-2: typed nav config with per-entry resource dependency (ship rule enforceable in one place), settings split into sub-routes (org settings general/members/danger/account, site settings general/retention/danger plus reserved collection and public-dashboard), Active Organization resolution order on load, redirect-index pattern for settings areas.
Rejected from candidates 1 and 2: keeping the /app prefix (the prefix does no routing work and both artifacts encoding it are placeholders this branch replaces), /public vs /share resolved to /public (2-of-3 candidate convergence and the literal resource name), goal detail routes (goals/[goalId].vue) and membership-scoped organization listing (C1 miswire; listOrganizations is the served procedure), identityProfile as an account-page reservation (it is an analytics dimension).
Fixes applied during grafting: C1's Nuxt parent/child trap made explicit (sites/[siteId].vue renders <NuxtPage />), C3's loose grouping of recoverSite and getSiteDeletionStatus split by role, C3's "ste/org identifier" wording dropped.
Verification: line citations app.vue:3, layouts/app.vue Workspace breadcrumb, NavMain.vue:43 raw <a>, app-auth.global.ts redirect query, useAuth.ts server throw, and the 20-Site envelope in installation SPECS were all spot-checked against the working tree. All three candidates written to /tmp/opencode/arena-routes/candidate-{1,2,3}.md.
-->
