import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getOsc8LinkAtColumn,
  hyperlink,
  stripTerminalSequences,
  visibleWidth,
} from "@earendil-works/pi-tui";
import extension from "../extensions/footer.ts";
import { createTheme } from "./theme.mjs";

function createFooter(
  entries = [],
  contextUsage = { tokens: 10000, percent: 10, contextWindow: 100000 },
  execute = async () => ({ code: 1, stdout: "", stderr: "unavailable", killed: false }),
) {
  const handlers = new Map();
  let start;
  let toggle;
  let factory;
  let branchListener;
  let renders = 0;
  let sessionId = "01a11d51-8a7c-725b-9d94-38dc4fcc8099";

  extension({
    on(name, handler) {
      handlers.set(name, handler);

      if (name === "session_start") start = handler;
    },
    exec: execute,
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
    sessionManager: {
      getEntries: () => entries,
      getSessionName: () => "example",
      getSessionId: () => sessionId,
    },
    getContextUsage: () => contextUsage,
    ui: {
      setFooter(value) {
        factory = value;
      },
    },
  };

  const ready = start({}, context);

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
    ready,
    refresh: () => handlers.get("agent_end")?.({}, context),
    shutdown: () => handlers.get("session_shutdown")?.({}, context),
    setSessionId(value) {
      sessionId = value;
    },
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

test("session ID is not omitted or left stale when the active session changes", () => {
  const fixture = createFooter();

  const text = fixture.footer.render(240).map(stripTerminalSequences).join("\n");
  assert.ok(text.includes("Session ID: 01a11d51-8a7c-725b-9d94-38dc4fcc8099"));
  assert.ok(text.includes("Session: example"));

  fixture.setSessionId("01a11d51-8a7c-725b-9d94-38dc4fcc8100");

  const updated = fixture.footer.render(240).map(stripTerminalSequences).join("\n");
  assert.ok(updated.includes("Session ID: 01a11d51-8a7c-725b-9d94-38dc4fcc8100"));
  assert.equal(updated.includes("01a11d51-8a7c-725b-9d94-38dc4fcc8099"), false);
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

test("PR links stay on their own row between the location and usage stats", () => {
  const { footer } = createFooter([
    {
      type: "message",
      message: { role: "user", content: "Review https://github.com/owner/repo/pull/123" },
    },
  ]);

  const lines = footer.render(1000).map(stripTerminalSequences);

  assert.ok(lines[0].includes("Path: /project"));
  assert.ok(lines[0].includes("Branch: main"));
  assert.equal(lines[0].includes("owner/repo#123"), false);
  assert.equal(lines[1].trim(), "owner/repo#123");
  assert.ok(lines[2].includes("Input: 0"));
});

test("session PRs stay underlined and clickable without duplicating repeated references", () => {
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

  assert.equal(text.split("owner/repo#123").length - 1, 1);
  assert.ok(text.includes("owner/other#456"));

  for (const [label, url] of [
    ["owner/repo#123", "https://github.com/owner/repo/pull/123"],
    ["owner/other#456", "https://github.com/owner/other/pull/456"],
  ]) {
    const line = lines.find((value) => stripTerminalSequences(value).includes(label));
    assert.ok(line);
    const column = stripTerminalSequences(line).indexOf(label);
    assert.equal(getOsc8LinkAtColumn(line, column), url);
    assert.ok(line.includes(`\x1b[4m${hyperlink(label, url)}\x1b[24m`));
  }
});

test("stacked PRs follow base-to-head order rather than the order of URLs in the session", async () => {
  const metadata = new Map([
    [
      "https://github.com/owner/repo/pull/30",
      { baseRefName: "middle", headRefName: "top", isCrossRepository: false },
    ],
    [
      "https://github.com/owner/repo/pull/10",
      { baseRefName: "main", headRefName: "bottom", isCrossRepository: false },
    ],
    [
      "https://github.com/owner/repo/pull/20",
      { baseRefName: "bottom", headRefName: "middle", isCrossRepository: false },
    ],
  ]);

  const fixture = createFooter(
    [{ type: "message", message: { role: "user", content: [...metadata.keys()].join("\n") } }],
    undefined,
    async (command, args) => {
      if (command === "git") return { code: 1, stdout: "", stderr: "unavailable", killed: false };
      assert.equal(command, "gh");
      assert.deepEqual(args.slice(0, 2), ["pr", "view"]);
      assert.equal(args[3], "--json");
      assert.equal(args[4], "baseRefName,headRefName,isCrossRepository");
      assert.ok(metadata.has(args[2]));

      return { code: 0, stdout: JSON.stringify(metadata.get(args[2])), stderr: "", killed: false };
    },
  );

  await fixture.ready;
  const lines = fixture.footer.render(1000);
  const row = stripTerminalSequences(lines[1]);

  assert.equal(row.trim(), "owner/repo#10 ← owner/repo#20 ← owner/repo#30");
  assert.ok(fixture.renderCount() > 0);

  for (const number of [10, 20, 30]) {
    const column = row.indexOf(`owner/repo#${number}`);
    assert.equal(
      getOsc8LinkAtColumn(lines[1], column),
      `https://github.com/owner/repo/pull/${number}`,
    );
  }

  for (const width of [1, 2, 3, 10, 40, 80])
    for (const line of fixture.footer.render(width)) assert.ok(visibleWidth(line) <= width);
});

test("same-repository PRs omit the repo but external PRs keep it when GitHub is unavailable", async () => {
  for (const remote of [
    "https://github.com/OWNER/REPO.git",
    "git@github.com:owner/repo.git",
    "ssh://git@github.com/owner/repo.git",
  ]) {
    const fixture = createFooter(
      [
        {
          type: "message",
          message: {
            role: "user",
            content:
              "https://github.com/owner/repo/pull/123\nhttps://github.com/owner/other/pull/456",
          },
        },
      ],
      undefined,
      async (command, args, options) => {
        assert.equal(options.cwd, "/project");

        if (command === "git") {
          assert.deepEqual(args, ["remote", "get-url", "origin"]);

          return { code: 0, stdout: `${remote}\n`, stderr: "", killed: false };
        }

        return { code: 1, stdout: "", stderr: "unavailable", killed: false };
      },
    );

    await fixture.ready;
    const lines = fixture.footer.render(1000);
    const row = stripTerminalSequences(lines[1]);

    assert.equal(row.trim(), "#123 │ owner/other#456");
    assert.equal(
      getOsc8LinkAtColumn(lines[1], row.indexOf("#123")),
      "https://github.com/owner/repo/pull/123",
    );
  }
});

test("reading PR test fixtures does not add their example repositories to the footer", () => {
  const { footer } = createFooter([
    {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "read",
        content: [
          {
            type: "text",
            text: 'content: "Review https://github.com/owner/repo/pull/123/files"\ntext: "https://github.com/owner/other/pull/456"',
          },
        ],
      },
    },
  ]);

  const text = footer.render(240).map(stripTerminalSequences).join("\n");

  assert.equal(text.includes("owner/repo#123"), false);
  assert.equal(text.includes("owner/other#456"), false);
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

  assert.equal(text.includes("owner/repo#123"), false);
  assert.equal(text.includes("owner/repo#456"), false);
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
