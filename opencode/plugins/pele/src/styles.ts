/** Scoped diagram styling using the desktop app's semantic theme tokens. */
export const css = `
.pele-card {
  --pele-bg: var(--v2-background-bg-layer-01, Canvas);
  --pele-fg: var(--v2-text-text-base, CanvasText);
  --pele-muted: var(--v2-text-text-muted, GrayText);
  --pele-line: var(--v2-text-text-muted, GrayText);
  --pele-surface: var(--v2-background-bg-layer-02, color-mix(in srgb, var(--pele-fg) 5%, var(--pele-bg)));
  --pele-surface-alt: color-mix(in srgb, var(--pele-fg) 3%, var(--pele-bg));
  --pele-border: var(--v2-border-border-base, color-mix(in srgb, var(--pele-fg) 22%, var(--pele-bg)));
  --pele-accent: var(--v2-text-text-accent, #608ed7);
  --pele-error: var(--v2-state-fg-danger, #d65c65);
  --pele-font: var(--font-family-sans, ui-sans-serif, system-ui, sans-serif);
  --pele-font-mono: var(--font-family-mono, ui-monospace, monospace);
  --pele-radius: 8px;
  --pele-series-1: #648ee8;
  --pele-series-2: #a37be9;
  --pele-series-3: #42a999;
  --pele-series-4: #dc9b4a;
  --pele-series-5: #d57396;
  --pele-series-6: #58a8ce;
  --pele-series-7: #8eaa57;
  --pele-series-8: #b58d70;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  color: var(--pele-fg);
  background: var(--pele-bg);
  border: 1px solid var(--pele-border);
  border-radius: 12px;
  font-family: var(--pele-font);
  font-size: var(--font-size-base, 14px);
  font-weight: 400;
}
.pele-card [data-pele-tone="0"] { --node-accent: var(--pele-series-1); }
.pele-card [data-pele-tone="1"] { --node-accent: var(--pele-series-2); }
.pele-card [data-pele-tone="2"] { --node-accent: var(--pele-series-3); }
.pele-card [data-pele-tone="3"] { --node-accent: var(--pele-series-4); }
.pele-card .pele-node {
  --_s: color-mix(in srgb, var(--node-accent) 15%, var(--pele-bg));
  --_b: color-mix(in srgb, var(--node-accent) 65%, var(--pele-bg));
}
.pele-card .pele-edges { --_l: color-mix(in srgb, var(--pele-accent) 45%, var(--pele-muted)); }
.pele-card .pele-toolbar {
  display: flex; align-items: center; gap: 4px; padding: 8px 44px 8px 10px;
  border-bottom: 1px solid var(--pele-border);
  background: color-mix(in srgb, var(--pele-accent) 5%, var(--pele-bg));
}
.pele-card .pele-toolbar-spacer { flex: 1; }
.pele-card .pele-control { display: inline-flex; position: relative; }
.pele-card .pele-tooltip {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 2; pointer-events: none;
  white-space: nowrap; padding: 5px 8px; border-radius: 5px; font-size: 12px;
  background: var(--pele-fg); color: var(--pele-bg); visibility: hidden;
}
.pele-card .pele-control:hover .pele-tooltip,
.pele-card .pele-control:focus-within .pele-tooltip { visibility: visible; }
.pele-card .pele-toolbar button {
  appearance: none; display: inline-flex; align-items: center; justify-content: center;
  min-width: 30px; height: 30px; padding: 0 8px; border: 1px solid transparent;
  border-radius: 6px; font: inherit; font-size: 12px; color: var(--pele-fg);
  background: transparent; cursor: pointer;
}
.pele-card .pele-toolbar button:hover {
  background: color-mix(in srgb, var(--pele-accent) 12%, var(--pele-bg));
  border-color: color-mix(in srgb, var(--pele-accent) 30%, transparent);
}
.pele-card .pele-diagram {
  width: 100%; min-height: 100px; overflow: auto;
  display: flex; align-items: center; justify-content: center;
}
.pele-card .pele-diagram > svg { display: block; flex-shrink: 0; max-width: 100%; margin: auto; }
.pele-card .pele-source { border-top: 1px solid var(--pele-border); font-size: 12px; }
.pele-card .pele-source summary { cursor: pointer; padding: 10px 16px; color: var(--pele-muted); }
.pele-card .pele-source summary:hover { color: var(--pele-fg); }
.pele-card :focus-visible { outline: 2px solid var(--pele-accent); outline-offset: -3px; }
.pele-card .pele-source pre { margin: 0; padding: 0 16px 16px; overflow: auto; font: 12px/1.6 var(--pele-font-mono); }
.pele-overlay {
  position: fixed; inset: auto; margin: 0; padding: 0; border: 0; overflow: hidden;
  background: #0005; backdrop-filter: blur(4px); max-width: none; max-height: none;
}
.pele-overlay:popover-open { display: flex; align-items: center; justify-content: center; }
.pele-overlay::backdrop { background: transparent; }
.pele-dialog {
  box-sizing: border-box; width: 95%; height: auto;
  display: flex; flex-direction: column;
  max-width: none; max-height: 80%; padding: 0; border: 0; border-radius: 12px;
  background: var(--v2-background-bg-layer-01, Canvas); color: var(--v2-text-text-base, CanvasText);
  box-shadow: 0 24px 80px #0005;
}
.pele-dialog > .pele-card { min-height: 0; display: flex; flex-direction: column; }
.pele-dialog .pele-toolbar { padding-right: 10px; flex-shrink: 0; }
.pele-dialog .pele-diagram { flex: 0 1 auto; min-height: 0; }
.pele-dialog .pele-diagram > svg { max-height: var(--pele-graph-max-height); }
.pele-dialog .pele-source { flex-shrink: 0; max-height: var(--pele-source-max-height); overflow: auto; }
`
