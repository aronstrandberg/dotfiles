import assert from "node:assert/strict";
import { test } from "node:test";
import { getOsc8LinkAtColumn, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import extension from "../extensions/footer.ts";
import { createTheme } from "./theme.mjs";

function createFooter(
  entries = [],
  contextUsage = { tokens: 10000, percent: 10, contextWindow: 100000 },
) {
  let start;
  let toggle;
  let factory;
  let branchListener;
  let renders = 0;

  extension({
    on(name, handler) {
      if (name === "session_start") start = handler;
    },
    registerCommand(name, command) {
      assert.equal(name, "footer");
      toggle = command.handler;
    },
    getThinkingLevel: () => "high",
  });

  const context = {
    mode: "tui",
    cwd: "/project",
    model: { id: "test-model", reasoning: true, contextWindow: 100000 },
    sessionManager: { getEntries: () => entries, getSessionName: () => "example" },
    getContextUsage: () => contextUsage,
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
    "Context: 10k / 100k (10%)",
    "Model: test-model",
    "Thinking: high",
    "status: ready",
  ]) {
    assert.ok(text.includes(label), `Missing ${label}`);
  }

  assert.ok(text.includes("│"));
});

test("context rounds token counts to thousands and percentages to whole numbers", () => {
  const { footer } = createFooter([], { tokens: 12345, percent: 4.5386, contextWindow: 272000 });
  const text = footer.render(240).map(stripTerminalSequences).join("\n");

  assert.ok(text.includes("Context: 12k / 272k (5%)"));
});

test("context rounds up rather than truncating token counts", () => {
  const { footer } = createFooter([], { tokens: 197600, percent: 72.65, contextWindow: 272000 });
  const text = footer.render(240).map(stripTerminalSequences).join("\n");

  assert.ok(text.includes("Context: 198k / 272k (73%)"));
});

test("unknown context after compaction does not appear as zero usage", () => {
  const { footer } = createFooter([], { tokens: null, percent: null, contextWindow: 272000 });
  const text = footer.render(240).map(stripTerminalSequences).join("\n");

  assert.ok(text.includes("Context: ? / 272k (?)"));
});

test("assistant usage updates token and cost totals rather than remaining at zero", () => {
  const { footer } = createFooter([
    {
      type: "message",
      message: {
        role: "assistant",
        content: [],
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

test("session PRs become clickable links without duplicating repeated references", () => {
  const { footer } = createFooter([
    {
      type: "message",
      message: { role: "user", content: "Review https://github.com/owner/repo/pull/123/files" },
    },
    {
      type: "message",
      message: {
        role: "toolResult",
        content: [
          {
            type: "text",
            text: "https://github.com/owner/repo/pull/123\nhttps://github.com/owner/other/pull/456",
          },
        ],
      },
    },
    { type: "custom_message", content: "Again: https://github.com/OWNER/REPO/pull/123?tab=files" },
  ]);

  const lines = footer.render(240);
  const text = lines.map(stripTerminalSequences).join("\n");

  assert.equal(text.split("PR: owner/repo#123").length - 1, 1);
  assert.ok(text.includes("PR: owner/other#456"));

  for (const [label, url] of [
    ["PR: owner/repo#123", "https://github.com/owner/repo/pull/123"],
    ["PR: owner/other#456", "https://github.com/owner/other/pull/456"],
  ]) {
    const line = lines.find((value) => stripTerminalSequences(value).includes(label));
    assert.ok(line);
    const column = stripTerminalSequences(line).indexOf(label);
    assert.equal(getOsc8LinkAtColumn(line, column), url);
  }
});

test("sessions without PR URLs do not show issue links or invent a pull request", () => {
  const { footer } = createFooter([
    {
      type: "message",
      message: {
        role: "user",
        content: "https://github.com/owner/repo/issues/123 https://example.com/owner/repo/pull/456",
      },
    },
  ]);

  const text = footer.render(240).map(stripTerminalSequences).join("\n");

  assert.equal(text.includes("PR:"), false);
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
