# Local development authentication

Use this guide to sign up or sign in to the local Cimi web app. Do not commit account credentials or print authentication secrets.

## Auth decisions

- Cimi enables email and password authentication.
- Passwords need at least 8 characters.
- Signup creates a session immediately. The current development configuration does not require email verification.
- The signup UI contains email-oriented verification copy. Verify the session instead of waiting for email.
- Only the first user in the configured auth database receives the global Better Auth role `admin`. Later users do not receive `admin`.
- There is no supported seed command, account-creation command, or admin-promotion command. Use the signup UI or the signup API route to create an account. Do not edit SQLite directly.
- The `role` field in the credential registry records the global Better Auth user role, `admin` or `user`. Organization roles are separate and are `owner`, `admin`, or `member`. An organization `admin` is not a global `admin`.

## Credential registry

Read `docs/login.csv` before creating an account. Reuse a verified row when one is available.

The file is local and ignored by Git. Its first four columns must be exactly:

```text
email,password,role,descriptions
```

Append optional columns only after those four. Use `organization_role`, `organization_id`, and `last_verified_at` when those facts are needed. Keep existing extra columns and their order. Use a CSV-aware reader and writer so fields with commas, quotes, or newlines keep valid CSV quoting.

If the file does not exist, create it with this header and mode `600`:

```bash
umask 077
if [ ! -e docs/login.csv ]; then
  printf '%s\n' 'email,password,role,descriptions' > docs/login.csv
fi
chmod 600 docs/login.csv
```

Never print the file, passwords, cookie jars, tokens, or other authentication secrets.

Add a newly created account only after a successful session check. Record the global role returned by `GET /api/auth/get-session`. Do not store cookies or tokens in the registry.

## Setup

Run these commands from the repository root:

```bash
bash scripts/setup-dev-env.sh
vp run --filter ./apps/web dev --dotenv ../../.env
```

Open `http://localhost:3000`. The web dev server also serves the API.

If the server is not ready, retry this health check before signing in:

```bash
curl --fail --silent http://localhost:3000/api/system/health >/dev/null
```

## Choose or create credentials

1. Read `docs/login.csv` and choose a verified account.
2. Use the existing account through the browser path or API fallback below.
3. If no usable account exists, create a unique local account with a generated password of at least 8 characters through `/signup` or `POST /api/auth/sign-up/email`.
4. Verify the new session before adding the account to `docs/login.csv`.
5. If the task needs global `admin`, create an account only when the database has no users. If the session returns global `user`, find the existing first-user credential instead of creating more accounts.

## Browser path

For a new account, open `http://localhost:3000/signup`. Enter a name, email address, password, and password confirmation. Submit the form.

For an existing account, open `http://localhost:3000/login`. Enter the email address and password. Submit the form.

After either request succeeds, open `http://localhost:3000/api/auth/get-session` in the same browser context. Confirm that the response contains the expected email and global role. Do not copy the response into logs. Do not wait for email.

## API fallback

Use this Bash flow when browser interaction is not available. It supports either signup or login, keeps the cookie jar and session response in private temporary files, and never sends the password as a command-line argument. It uses Node to build and parse JSON.

