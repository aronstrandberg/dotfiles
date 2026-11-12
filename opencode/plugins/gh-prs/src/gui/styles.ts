export const css = `
.ghp { --ghp-fg: var(--v2-text-text-base, CanvasText); --ghp-muted: var(--v2-text-text-muted, GrayText);
  --ghp-faint: var(--v2-text-text-faint, GrayText); --ghp-border: var(--v2-border-border-muted, color-mix(in srgb, currentColor 14%, transparent));
  --ghp-layer: var(--v2-background-bg-layer-01, color-mix(in srgb, currentColor 4%, transparent));
  --ghp-ok: var(--v2-state-fg-success, #2da44e); --ghp-bad: var(--v2-state-fg-danger, #cf222e);
  --ghp-warn: var(--v2-state-fg-warning, #bf8700); --ghp-info: var(--v2-state-fg-info, #0969da);
  --ghp-merged: var(--v2-agent-plan-solid, #8250df);
  display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--ghp-fg); font-size: 13px;
  container-type: inline-size; }
.ghp button.ghp-link { all: unset; cursor: pointer; color: var(--v2-text-text-accent, LinkText); }
.ghp button.ghp-link:hover { text-decoration: underline; }
.ghp-scroll { flex: 1; min-height: 0; overflow: auto; }
.ghp-pad { padding: 12px 14px; }
.ghp-muted { color: var(--ghp-muted); }
.ghp-faint { color: var(--ghp-faint); }
.ghp-mono { font-family: var(--v2-font-family-code, ui-monospace, monospace); font-size: 12px; }
.ghp-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ghp-grow { flex: 1; min-width: 0; }
.ghp-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ghp-empty { padding: 32px 16px; text-align: center; color: var(--ghp-muted); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.ghp-error { margin: 12px 14px; padding: 8px 10px; border-radius: 8px; color: var(--ghp-bad);
  background: var(--v2-state-bg-danger, color-mix(in srgb, var(--ghp-bad) 10%, transparent)); white-space: pre-wrap; word-break: break-word; }

/* Agent-message PR card */
.ghp-card-loading { box-sizing: border-box; width: 100%; min-height: 72px; border: 1px solid var(--v2-border-border-muted, color-mix(in srgb, currentColor 14%, transparent));
  border-radius: 8px; padding: 10px 42px 10px 12px; color: var(--v2-text-text-base, CanvasText); background: var(--v2-background-bg-layer-01, color-mix(in srgb, currentColor 4%, transparent)); }
.ghp-card { all: unset; box-sizing: border-box; width: 100%; min-height: 72px; border: 1px solid var(--v2-border-border-muted, color-mix(in srgb, currentColor 14%, transparent));
  border-radius: 8px; padding: 10px 42px 10px 12px; display: flex; flex-direction: column; gap: 3px; cursor: pointer; color: var(--v2-text-text-base, CanvasText);
  background: var(--v2-background-bg-layer-01, color-mix(in srgb, currentColor 4%, transparent)); }
.ghp-card:hover { border-color: var(--v2-border-border-base, color-mix(in srgb, currentColor 28%, transparent)); background: var(--v2-overlay-simple-overlay-hover, color-mix(in srgb, currentColor 6%, transparent)); }
.ghp-card:focus-visible { outline: 2px solid var(--v2-border-border-focus, LinkText); outline-offset: 2px; }
.ghp-card-label { display: inline-flex; align-items: center; gap: 5px; width: max-content; font-size: 11px; color: var(--v2-text-text-muted, GrayText); }
.ghp-card-title { font-size: 14px; font-weight: 500; line-height: 1.35; overflow-wrap: anywhere; }
.ghp-card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 11.5px; color: var(--v2-text-text-muted, GrayText); }
.ghp-card-meta [data-checks="success"] { color: var(--v2-state-fg-success, #2da44e); }
.ghp-card-meta [data-checks="failure"] { color: var(--v2-state-fg-danger, #cf222e); }
.ghp-card-meta [data-checks="pending"] { color: var(--v2-state-fg-warning, #bf8700); }
.ghp-card-loading { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--v2-text-text-muted, GrayText); }

/* PR state */
.ghp-state { display: inline-flex; align-items: center; gap: 4px; font-size: 12px;
  font-weight: 500; color: var(--ghp-ok); flex-shrink: 0; }
.ghp-state[data-state="Draft"] { color: var(--ghp-muted); }
.ghp-state[data-state="Closed"] { color: var(--ghp-bad); }
.ghp-state[data-state="Merged"] { color: var(--ghp-merged); }
.ghp-state[data-state="Queued"] { color: var(--ghp-warn); }
.ghp-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--ghp-faint); }
.ghp-dot[data-checks="success"] { background: var(--ghp-ok); }
.ghp-dot[data-checks="failure"] { background: var(--ghp-bad); }
.ghp-dot[data-checks="pending"] { background: var(--ghp-warn); }
.ghp-tone-success { color: var(--ghp-ok); }
.ghp-tone-failure { color: var(--ghp-bad); }
.ghp-tone-pending { color: var(--ghp-warn); }
.ghp-tone-skipped, .ghp-tone-neutral { color: var(--ghp-faint); }
.ghp-add { color: var(--ghp-ok); font-variant-numeric: tabular-nums; }
.ghp-del { color: var(--ghp-bad); font-variant-numeric: tabular-nums; }
.ghp-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 4px; font-size: 11px; line-height: 18px;
  background: var(--ghp-layer); color: var(--ghp-muted); white-space: nowrap; }

/* List */
.ghp-list-head { padding: 10px 14px; border-bottom: 1px solid var(--ghp-border); }
.ghp-item { display: grid; grid-template-columns: 8px 1fr auto; gap: 4px 10px; align-items: center; padding: 9px 14px;
  border-bottom: 1px solid var(--ghp-border); cursor: pointer; }
.ghp-item:hover { background: var(--v2-overlay-simple-overlay-hover, color-mix(in srgb, currentColor 6%, transparent)); }
.ghp-item-title { font-weight: 500; }
.ghp-item-meta { grid-column: 2 / 4; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--ghp-muted); }
.ghp-prs { list-style: none; margin: 0; padding: 0; font-variant-numeric: tabular-nums; }
.ghp-pr { display: flex; flex-direction: column; gap: 3px; padding: 10px 14px; border-bottom: 1px solid var(--ghp-border); min-width: 0; overflow-wrap: anywhere; }
.ghp-pr-title, .ghp-pr-ci { all: unset; box-sizing: border-box; cursor: pointer; touch-action: manipulation; border-radius: 2px; }
.ghp-pr-title { font-weight: 500; line-height: 1.35; }
.ghp-pr-title:focus-visible, .ghp-pr-ci:focus-visible { outline: 2px solid var(--v2-border-border-focus, LinkText); outline-offset: 2px; }
@media (hover: hover) { .ghp-pr-title:hover, .ghp-pr-ci:hover { text-decoration: underline; } }
.ghp-pr-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; color: var(--ghp-muted); font-size: 11px; }
.ghp-pr-line { font-size: 12px; color: var(--ghp-muted); line-height: 1.4; }
.ghp-work-state { font-weight: 500; }
.ghp-work-state[data-work="waiting-user"], .ghp-work-state[data-work="blocked"] { color: var(--ghp-warn); }
.ghp-work-state[data-work="agent-working"] { color: var(--ghp-info); }
.ghp-work-note { white-space: pre-wrap; font-size: 12px; line-height: 1.4; }

/* PR header */
.ghp-head { padding: 12px 14px 8px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--ghp-border); }
.ghp-title { margin: 0; font-size: 14px; font-weight: 500; line-height: 1.4; overflow-wrap: anywhere; }
.ghp-title .ghp-num { color: var(--ghp-muted); font-weight: 400; }
.ghp-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 12px; color: var(--ghp-muted); }
.ghp-branches { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.ghp-branch { display: block; font-family: var(--v2-font-family-code, ui-monospace, monospace); font-size: 11px;
  max-width: min(180px, 25cqw); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ghp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ghp-actions .ghp-spacer { flex: 1; }
.ghp-merge-status { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.ghp-sections { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 2px; }
.ghp-section-button, .ghp-group-button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 5px;
  min-height: 28px; padding: 0 8px; border-radius: 6px; cursor: pointer; color: var(--ghp-muted); }
.ghp-section-button:hover, .ghp-group-button:hover { background: var(--v2-overlay-simple-overlay-hover, color-mix(in srgb, currentColor 6%, transparent)); color: var(--ghp-fg); }
.ghp-section-button:focus-visible, .ghp-group-button:focus-visible { outline: 2px solid var(--v2-border-border-focus, LinkText); outline-offset: 1px; }
.ghp-section-button[data-active] { color: var(--ghp-fg); background: var(--ghp-layer); box-shadow: inset 0 0 0 1px var(--ghp-border); }
.ghp-section-count { color: var(--ghp-muted); font-variant-numeric: tabular-nums; }
.ghp-section-count[data-tone="failure"] { color: var(--ghp-bad); }
.ghp-section-count[data-tone="pending"] { color: var(--ghp-warn); }
.ghp-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* Overview */
.ghp-facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: 12.5px; margin-bottom: 14px; }
.ghp-facts dt { color: var(--ghp-muted); }
.ghp-facts dd { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
.ghp-section-title { font-size: 12px; font-weight: 500; color: var(--ghp-muted); margin: 16px 0 8px; }
.ghp-body { line-height: 1.55; word-break: break-word; }
.ghp-body img { max-width: 100%; }

/* Checks */
.ghp-check { display: flex; align-items: center; gap: 8px; padding: 6px 14px; min-width: 0; }
.ghp-check:hover { background: var(--v2-overlay-simple-overlay-hover, color-mix(in srgb, currentColor 6%, transparent)); }
.ghp-check-name { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.ghp-check-name small { color: var(--ghp-muted); font-size: 11.5px; }
.ghp-check-actions { display: flex; gap: 2px; opacity: .0; transition: opacity .1s; }
.ghp-check:hover .ghp-check-actions, .ghp-check:focus-within .ghp-check-actions { opacity: 1; }
.ghp-group-head { display: flex; padding: 8px 8px 2px; }

/* Comments */
.ghp-toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--ghp-border); flex-wrap: wrap; }
.ghp-entry { padding: 12px 14px; border-bottom: 1px solid var(--ghp-border); }
.ghp-entry-head { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-bottom: 6px; }
.ghp-entry-head b { font-weight: 600; }
.ghp-entry[data-bot] .ghp-body { font-size: 12.5px; }
.ghp-review-state { font-size: 11.5px; font-weight: 500; }
.ghp-review-state[data-state="APPROVED"] { color: var(--ghp-ok); }
.ghp-review-state[data-state="CHANGES_REQUESTED"] { color: var(--ghp-bad); }
.ghp-thread { border: 1px solid var(--ghp-border); border-radius: 8px; overflow: hidden; }
.ghp-thread-head { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--ghp-layer); font-size: 12px; }
.ghp-thread-comment { padding: 8px 10px; border-top: 1px solid var(--ghp-border); }
.ghp-composer { border-top: 1px solid var(--ghp-border); padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
.ghp-composer textarea { box-sizing: border-box; width: 100%; min-height: 64px; max-height: 240px; resize: vertical; font: inherit; color: inherit;
  background: var(--v2-background-bg-layer-01, transparent); border: 1px solid var(--v2-border-border-base, var(--ghp-border));
  border-radius: 8px; padding: 8px 10px; outline: none; }
.ghp-composer textarea:focus { border-color: var(--v2-border-border-focus, var(--ghp-fg)); }

/* Files */
.ghp-file { border-bottom: 1px solid var(--ghp-border); }
.ghp-file-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px 6px 8px; position: sticky; top: 0; z-index: 1;
  background: var(--v2-background-bg-base, Canvas); cursor: pointer; min-width: 0; }
.ghp-file-head:hover { background: var(--v2-background-bg-layer-01, Canvas); }
.ghp-file-status { width: 14px; text-align: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
.ghp-file-status[data-status="added"] { color: var(--ghp-ok); }
.ghp-file-status[data-status="removed"] { color: var(--ghp-bad); }
.ghp-file-status[data-status="renamed"], .ghp-file-status[data-status="modified"] { color: var(--ghp-warn); }
.ghp-file-path { direction: rtl; text-align: left; }
.ghp-file-body { overflow-x: auto; }
.ghp-file-body pre, .ghp-file-body code { font-size: 12px; }
.ghp-chevron { transition: transform .12s; display: inline-flex; flex-shrink: 0; }
.ghp-chevron[data-open] { transform: rotate(90deg); }
.ghp-note { padding: 10px 14px; color: var(--ghp-muted); font-size: 12px; }
/* Touch screens and the narrow-screen view: no hover, bigger targets. */
@media (hover: none) { .ghp-check-actions { opacity: 1; } }
.ghp[data-placement="mobile"] { font-size: 14px; }
.ghp[data-placement="mobile"] .ghp-check-actions { opacity: 1; }
.ghp[data-placement="mobile"] .ghp-item, .ghp[data-placement="mobile"] .ghp-check { padding-top: 11px; padding-bottom: 11px; }
.ghp[data-placement="mobile"] .ghp-sections { gap: 8px; }
.ghp[data-placement="mobile"] .ghp-file-head { padding-top: 10px; padding-bottom: 10px; }
.ghp[data-placement="mobile"] .ghp-composer textarea { font-size: 16px; }
@container (max-width: 420px) { .ghp-hide-narrow { display: none; } }
`
