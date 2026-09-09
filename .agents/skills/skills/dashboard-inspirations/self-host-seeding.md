# Self-host seeding

The self-host rung of the access ladder: standing up the vendor's OSS stack when hosted pages are paywalled or the demo lacks surfaces. Read the repo's root `AGENTS.md`/`CLAUDE.md`/`README.md` first; it owns the real commands and known traps.

## Decide if it is worth it

Self-hosting earns its keep when the hosted or demo surface misses whole product areas (Rybbit's demo had no settings, its self-host had all of them). Skip it when the hosted trial already shows everything (Plausible) or the missing surfaces are small.

## Stand up

1. Read `docker-compose.yml` and `.env.example` end to end before running anything. The compose file names the env vars that matter.
2. `BASE_URL` is load-bearing beyond a URL: it seeds CORS trust lists and cookie flags. The browser reaches the app from `http://localhost`, so set `BASE_URL` to match what the browser will request.
3. Compose port mappings like `HOST_CLIENT_PORT=127.0.0.1:3002:3002` are invalid as a whole `host:container:container` triple; set the plain `3002:3002` form.
4. When frontend and backend are separate services on separate ports, same-origin wiring is required (Caddyfile in the repo shows the routing; a 30-line Node proxy replicating it is enough). Cookie flags and CORS both assume one origin.
5. Start detached (`setsid nohup ... < /dev/null &`); a backgrounded compose up tied to the shell dies with the shell and strands half-pulled images.

## Register and seed

1. Registration may work through the UI, or through the backend's auth endpoint (better-auth: `POST /api/auth/sign-up/email`). Try the UI first; fall back to the API when a headless-hostile widget (Turnstile, CAPTCHA) blocks it.
2. Some instance state is fine to set in Postgres directly when the app exposes no switch (Rybbit's per-site `blockBots`), but prefer reading the ingest code first; the right flag is usually one column, and flipping it is the difference between a populated and an empty dashboard.
3. Write the seeder against the ingest route's Zod schema from the repo, not against a guessed shape. The page the dashboard reads is the ground truth for which endpoint to hit; `grep` the query builders for the table name and follow it back to the ingest route that fills it.
4. Seed pacing: hundreds of events in a tight loop trips rate-anomaly bot detection. 10-20ms between batches lands clean; carry the browser `User-Agent` rule from `SKILL.md` step 4.
5. Verify landed rows before any screenshot: ClickHouse `SELECT count()` inside the container, or the product's own stats endpoint.
