# opencode-gh-prs

Track the GitHub pull requests a session works on. The agent explicitly registers
each PR it creates, takes over at your request, or waits on, such as another person's
base PR. Links in chat and the current branch do not add entries.

The Desktop panel has two views. **List** groups PRs by what they need, most urgent
first: Needs you, Blocked, Agent working, Waiting for CI, Not reported, Ready, and
Done. Each heading shows a count, and each PR takes one line: a CI icon, the number,
and the title. A second line appears when there is something to say: CI when it fails
or runs, otherwise the agent's note. A PR GitHub reports as merged or closed goes to
Done, which starts collapsed, whatever its last reported status. Hover a row for the
full title and note. Icons come from [Lucide](https://lucide.dev) via `lucide-solid`.

CI says one of three things about the current commit: **All green**,
**N failing** with the failing checks named, or **N running** with the unfinished
checks named. Counts come from GitHub's full rollup; names cover the first 100
checks. Cancelled checks, which GitHub leaves behind after a merge or a newer push,
don't count as failing. Merged and closed PRs show no CI. The PR's Checks tab lists
every check.

**Stack** draws the registered PRs as a Mermaid graph: each PR sits on the PR whose
branch it targets, or on its base branch when that branch belongs to no registered
PR. Node borders follow CI and merge state. Desktop renders the graph through its
Mermaid renderer, or the Pele plugin when installed.

All GitHub access goes through the `gh` CLI on the machine that runs the OpenCode server,
so it uses your existing `gh auth login`.

## Agent tools

The plugin exposes native OpenCode tools in the `ghprs` Code Mode namespace. It is
not a standalone MCP server. Each tool uses the calling session's ID, not an
agent-supplied session ID.

| Tool         | Effect                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `register`   | Add `owner`, `repo`, and `number` to this session's tracker. Repeated calls preserve its work status. |
| `set_status` | Set `state` and a short `note` on a registered PR.                                                    |
| `list`       | Read this session's registrations and work statuses without calling GitHub.                           |
| `unregister` | Remove a registration and its status, without modifying GitHub.                                       |

Work states are `agent-working`, `waiting-user`, `waiting-ci`, `blocked`, and `ready`.
The note names the current work, blocker, or next action. A new registration has
no reported work status. The table shows when each status was reported: “Agent
working” is an agent's report, not a live heartbeat. “Ready” does not override CI
or GitHub's merge requirements.

Registrations and notes persist in plugin storage on the session's OpenCode server.
They remain visible in the table when GitHub is unavailable. They are not GitHub
comments, labels, or commit statuses. Install the updated plugin on both Desktop's
local server and the VM to use the table with remote sessions.

## Desktop

- **PRs mentioned by the agent** render as compact title cards in the timeline. The agent
  keeps its explanatory prose and adds a closed `gh-pr` fence containing one full
  `https://github.com/<owner>/<repo>/pull/<number>` URL, one `<owner>/<repo>#<number>`
  reference, or a bare `#<number>`. Bare references use the GitHub repository associated
  with the session directory. Clicking a card opens the existing PR side panel.
- The card renderer is Desktop-only. After a window registers the experimental `CodeBlock`
  renderer, it renews a short-lived capability lease for the session routed in that window.
  Only a session with an active lease tells the agent to emit `gh-pr` fences. Closing the window
  or routing away releases its lease, and abandoned leases expire after 45 seconds. Separate
  window tokens let several windows view the same session safely.
- Invalid references and GitHub lookup failures keep the original fenced code block instead of
  showing an empty card. The web app, TUI, and Desktop releases that predate `CodeBlock` never
  lease the capability, so their agents are not instructed to emit raw `gh-pr` fences. A manual
  or previously persisted fence remains plain code on those hosts.
- A **PR pill** above the composer shows the session's PRs, colored by CI state. Pick one to
  open it in the side panel.
- **Clicking a PR link** in the timeline opens it in the side panel. Add `/files` or `/checks`
  to the link to land on that tab.
- `/prs`, the command palette (**Show pull requests**), or the side panel's **+** menu open
  the list.
- Each PR tab has four sub-tabs:
  - **Overview:** merge status, reviewers, labels, and the description.
  - **Checks:** failing first. Details open in the in-app browser. **Add to prompt** attaches
    a check to the composer, and **Ask agent to fix** drafts a prompt for the failing checks.
  - **Comments:** issue comments, reviews and review threads in one timeline, with a comment
    box. **Quote in prompt** quotes a comment into the composer. Bots and resolved threads can
    be hidden.
  - **Files:** a filterable diff per file. **Open in workspace** opens the file locally.
- The header's merge button picks the right action: merge, add to the merge queue, enable
  auto-merge while checks run, or mark ready. The menu next to it lists every method,
  auto-merge, admin bypass (for admins), and draft toggling. Each merge asks first.
- On narrow screens (the web app on a phone, or any window under 768px) the panel becomes
  a **Pull requests** entry in the view menu, with larger tap targets and row actions always
  visible.
- Open PRs and the visible table refresh every 30 seconds. The list also refreshes after each completed agent turn.

## Terminal

- The sidebar lists the session's PRs. Click one to open it.
- `/prs` opens the panel. `↵` opens a PR, `esc` goes back.
- In a PR: `1`–`4` or `tab` switch between overview, checks, comments and files. `j`/`k`,
  `ctrl+d`/`ctrl+u` and `gg`/`G` scroll. On files, `n`/`p` move between files and `/` picks
  one.
- `m` merge menu, `a` approve, `c` comment, `R` request changes, `o` open in browser,
  `y` copy link, `r` refresh, `f` full screen.

## Install

Run `sh opencode.sh` from the dotfiles root. It copies the plugin to
`~/.config/opencode/plugins/gh-prs`, where OpenCode finds it without a config entry and
reloads it. The committed `dist/gui-experimental.cjs` is the desktop bundle, so installing
needs no build tools. Rebuild it after changing `src/gui*`.

OpenCode Desktop loads GUI parts only from the plugins of **its own** local server. When the
desktop app is connected to a remote server, install the plugin on both machines. The GUI
loads from the local copy and calls the remote server's copy, where the sessions and `gh`
live.

To use a `gh` binary that is not on the server's `PATH`, load the plugin from `plugins` in
`opencode.jsonc` instead, with `{ "package": "<path>", "options": { "gh": "/usr/local/bin/gh" } }`.

## Develop

```sh
bun install
bun run dev        # rebuilds the GUI bundle on change; windows reload it
bun run check      # Oxfmt, Oxlint, types, unit tests, browser tests, and GUI build
```

Run `bunx playwright install chromium` once for browser tests.

Layout: `src/index.ts` (server tools and RPC), `src/tracker.ts` (durable session registrations),
`src/tracker-tools.ts` (agent tool definitions), `src/rpc.ts` (the contract),
`src/gui.tsx` + `src/gui/` (desktop), `src/tui.tsx` (terminal), `src/merge.ts` and
`src/shared.ts` (shared logic).
