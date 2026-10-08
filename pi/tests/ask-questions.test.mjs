import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import extension from "../extensions/ask-questions.ts";
import { createTheme } from "./theme.mjs";

const questions = [
  {
    question: "Keep which skills?",
    multiple: true,
    options: [{ label: "Alpha" }, { label: "Beta" }],
  },
  { question: "One choice?", options: [{ label: "Yes" }, { label: "No" }] },
];

function createRuntime(actions, root = "") {
  let tool;
  let command;
  let userMessage;

  extension({
    registerTool(value) {
      tool = value;
    },
    registerCommand(_name, value) {
      command = value;
    },
    exec: async () => ({ code: 0, stdout: root, stderr: "" }),
    sendUserMessage(message) {
      userMessage = message;
    },
  });

  const context = {
    mode: "tui",
    cwd: root,
    ui: {
      async custom(factory) {
        let result;

        const component = factory({ requestRender() {} }, createTheme(), {}, (value) => {
          result = value;
        });

        try {
          for (const action of actions) {
            for (const width of [1, 10, 80])
              for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width);
            component.handleInput(action);
          }

          assert.notEqual(result, undefined, "Dialog did not complete");

          return result;
        } finally {
          component.dispose();
        }
      },
      notify(message) {
        throw new Error(message);
      },
    },
  };

  return {
    run: (signal = new AbortController().signal, mode = "tui", input = questions) =>
      tool.execute("id", { questions: input }, signal, () => {}, { ...context, mode }),
    pickSkills: () => command.handler("", context),
    message: () => userMessage,
  };
}

test("multi-select submission keeps every checked answer and single-choice submission picks only one", async () => {
  const result = await createRuntime([" ", "\x1b[B", " ", "\r", "\x1b[B", "\r"]).run();

  assert.equal(result.details.status, "answered");
  assert.deepEqual(
    result.details.answers.map((answer) => answer.selected),
    [["Alpha", "Beta"], ["No"]],
  );
});

test("filtering does not change the option identity or discard hidden selections", async () => {
  const result = await createRuntime([" ", "/", "Beta", "\r", " ", "\r", "\r"]).run();

  assert.deepEqual(result.details.answers[0].selected, ["Alpha", "Beta"]);
});

test("an empty keep-list remains an explicit submitted answer", async () => {
  const result = await createRuntime(["\r", "\r"]).run();

  assert.equal(result.details.status, "answered");
  assert.deepEqual(result.details.answers[0].selected, []);
});

test("clearing checked choices prevents accidentally keeping every skill", async () => {
  const result = await createRuntime(["\x01", "\x04", "\r", "\r"]).run();

  assert.deepEqual(result.details.answers[0].selected, []);
});

test("cancellation discards partial answers and pre-aborted tools do not open a dialog", async () => {
  const cancelled = await createRuntime([" ", "\x1b"]).run();
  const aborted = await createRuntime([]).run(AbortSignal.abort());

  for (const result of [cancelled, aborted])
    assert.deepEqual(result.details, { status: "cancelled", answers: [] });
});

test("RPC execution reports UI unavailability instead of attempting a terminal dialog", async () => {
  const result = await createRuntime([]).run(new AbortController().signal, "rpc");

  assert.equal(result.details.status, "unavailable");
});

test("the skill picker reads real skill directories without changing their files or settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-skills-"));

  try {
    const skills = join(root, ".agents", "skills");

    for (const [folder, file] of [
      ["alpha", "SKILL.md"],
      ["beta", "skill.md"],
    ]) {
      await mkdir(join(skills, folder), { recursive: true });
      await writeFile(join(skills, folder, file), "skill");
    }

    const runtime = createRuntime(["/", "beta", "\r", " ", "\r"], root);
    await runtime.pickSkills();

    assert.ok(runtime.message().includes('["beta"]'));
    assert.ok(runtime.message().includes("Leave personal skills and shared repo files unchanged"));
    assert.equal(await readFile(join(skills, "alpha", "SKILL.md"), "utf8"), "skill");
    assert.equal(await readFile(join(skills, "beta", "skill.md"), "utf8"), "skill");
    assert.deepEqual(await readdir(root), [".agents"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
