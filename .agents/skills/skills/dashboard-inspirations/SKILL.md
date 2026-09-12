---
name: dashboard-inspirations
description: Capture a product's dashboard as full-page screenshots for design inspiration, stored under docs/inspirations. Use when the user asks for "similar work" on a product URL, to gather dashboard screenshot inspirations, to register on a SaaS with temp mail, or to add the next product to docs/inspirations.
---

Capture a target product's dashboard end to end: account, site, seeded data, every page, verified screenshots in `docs/inspirations/{domain}/` (domain with TLD, e.g. `umami.is`). Run under poteto-mode and open with a todowrite.

## 1. Setup

1. Create the output directory.
2. Derive an agent-browser session and keep it for the run:

```bash
export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix {slug}-inspo)"
```

3. Launch with the sandbox flag (`--args "--no-sandbox"` on the first `open`) and check the daemon (`agent-browser doctor --offline --quick`).

## 2. Access ladder

Take the highest rung that works. Read the product's source before fighting any wall.

1. **Hosted signup.** Create a fresh mail.tm account (see step 3), register, verify. Record where the wall sits: some trials demand a card (Plausible does not, getopen did).
2. **Client-side gate.** If a mandatory onboarding flow blocks authenticated pages, find the gate in the OSS repo. Hosted gates are often a localStorage flag or a `sites.list()` inheritance check; set the flag for the real `userId` from the session endpoint.
3. **Public demo or share link.** Analytics vendors expose their own traffic through demo dashboards and share slugs. Capture those for populated data.
4. **Self-host the OSS repo** with seeded data; see [`self-host-seeding.md`](self-host-seeding.md) for stand-up, same-origin wiring, and seeder verification.

Payment walls: capture the checkout page and stop. No payment details, no fabricated cards.

## 3. Temp mail on mail.tm

The API is mail.tm; complete every step in one script:

1. `POST /accounts` and persist the **response's** `address` (requested addresses get normalized, dots stripped).
2. `POST /token` with that same response address; persist the token.
3. Message list at `GET /messages` with `Authorization: Bearer $token`; single message at `GET /messages/{id}` with `Accept: application/ld+json` for the HTML body.
4. Care for the three invite shapes: 6-digit activation codes, magic links (extract from the HTML and open the inner api URL, not the tracking redirect), and JWT verify links.
5. Credentials live in `/tmp/opencode/{slug}-creds.txt` and stay on this machine.

## 4. Site and data

Most flows need one site/project before pages exist, and pages read far better populated.

1. Create a site through the UI (their dialogs are inspiration too; screenshot each).
2. Prefer the vendor's documented events API first (Plausible `POST /api/event`). Otherwise clone the repo into `docs/vendor/{forge}/{org}/{repo}/{ref}/` per `docs/vendor/README.md` and read the ingest route schema before writing a seeder. The table the dashboard queries decides which endpoint feeds it; Rybbit's `/track` wrote one its dashboard never read while `/batch` fed the real one. A success status is not delivery: their bot rejection answers `204` with an empty body, which `fetch` counts as success. Ship a real browser `User-Agent` on every request and verify landed rows through a query endpoint (stats API, ClickHouse count) before trusting the seed.
3. Events land "now", so the today view carries the best-populated charts.

## 5. Capture loop

1. Enumerate: read nav hrefs from the DOM, plus known URL families (`/settings?tab=`, `/settings/*` subpaths) confirmed from the vendor repo's router.
2. Before each screenshot, confirm the page identity from rendered DOM text (heading, `h1`/`h2`) or URL. A `?tab=` change with an unchanged heading is the same page wearing a new URL.
3. `agent-browser wait --load networkidle`, then sleep long enough for charts and globes (3-5s), then `agent-browser screenshot --full <OUT>/<NN-name>.png`.
4. Popovers, dialogs, panels, theme variants are pages too: open, screenshot, Escape. Include upgrade/gated states and one opposite-theme capture when one click away.
5. Marketing home, pricing, and any public own-traffic dashboard join the set.

Naming: zero-padded `NN-kebab-name.png`, one prefix family per source (hosted pages, mock or self-host variants, marketing), never reused across sources.

## 6. Verify and convert

1. `md5sum *.png`, then fix every duplicate pair by recapture against DOM checks or deletion; a duplicate usually means a stale tab or a 404 wearing a template.
2. Convert and check in one pass: `convert "$f" -quality 90 "${f%.png}.webp"`, delete the png, then confirm `file *.webp` reports only `Web/P image data`.
3. The report lists every capture with its source (hosted, demo, self-host), surfaces still missing, and leftover state (credentials, vendor clones, running services).

## 7. Cleanup

Bid own-session `close --all`; `docker compose down` for any local stack; stop helper processes by PID from `lsof -t -i :port`, never `pkill`. Vendor clones stay (gitignored) unless the report says otherwise.
