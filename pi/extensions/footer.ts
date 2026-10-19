import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

import {
  hyperlink,
  parseColor,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

const PullRequestBranches = Type.Object({
  baseRefName: Type.String({ minLength: 1 }),
  headRefName: Type.String({ minLength: 1 }),
  isCrossRepository: Type.Boolean(),
});

type PullRequestBranches = Static<typeof PullRequestBranches>;

type PullRequest = { url: string; label: string; repository: string; number: string };

function githubRepository(remote: string): string | undefined {
  const match =
    /^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z\d-]+)\/([a-z\d_.-]+)\/?$/i.exec(
      remote.trim(),
    );

  const owner = match?.[1];
  const repository = match?.[2]?.replace(/\.git$/i, "");

  return owner && repository ? `${owner}/${repository}`.toLowerCase() : undefined;
}

function parsePullRequestBranches(output: string): PullRequestBranches | undefined {
  let value: unknown;

  try {
    value = JSON.parse(output);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }

  if (!Value.Check(PullRequestBranches, value)) return undefined;

  return {
    baseRefName: value.baseRefName,
    headRefName: value.headRefName,
    isCrossRepository: value.isCrossRepository,
  };
}

function pullRequestStacks(
  requests: readonly PullRequest[],
  branches: ReadonlyMap<string, PullRequestBranches>,
): PullRequest[][] {
  const parents = new Map<PullRequest, PullRequest>();
  const children = new Map<PullRequest, PullRequest[]>();

  for (const request of requests) {
    const base = branches.get(request.url)?.baseRefName;

    if (!base) continue;

    const candidates = requests.filter((candidate) => {
      const head = branches.get(candidate.url);

      return (
        candidate !== request &&
        candidate.repository === request.repository &&
        head?.isCrossRepository === false &&
        head.headRefName === base
      );
    });

    const parent = candidates.length === 1 ? candidates[0] : undefined;

    if (!parent) continue;
    parents.set(request, parent);
    const siblings = children.get(parent) ?? [];
    siblings.push(request);
    children.set(parent, siblings);
  }

  const stacks: PullRequest[][] = [];
  const emitted = new Set<PullRequest>();

  for (const request of requests) {
    if (emitted.has(request)) continue;
    let root = request;
    const ancestors = new Set<PullRequest>();

    while (true) {
      const parent = parents.get(root);

      if (!parent || children.get(parent)?.length !== 1) break;
      ancestors.add(root);
      root = parent;

      if (ancestors.has(root)) break;
    }

    if (ancestors.has(root)) {
      stacks.push([request]);
      emitted.add(request);
      continue;
    }

    const stack: PullRequest[] = [];
    let current: PullRequest | undefined = root;

    while (current && !emitted.has(current)) {
      stack.push(current);
      emitted.add(current);
      const next = children.get(current);
      current = next?.length === 1 ? next[0] : undefined;
    }

    stacks.push(stack);
  }

  return stacks;
}

const formatTokens = (count: number) =>
  count < 1000
    ? String(count)
    : count < 1000000
      ? `${(count / 1000).toFixed(1)}k`
      : `${(count / 1000000).toFixed(1)}M`;

function sessionPullRequests(entries: readonly SessionEntry[]) {
  const requests = new Map<string, PullRequest>();

  for (const entry of entries) {
    if (
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "read"
    )
      continue;

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
          requests.set(key, {
            url,
            label: `${owner}/${repository}#${number}`,
            repository: `${owner}/${repository}`.toLowerCase(),
            number,
          });
      }
    }
  }

  return [...requests.values()];
}

export default function (pi: ExtensionAPI) {
  let enabled = true;
  let branches = new Map<string, PullRequestBranches>();
  let repository: string | undefined;
  let lookupController: AbortController | undefined;
  let requestRender: (() => void) | undefined;

  async function refreshPullRequests(ctx: ExtensionContext) {
    lookupController?.abort();

    if (ctx.mode !== "tui" || !enabled) return;
    lookupController = new AbortController();

    const signal = ctx.signal
      ? AbortSignal.any([lookupController.signal, ctx.signal])
      : lookupController.signal;

    const remote = await pi.exec("git", ["remote", "get-url", "origin"], {
      cwd: ctx.cwd,
      timeout: 1000,
      signal,
    });

    if (signal.aborted) return;

    const localRepository =
      remote.code === 0 && !remote.killed ? githubRepository(remote.stdout) : undefined;

    const requests = sessionPullRequests(ctx.sessionManager.getEntries());
    const updated = new Map<string, PullRequestBranches>();

    for (let offset = 0; offset < requests.length && !signal.aborted; offset += 4) {
      await Promise.all(
        requests.slice(offset, offset + 4).map(async (request) => {
          const result = await pi.exec(
            "gh",
            ["pr", "view", request.url, "--json", "baseRefName,headRefName,isCrossRepository"],
            { cwd: ctx.cwd, timeout: 5000, signal },
          );

          if (result.code !== 0 || result.killed) return;
          const metadata = parsePullRequestBranches(result.stdout);

          if (metadata) updated.set(request.url, metadata);
        }),
      );
    }

    if (signal.aborted) return;
    branches = updated;
    repository = localRepository;
    requestRender?.();
  }

  function apply(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;

    if (!enabled) {
      ctx.ui.setFooter(undefined);

      return;
    }

    ctx.ui.setFooter((tui, theme, footerData) => {
      const render = () => tui.requestRender();
      requestRender = render;
      const unsubscribe = footerData.onBranchChange(render);

      return {
        dispose() {
          unsubscribe();

          if (requestRender === render) requestRender = undefined;
        },
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
          location.push(pastel(`Session ID: ${ctx.sessionManager.getSessionId()}`, "#f2b5d4"));

          const pullRequests = pullRequestStacks(sessionPullRequests(entries), branches)
            .map((stack) =>
              stack
                .map((request) =>
                  theme.style(
                    hyperlink(
                      request.repository === repository ? `#${request.number}` : request.label,
                      request.url,
                    ),
                    { fg: parseColor("#c5b4e3"), underline: true },
                  ),
                )
                .join(theme.fg("dim", " ← ")),
            )
            .join(separator);

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

          const lines = [
            location.join(separator),
            ...(pullRequests ? [pullRequests] : []),
            statsLine,
          ]
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

  pi.on("session_start", async (_event, ctx) => {
    branches = new Map();
    repository = undefined;
    apply(ctx);
    await refreshPullRequests(ctx);
  });
  pi.on("agent_end", (_event, ctx) => refreshPullRequests(ctx));
  pi.on("session_shutdown", () => {
    lookupController?.abort();
    requestRender = undefined;
  });
  pi.registerCommand("footer", {
    description: "Toggle the custom footer",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      apply(ctx);
      await refreshPullRequests(ctx);
    },
  });
}
