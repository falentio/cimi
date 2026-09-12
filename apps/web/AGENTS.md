## Running dev server

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
- ALWAYS fetch docs from "https://www.shadcn-vue.com/llms.txt" before working with "components/ui"
- Use webfetch tool, dont use tinyfish whenever fetching "httpswww.shadcn-vue.com/*"
- Component should rely on type from "packages/contract" rather than inline
- Always smoke-test using agent-browser cli (run `agent-browser skills get core` first before any agent-browser operations)
