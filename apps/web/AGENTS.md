## Running dev server

- From the repository root, run `bash scripts/setup-dev-env.sh` before starting the server in a fresh clone or worktree. Rerun it when the server reports invalid environment configuration.
- Start the server from the repository root with `vp run --filter ./apps/web dev --dotenv ../../.env`.
- If Tailscale is active, add `--host 0.0.0.0` to the command so the server accepts Tailscale connections.
- Pass Nuxt flags directly after `dev`. Do not insert a standalone `--`. The extra separator can make Nuxt treat `--host` as a project root and serve a generated Nuxt welcome page instead of this app.
- Wait for the server with `curl --fail --silent --show-error --retry 20 --retry-delay 3 --retry-connrefused http://localhost:3000/api/system/health >/dev/null`.
- The server is ready for authenticated work only when the health check succeeds, `/signup` renders the Cimi form, and a signup or login followed by `GET /api/auth/get-session` returns the expected session. Read and follow [docs/DEV-LOGIN.md](../../docs/DEV-LOGIN.md) for credentials and session verification.
- If the API reports `Control migration history is incompatible`, stop the server. If the local data is disposable, move `.cimi` to a private backup location, rerun `bash scripts/setup-dev-env.sh`, and restart the server. Preserve `.cimi` and ask before resetting it when local accounts or data matter.
- If inside herdr worktree, then always make dev server running at tab named "web dev" and inside worktree of workspace
- If not in main or not working with frontend related work, then dont spawn dev server unless requested
- If not in main, assign random port to dev server, append it to tab name to "web dev (8080)"
- If machine has active tailscale, then also listen to tailscale address
  - Wait dev server ready using curl with interval 3s
- Manage the tab to only has 1 dev server run-ed per worktree
- Only 1 dev server per herdr worktree
- Only create dev server tab/pane at the herder worktree for that branch

## Rules

- Components placement "components/features/{feature-name}/*.vue"
- Utils placement "components/features/{feature-name}/utils.ts"
- ALWAYS fetch docs from "https://www.shadcn-vue.com/llms.txt" before working with "components/ui"
- Use webfetch tool, dont use tinyfish whenever fetching "https://www.shadcn-vue.com/*"
- Reuse components/ui/* as much as possible, dont invent any component without explicit signal.
- Component should rely on type from "packages/contract" rather than inline
- Always smoke-test using agent-browser cli (run `agent-browser skills get core` first before any agent-browser operations)
- Run smoke-test inside subagents/task tool.
- If Vue files/components has more than >200 lines, extract these (prioritized, first listed win): {utils fn, large element, small element}

### Dashboard layout

Authenticated pages use `app/layouts/default.vue`. This layout owns the `p-4 pt-0` shell gutter and the single centered `max-w-5xl` content column.

Feature roots use `w-full min-w-0`. Do not add a second page-level `max-w-*`, `mx-auto`, or horizontal gutter.

Narrower `max-w-*` values remain valid for local text, forms, dialogs, popovers, tables, and controls.

The `public` and `bare` layouts are outside this rule. A future full-bleed authenticated page needs an explicit layout or a documented exception.
