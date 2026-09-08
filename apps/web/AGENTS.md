## Running dev server

- If inside herdr worktree, then always make dev server running at tab named "web dev" and inside worktree of workspace
- If not in main or not working with frontend related work, then dont spawn dev server unless requested
- If not in main, assign random port to dev server, append it to tab name to "web dev (8080)"
- If machine has active tailscale, then also listen to tailscale address
- Wait dev server ready using curl and delay (3s,3s,3s,3s,5s,5s,5s)
- Manage the tab to only has 1 dev server run-ed per worktree

## Rules
- Components placement "components/features/{feature-name}/*.vue"
