# Pele diagrams for OpenCode Desktop

Render `mermaid` fences as theme-matched SVG, with zoom, pan, resize-aware layout,
and an expandable source view. Rendering runs locally. Diagram links and images
are disabled, and DOMPurify sanitizes the SVG before insertion.

OpenCode Desktop `2.2.6` already uses Pele. This plugin changes the presentation
and uses Pele's `mount()` API for resizing and zoom. It does not add a renderer
to the terminal UI. The GUI plugin API is experimental.

## Build and install

Run `bun install` and `bun run build` here, then `sh ~/dev/dotfiles/opencode.sh`.
The installer copies plugins to OpenCode's global plugin directory. Use `/reload`
if the plugin does not appear automatically. No agent instructions or custom
diagram syntax are required.

Run `bunx playwright install chromium` once, then `bun run test` for browser
checks. Run `bun run format` for Oxfmt, `bun run lint` for Oxlint, or `bun run check`
for formatting, lint, TypeScript, browser tests, and the production build. Generated
bundles and test artifacts are excluded from formatting and linting. The committed `dist/` bundle
must be rebuilt after source changes so the dotfiles installer copies current code.

## Controls

Use the zoom buttons for 10% steps, pinch, or `Cmd`/`Ctrl` + wheel. Drag to pan a zoomed diagram.
Graphs are centered horizontally and vertically in their inline and popup blocks.
**Expand** opens a popup at 95% of the session pane's width, with height based on
the graph plus padding and controls, capped at 80% of the pane height. Both
sidebars stay uncovered and usable. The popup follows pane resizing and closes when its
session content is hidden. **Close**, `Escape`, or clicking a sidebar dismisses it.
Zoom, Fit, and Expand are grouped icon buttons with hover and keyboard-focus tooltips.
The toolbar reserves space for OpenCode's Copy button. Labels use the app's sans-serif
font and base text size (14px by default). Nodes get stable blue, violet, teal, and amber
accents; explicit colors in the Mermaid source still take precedence.
The focused diagram also accepts `+`, `-`, `0`, and arrow keys. Expand **Mermaid
source** to inspect the original text, including when Pele cannot render it.

See [Pele](https://pele.run/api) and the
[OpenCode GUI plugin API](https://opencode.ai/docs/build/plugins/gui#code-blocks).
