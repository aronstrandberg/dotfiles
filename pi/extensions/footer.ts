import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

import {
  hyperlink,
  parseColor,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { homedir } from "node:os";

const formatTokens = (count: number) =>
  count < 1000
    ? String(count)
    : count < 1000000
      ? `${(count / 1000).toFixed(1)}k`
      : `${(count / 1000000).toFixed(1)}M`;

function sessionPullRequests(entries: readonly SessionEntry[]) {
  const requests = new Map<string, { url: string; label: string }>();

  for (const entry of entries) {
    const content =
      entry.type === "message"
        ? "content" in entry.message
          ? entry.message.content
          : "output" in entry.message
            ? entry.message.output
            : entry.message.summary
        : entry.type === "custom_message"
          ? entry.content
          : entry.type === "compaction" || entry.type === "branch_summary"
            ? entry.summary
            : "";

    const texts = Array.isArray(content)
      ? content.flatMap((block) => (block.type === "text" ? [block.text] : []))
      : [content];

    for (const text of texts) {
      for (const match of text.matchAll(
        /https:\/\/github\.com\/([a-z\d-]+)\/([a-z\d_.-]+)\/pull\/([1-9]\d*)\b/gi,
      )) {
        const [, owner, repository, number] = match;

        if (!owner || !repository || !number) continue;
        const url = `https://github.com/${owner}/${repository}/pull/${number}`;
        const key = url.toLowerCase();

        if (!requests.has(key))
          requests.set(key, { url, label: `${owner}/${repository}#${number}` });
      }
    }
  }

  return [...requests.values()];
}

export default function (pi: ExtensionAPI) {
  let enabled = true;

  function apply(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;

    if (!enabled) {
      ctx.ui.setFooter(undefined);

      return;
    }

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsubscribe,
        invalidate() {},
        render(width: number): string[] {
          const inset = Math.min(1, Math.max(0, Math.floor((width - 1) / 2)));
          const innerWidth = Math.max(0, width - inset * 2);
          const edge = " ".repeat(inset);

          const pad = (text: string) => {
            const clipped = truncateToWidth(text, innerWidth, "");

            return (
              edge + clipped + " ".repeat(Math.max(0, innerWidth - visibleWidth(clipped))) + edge
            );
          };

          let input = 0;
          let output = 0;
          let cacheRead = 0;
          let cacheWrite = 0;
          let cost = 0;

          const entries = ctx.sessionManager.getEntries();

          for (const entry of entries) {
            const usage =
              entry.type === "message"
                ? entry.message.role === "assistant" || entry.message.role === "toolResult"
                  ? entry.message.usage
                  : undefined
                : entry.type === "usage" ||
                    entry.type === "compaction" ||
                    entry.type === "branch_summary"
                  ? entry.usage
                  : undefined;

            if (!usage) continue;
            input += usage.input;
            output += usage.output;
            cacheRead += usage.cacheRead;
            cacheWrite += usage.cacheWrite;
            cost += usage.cost.total;
          }

          const home = homedir();

          const pastel = (text: string, color: string) =>
            theme.style(text, { fg: parseColor(color) });

          const separator = theme.fg("dim", " │ ");

          const cwd =
            ctx.cwd === home
              ? "~"
              : ctx.cwd.startsWith(`${home}/`)
                ? `~${ctx.cwd.slice(home.length)}`
                : ctx.cwd;

          const location = [pastel(`Path: ${cwd}`, "#a6c8ff")];
          const branch = footerData.getGitBranch();

          if (branch) location.push(pastel(`Branch: ${branch}`, "#b4dfb4"));
          const name = ctx.sessionManager.getSessionName();

          if (name) location.push(pastel(`Session: ${name}`, "#f2b5d4"));

          for (const request of sessionPullRequests(entries)) {
            location.push(pastel(hyperlink(`PR: ${request.label}`, request.url), "#c5b4e3"));
          }

          const context = ctx.getContextUsage();
          const tokens = context?.tokens;
          const percent = context?.percent;
          const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow ?? 0;
          const usedTokens = tokens == null ? "?" : `${Math.round(tokens / 1000)}k`;
          const percentage = percent == null ? "?" : `${Math.round(percent)}%`;
          const contextText = `${usedTokens} / ${Math.round(contextWindow / 1000)}k (${percentage})`;

          const stats = [
            pastel(`Input: ${formatTokens(input)}`, "#a8dadc"),
            pastel(`Output: ${formatTokens(output)}`, "#c5b4e3"),
            pastel(`Cache read: ${formatTokens(cacheRead)}`, "#b8d8ba"),
            pastel(`Cache write: ${formatTokens(cacheWrite)}`, "#f3c4a5"),
            pastel(`Cost: $${cost.toFixed(3)}`, "#f2dfa0"),
            pastel(`Context: ${contextText}`, "#f2b5b5"),
          ]
            .filter(Boolean)
            .join(separator);

          const model =
            pastel(`Model: ${ctx.model?.id ?? "no-model"}`, "#b5c7ed") +
            (ctx.model?.reasoning
              ? separator + pastel(`Thinking: ${pi.getThinkingLevel()}`, "#d9b8e6")
              : "");

          const gap =
            innerWidth - visibleWidth(stats) - visibleWidth(separator) - visibleWidth(model);

          const statsLine = stats + (gap > 0 ? " ".repeat(gap) : "") + separator + model;

          const lines = [location.join(separator), statsLine]
            .flatMap((line) => wrapTextWithAnsi(line, Math.max(1, innerWidth)))
            .map(pad);

          const statuses = [...footerData.getExtensionStatuses().entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, text]) => `${key}: ${text.replace(/[\r\n\t]/g, " ")}`);

          if (statuses.length) {
            const statusLine = statuses.map((text) => pastel(text, "#cbd5c0")).join(separator);
            lines.push(...wrapTextWithAnsi(statusLine, Math.max(1, innerWidth)).map(pad));
          }

          return lines;
        },
      };
    });
  }

  pi.on("session_start", (_event, ctx) => apply(ctx));
  pi.registerCommand("footer", {
    description: "Toggle the custom footer",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      apply(ctx);
    },
  });
}
