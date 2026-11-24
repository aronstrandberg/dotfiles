# mpl

An OpenCode server plugin that adds a Code Mode namespace for drawing charts. A script calls `tools.mpl.guide()` once for the reference, then `tools.mpl.render({ calls, ... })` with a list of matplotlib Axes and Figure calls. The plugin renders the chart in-process with [ivarvong/mpl](https://github.com/ivarvong/mpl), a TypeScript port of matplotlib, and writes PNG and/or SVG files to `~/.local/share/opencode/charts/<date>/`. The PNG goes back as a `data:` file part, and Code Mode attaches it to the `execute` result, so the model and the timeline show the chart.

It is a port of the Pi extension in [dmmulroy/.dotfiles](https://github.com/dmmulroy/.dotfiles/tree/main/home/.pi/agent/extensions/mpl). `src/replay.ts` and the Catppuccin themes in `src/themes.ts` are close to verbatim; `src/render.ts` and the guide text are adapted; `src/tools.ts` and `src/index.ts` replace the Pi wrapper.

## Options

Set in the plugin's options in OpenCode config:

- `theme`: theme for a spec that names none. Default `catppuccin-macchiato` (dark); `catppuccin-latte` is its light twin. The server cannot see the UI appearance, so this does not follow it.
- `outDir`: base directory for chart files. A dated subdirectory is added per call.

## Build

mpl is a git dependency built by its `prepare` script. Bun does not install a git dependency's devDependencies before `prepare`, so this package uses npm.

```sh
npm install
npm run check   # format, lint, typecheck, test, build
```

`npm run build` bundles everything, fonts and colormaps included, into `dist/server.js` (about 2.4 MB). The bundle is committed because `opencode.sh` copies the plugin without `node_modules`. Rebuild it after changing `src/` or bumping mpl. mpl's `LICENSE` and `THIRD_PARTY_NOTICES.md` (Inter and DejaVu font licenses) are copied into `dist/` next to the bundle.
