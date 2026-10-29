# opencode-gh-prs

Review the GitHub pull requests a session mentions without leaving OpenCode. Every
`github.com/<owner>/<repo>/pull/<n>` link in the transcript, plus the PR of the session
directory's current branch, gets a view with its description, diff, CI checks and
conversation, and buttons to merge, approve or comment.

All GitHub access goes through the `gh` CLI on the machine that runs the OpenCode server,
so it uses your existing `gh auth login`.

## Desktop

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
- Open PRs refresh every 30 seconds while visible. The list refreshes after each agent turn.

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
bun run typecheck
```

Layout: `src/index.ts` (server: finds PR links, calls `gh`), `src/rpc.ts` (the contract),
`src/gui.tsx` + `src/gui/` (desktop), `src/tui.tsx` (terminal), `src/merge.ts` and
`src/shared.ts` (shared logic).