```bash
set -euo pipefail
set +x
umask 077

base_url='http://localhost:3000'
cookie_jar="$(mktemp)"
session_file="$(mktemp)"
chmod 600 "$cookie_jar" "$session_file"
trap 'rm -f -- "$cookie_jar" "$session_file"' EXIT

read -r -p 'Use signup or login? [signup/login] ' mode
read -r -p 'Email: ' email
read -r -s -p 'Password: ' password
printf '\n'

if [ "${#password}" -lt 8 ]; then
  printf '%s\n' 'Password must be at least 8 characters.' >&2
  exit 1
fi

case "$mode" in
  signup)
    read -r -p 'Name: ' name
    read -r -s -p 'Confirm password: ' password_confirmation
    printf '\n'
    if [ "$password" != "$password_confirmation" ]; then
      printf '%s\n' 'Passwords do not match.' >&2
      exit 1
    fi
    payload="$(CIMI_NAME="$name" CIMI_EMAIL="$email" CIMI_PASSWORD="$password" node -e 'process.stdout.write(JSON.stringify({name: process.env.CIMI_NAME, email: process.env.CIMI_EMAIL, password: process.env.CIMI_PASSWORD}))')"
    curl -fsS -o /dev/null -c "$cookie_jar" -X POST -H 'content-type: application/json' --data "$payload" "$base_url/api/auth/sign-up/email"
    ;;
  login)
    payload="$(CIMI_EMAIL="$email" CIMI_PASSWORD="$password" node -e 'process.stdout.write(JSON.stringify({email: process.env.CIMI_EMAIL, password: process.env.CIMI_PASSWORD}))')"
    curl -fsS -o /dev/null -c "$cookie_jar" -X POST -H 'content-type: application/json' --data "$payload" "$base_url/api/auth/sign-in/email"
    ;;
  *)
    printf '%s\n' 'Choose signup or login.' >&2
    exit 1
    ;;
esac

curl -fsS -o "$session_file" -b "$cookie_jar" "$base_url/api/auth/get-session"
role="$(CIMI_EXPECTED_EMAIL="$email" node - "$session_file" <<'NODE'
import { readFileSync } from 'node:fs'

const [sessionPath] = process.argv.slice(2)
const session = JSON.parse(readFileSync(sessionPath, 'utf8'))
const user = session?.user
if (user?.email !== process.env.CIMI_EXPECTED_EMAIL) {
  throw new Error('get-session returned a different email.')
}
if (user.role !== 'admin' && user.role !== 'user') {
  throw new Error('get-session returned no supported global role.')
}
process.stdout.write(user.role)
NODE
)"
printf '%s\n' "Session verified. Global role: $role."
```

The flow uses these routes:

- `POST /api/auth/sign-up/email` creates the account and sets the session cookie.
- `POST /api/auth/sign-in/email` signs in with an existing account and sets the session cookie.
- `GET /api/auth/get-session` verifies the expected email and global role.

After the final command succeeds, add a new account to `docs/login.csv` with a CSV-aware tool. Preserve every existing column and quote fields according to CSV rules. Store the password only in that mode-`600` file. Never print the password, cookie jar, token, or session response.

## Verification and troubleshooting

- Use `GET /api/auth/get-session` as the account check. A successful signup or signin is not enough unless the session contains the expected email and a global role of `admin` or `user`.
- If the signup request reports that the account already exists, use the login path with that account.
- The normal control database path is `.cimi/control.sqlite`. For troubleshooting, `CIMI_CONTROL_DB_PATH` takes precedence. If it is unset, the resolver uses `CIMI_DATA_DIR`, then `.cimi`, and appends `control.sqlite`.
- If the server reports invalid environment configuration, rerun `bash scripts/setup-dev-env.sh`. The API needs `BETTER_AUTH_SECRET` and an existing data directory.
- Do not edit SQLite directly, wait for email, or use the current settings or members UI as proof of organization membership. That UI is incomplete. Global account role and organization membership remain separate facts.

## Source pointers

- `README.md` documents environment setup, the web dev command, and the local URL.
- `scripts/setup-dev-env.sh` creates the local environment and data directory.
- `packages/auth/src/server.ts` enables email and password auth and loads the admin, organization, and first-user plugins.
- `packages/auth/src/first-user-admin.ts` assigns global `admin` to the first created user only.
- `apps/api/src/index.ts` mounts `/api/auth/*` and passes the Better Auth session into API requests.
- `apps/api/src/testing/api.test.ts` covers signup, the session cookie, and the auth route boundary.
- `packages/db/src/migrate.ts` defines control database path precedence.
- `apps/web/app/pages/login.vue` and `apps/web/app/pages/signup.vue` define the login and signup routes.
- `apps/web/app/components/AuthPanel.vue` defines the login and signup fields and user-facing auth copy.
- `apps/web/app/lib/auth-form.ts` enforces the 8-character password minimum.
- `apps/web/app/composables/useAuth.ts` calls signup and signin, then refreshes the session with `get-session`.
- `apps/web/app/pages/settings/members.vue` renders the incomplete members page.
