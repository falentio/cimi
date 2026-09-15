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
- Utils placement "components/features/{feature-name}/utils.ts"
- ALWAYS fetch docs from "https://www.shadcn-vue.com/llms.txt" before working with "components/ui"
- Use webfetch tool, dont use tinyfish whenever fetching "https://www.shadcn-vue.com/*"
- Reuse components/ui/* as much as possible, dont invent any component without explicit signal.
- Component should rely on type from "packages/contract" rather than inline
- Always smoke-test using agent-browser cli (run `agent-browser skills get core` first before any agent-browser operations)
- Run smoke-test inside subagents/task tool.
- If Vue files/components has more than >200 lines, extract these (prioritized, first listed win): {utils fn, large element, small element}
