import assert from "node:assert/strict";
import { test } from "node:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import extension from "../extensions/footer-padding.ts";
import { createTheme } from "./theme.mjs";

function createFooter(entries = []) {
  let start;
  let toggle;
  let factory;
  let branchListener;
  let renders = 0;

  extension({
    on(name, handler) {
      if (name === "session_start") start = handler;
    },
    registerCommand(_name, command) {
      toggle = command.handler;
    },
    getThinkingLevel: () => "high",
  });

  const context = {
    mode: "tui",
    cwd: "/project",
    model: { id: "test-model", reasoning: true, contextWindow: 100000 },
    sessionManager: { getEntries: () => entries, getSessionName: () => "example" },
    getContextUsage: () => ({ percent: 10, contextWindow: 100000 }),
    ui: {
      setFooter(value) {
        factory = value;
      },
    },
  };

  start({}, context);

  const footer = factory(
    {
      requestRender() {
        renders++;
      },
    },
    createTheme(),
    {
      onBranchChange(listener) {
        branchListener = listener;

        return () => {
          branchListener = undefined;
        };
      },
      getGitBranch: () => "main",
      getExtensionStatuses: () => new Map([["status", "ready"]]),
    },
  );

  return {
    footer,
    toggle: () => toggle("", context),
    defaultRestored: () => factory === undefined,
    branchChanged: () => branchListener?.(),
    renderCount: () => renders,
    subscribed: () => branchListener !== undefined,
  };
}

test("pastel hex colors do not crash Pi's theme API and narrow footers stay inside their inset", () => {
  const { footer } = createFooter();

  for (const width of [1, 2, 3, 4, 5, 10, 80, 160]) {
    for (const line of footer.render(width)) {
      assert.ok(visibleWidth(line) <= width);

      if (width >= 3) assert.ok(line.startsWith(" ") && line.endsWith(" "));
    }
  }

  assert.ok(footer.render(160).some((line) => line.includes("\x1b[38;2;")));
});

test("new sessions keep zero-valued usage labels instead of hiding their sections", () => {
  const { footer } = createFooter();
  const text = footer.render(80).map(stripTerminalSequences).join("\n");

  for (const label of [
    "Path: /project",
    "Branch: main",
    "Session: example",
    "Input: 0",
    "Output: 0",
    "Cache read: 0",
    "Cache write: 0",
    "Cost: $0.000",
    "Context: 10.0%/100.0k",
    "Model: test-model",
    "Thinking: high",
    "status: ready",
  ]) {
    assert.ok(text.includes(label), `Missing ${label}`);
  }

  assert.ok(text.includes("│"));
});

test("assistant usage updates token and cost totals rather than remaining at zero", () => {
  const { footer } = createFooter([
    {
      type: "message",
      message: {
        role: "assistant",
        usage: {
          input: 1200,
          output: 200,
          cacheRead: 3000,
          cacheWrite: 400,
          cost: { total: 0.125 },
        },
      },
    },
  ]);

  const text = footer.render(200).map(stripTerminalSequences).join("\n");

  for (const label of [
    "Input: 1.2k",
    "Output: 200",
    "Cache read: 3.0k",
    "Cache write: 400",
    "Cost: $0.125",
  ])
    assert.ok(text.includes(label));
});

test("footer toggling restores the built-in footer and disposal removes branch notifications", async () => {
  const fixture = createFooter();

  fixture.branchChanged();
  assert.equal(fixture.renderCount(), 1);
  fixture.footer.dispose();
  assert.equal(fixture.subscribed(), false);
  await fixture.toggle();
  assert.equal(fixture.defaultRestored(), true);
});
