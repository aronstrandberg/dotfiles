import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { Input, Key, matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Type, type Static } from "typebox";

const Parameters = Type.Object({
  questions: Type.Array(
    Type.Object({
      question: Type.String({ minLength: 1 }),
      multiple: Type.Optional(Type.Boolean({ description: "Allow multiple selections; submitting none is valid." })),
      options: Type.Array(
        Type.Object({
          label: Type.String({ minLength: 1 }),
          description: Type.Optional(Type.String()),
        }),
        { minItems: 1, maxItems: 500 },
      ),
    }),
    { minItems: 1, maxItems: 20 },
  ),
});

type Question = Static<typeof Parameters>["questions"][number];
type Answers = {
  status: "answered" | "cancelled" | "unavailable";
  answers: { question: string; selected: string[] }[];
};

async function ask(ctx: ExtensionContext, questions: Question[], signal?: AbortSignal): Promise<Answers> {
  if (ctx.mode !== "tui") return { status: "unavailable", answers: [] };
  if (signal?.aborted) return { status: "cancelled", answers: [] };

  return ctx.ui.custom<Answers>((tui, theme, _keys, done) => {
    const choices = questions.map(() => new Set<number>());
    const search = new Input({ prompt: "Filter: " });
    let screen = 0;
    let cursor = 0;
    let filtering = false;
    let finished = false;
    const current = () => questions[screen];
    const visible = () =>
      current()
        .options.map((option, index) => ({ ...option, index }))
        .filter((option) =>
          `${option.label} ${option.description ?? ""}`.toLowerCase().includes(search.getValue().toLowerCase()),
        );
    const refresh = () => tui.requestRender();
    const finish = (status: Answers["status"]) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", abort);
      done({
        status,
        answers:
          status === "answered"
            ? questions.map((question, index) => ({
                question: question.question,
                selected: question.options
                  .filter((_option, optionIndex) => choices[index].has(optionIndex))
                  .map((option) => option.label),
              }))
            : [],
      });
    };
    const abort = () => finish("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    return {
      get focused() {
        return search.focused;
      },
      set focused(value: boolean) {
        search.focused = value && filtering;
      },
      dispose() {
        signal?.removeEventListener("abort", abort);
      },
      invalidate() {
        search.invalidate();
      },
      render(width: number) {
        const lines: string[] = [];
        const add = (text: string) => lines.push(truncateToWidth(text, Math.max(0, width), ""));
        add(theme.fg("accent", `Questions ${screen + 1}/${questions.length}`));
        add(current().question);
        if (filtering) lines.push(...search.render(Math.max(1, width)).map((line) => truncateToWidth(line, width, "")));
        else if (search.getValue()) add(theme.fg("muted", `Filter: ${search.getValue()}`));
        const options = visible();
        cursor = Math.min(cursor, Math.max(0, options.length - 1));
        const start = Math.floor(cursor / 8) * 8;
        for (const [offset, option] of options.slice(start, start + 8).entries()) {
          const active = start + offset === cursor;
          const picked = choices[screen].has(option.index);
          add(
            theme.fg(
              active ? "accent" : picked ? "success" : "text",
              `${active ? ">" : " "} [${picked ? "x" : " "}] ${option.label}`,
            ),
          );
        }
        if (!options.length) add(theme.fg("muted", "No matches. Use / to change the filter."));
        const description = options[cursor]?.description;
        if (description) add(theme.fg("muted", description));
        add(
          theme.fg(
            "muted",
            `${choices[screen].size} selected; showing ${options.length ? start + 1 : 0}–${Math.min(start + 8, options.length)} of ${options.length}`,
          ),
        );
        add(
          theme.fg(
            "dim",
            filtering
              ? "Type to filter · Enter return · Esc clear filter"
              : "↑↓ move · Space toggle · / filter · Ctrl+A all · Ctrl+D clear",
          ),
        );
        add(theme.fg("dim", `Enter ${screen === questions.length - 1 ? "submit" : "next"} · ← previous · Esc cancel`));
        return lines;
      },
      handleInput(data: string) {
        if (finished) return;
        if (filtering) {
          if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
            if (matchesKey(data, Key.escape)) search.setValue("");
            filtering = false;
            search.focused = false;
          } else search.handleInput(data);
          cursor = 0;
          refresh();
          return;
        }
        const options = visible();
        if (matchesKey(data, Key.escape)) {
          finish("cancelled");
          return;
        }
        if (data === "/") {
          filtering = true;
          search.focused = true;
        } else if (matchesKey(data, Key.up) || data === "k") cursor = Math.max(0, cursor - 1);
        else if (matchesKey(data, Key.down) || data === "j")
          cursor = Math.min(Math.max(0, options.length - 1), cursor + 1);
        else if (matchesKey(data, Key.pageUp)) cursor = Math.max(0, cursor - 8);
        else if (matchesKey(data, Key.pageDown)) cursor = Math.min(Math.max(0, options.length - 1), cursor + 8);
        else if (matchesKey(data, Key.ctrl("a")) && current().multiple)
          options.forEach((option) => choices[screen].add(option.index));
        else if (matchesKey(data, Key.ctrl("d"))) options.forEach((option) => choices[screen].delete(option.index));
        else if (matchesKey(data, Key.left) && screen > 0) {
          screen--;
          cursor = 0;
          search.setValue("");
        } else if (data === " " && options[cursor]) {
          const index = options[cursor].index;
          const selected = choices[screen];
          if (selected.has(index)) selected.delete(index);
          else {
            if (!current().multiple) selected.clear();
            selected.add(index);
          }
        } else if (matchesKey(data, Key.enter)) {
          if (!current().multiple && choices[screen].size === 0) {
            if (!options[cursor]) return;
            choices[screen].add(options[cursor].index);
          }
          if (screen === questions.length - 1) {
            finish("answered");
            return;
          }
          screen++;
          cursor = 0;
          search.setValue("");
        }
        refresh();
      },
    };
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerTool<typeof Parameters, Answers>({
    name: "ask_questions",
    label: "Ask questions",
    description:
      "Ask the user interactive single-choice or multi-select questions. Supports searchable checklists. Cancellation supplies no answers. Requires TUI mode; otherwise ask in chat.",
    parameters: Parameters,
    executionMode: "sequential",
    async execute(_id, params, signal, _update, ctx) {
      const details = await ask(ctx, params.questions, signal);
      return { content: [{ type: "text", text: JSON.stringify(details) }], details };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("accent", `Ask questions: ${args.questions?.length ?? 0}`), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details;
      return new Text(
        details.status === "answered"
          ? details.answers
              .map((answer) => `${answer.question}\n${answer.selected.join(", ") || "None selected"}`)
              .join("\n\n")
          : theme.fg("muted", details.status),
        0,
        0,
      );
    },
  });

  pi.registerCommand("repo-skills", {
    description: "Choose repo skills to keep; send the selection to the agent without changing settings",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/repo-skills requires TUI mode", "error");
        return;
      }
      const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd: ctx.cwd });
      if (result.code !== 0) {
        ctx.ui.notify("Run /repo-skills inside a Git repository", "error");
        return;
      }
      const root = result.stdout.trim();
      const directory = join(root, ".agents", "skills");
      try {
        const folders = await readdir(directory, { withFileTypes: true });
        const options: { label: string }[] = [];
        for (const folder of folders) {
          if (!folder.isDirectory()) continue;
          const files = await readdir(join(directory, folder.name));
          if (files.some((file) => file.toLowerCase() === "skill.md")) options.push({ label: folder.name });
        }
        options.sort((a, b) => a.label.localeCompare(b.label));
        if (!options.length) {
          ctx.ui.notify("No repo skills found", "info");
          return;
        }
        const answers = await ask(ctx, [
          {
            question:
              "Which repo skills should Pi keep enabled? Unchecked skills will be disabled. Start with none selected.",
            multiple: true,
            options,
          },
        ]);
        if (answers.status !== "answered") return;
        pi.sendUserMessage(
          `Keep only these repo skills in ${root}: ${JSON.stringify(answers.answers[0].selected)}. Disable the other repo skills in my personal Pi configuration. Leave personal skills and shared repo files unchanged.`,
        );
      } catch (error) {
        ctx.ui.notify(`Cannot list repo skills: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
