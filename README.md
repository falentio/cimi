# Cimi - Web Analytics

Cimi is a self-hosted web analytics product built around embedded SQLite and DuckDB in a single-node deployment.

## Status

The resource specifications and typed contract declarations define the planned first-release behavior. They remain `draft` until their runtime handlers and persistence boundaries are implemented. The API currently serves authentication routes, `GET /api/system/health`, the illustrative `hello` routes, the `installation`, `organization`, `membership`, `invitation`, `site`, `retention-policy`, `collection-policy`, `backup-restore`, `event-ingestion`, and `identity-profile` resource procedures, and the `traffic-report`, `event-report`, `goal`, `funnel`, `cohort-retention`, and `public-dashboard` reporting procedures. Other first-release product procedures remain planned.

## Set up the dev environment

Run these steps after you clone the repository or create a worktree. The setup
script does the whole job and is safe to rerun.

```bash
bash scripts/setup-dev-env.sh
```

The script installs workspace dependencies, creates `.env` from `.env.example`
with a generated `BETTER_AUTH_SECRET`, points `CIMI_DATA_DIR` at an absolute
path, and creates the data directory.

Start the web dev server. It also serves the API:

```bash
vp run --filter ./apps/web dev --dotenv ../../.env
```

Open `http://localhost:3000`. The home page renders the app shell, and the API
answers at `/api/system/health`.

### What the setup does by hand

Do these steps yourself only when the script cannot run.

1. Install dependencies. This also prepares Nuxt:

   ```bash
   vp install
   ```

2. Create `.env` from `.env.example` and set `BETTER_AUTH_SECRET` to a random
   value:

   ```bash
   cp .env.example .env
   sed -i "s|replace-me|$(openssl rand -base64 32)|" .env
   ```

3. Set `CIMI_DATA_DIR` to an absolute path, then create it:

   ```bash
   printf 'CIMI_DATA_DIR=%s/.cimi\n' "$PWD" >> .env
   mkdir -p .cimi
   ```

   Nuxt runs the dev server with `apps/web` as the working directory, and the
   API resolves `CIMI_DATA_DIR` against that working directory. A relative
   `.cimi` in `.env.example` makes the API look for `apps/web/.cimi` and fail
   with `Configured data directory is not ready`. An absolute path avoids this.

The API creates `control.sqlite` and `analytics.duckdb` in the data directory
and applies migrations on the first request, so no separate database step is
needed.

### Notes

Nuxt does not load `.env` into the server process. Pass `--dotenv ../../.env`
to the dev command, or export the variables into the shell before you start the
server. Without `BETTER_AUTH_SECRET`, the API returns HTTP 500 with
`Invalid environment configuration`.

The API needs `CIMI_DATA_DIR` to already exist. The setup script and the manual
steps create it.

## Documentation

- [Resource specifications](docs/specs/README.md)
- [First-release capabilities](docs/CAPABILITIES.md)
