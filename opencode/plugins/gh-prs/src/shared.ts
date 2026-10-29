import type { Check, PrDetail, PrRef, PrSummary } from "./rpc.ts"

const PR_URL = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(\/[\w-]+)?/g

/** Every GitHub pull request URL in `text`, with the sub-page (`files`, `checks`) it pointed at. */
export function findPrUrls(text: string): (PrRef & { page?: string })[] {
  return [...text.matchAll(PR_URL)].map((match) => ({
    owner: match[1]!,
    repo: match[2]!.replace(/\.git$/, ""),
    number: Number(match[3]),
    page: match[4]?.slice(1),
  }))
}

export function parsePrUrl(url: string) {
  return findPrUrls(url)[0]
}

export function prKey(ref: PrRef) {
  return `${ref.owner}/${ref.repo}#${ref.number}`
}

export function prUrl(ref: PrRef) {
  return `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`
}

export function relativeTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return ""
  const seconds = Math.round((now - Date.parse(iso)) / 1000)
  if (seconds < 60) return "just now"
  const units: [number, string][] = [
    [60, "m"],
    [60, "h"],
    [24, "d"],
    [7, "w"],
    [4.35, "mo"],
    [12, "y"],
  ]
  let value = seconds / 60
  let unit = "m"
  for (let index = 1; index < units.length && value >= units[index]![0]; index++) {
    value /= units[index]![0]
    unit = units[index]![1]
  }
  return `${Math.floor(value)}${unit} ago`
}

export function duration(check: Check) {
  if (!check.startedAt || !check.completedAt) return ""
  const seconds = Math.max(0, Math.round((Date.parse(check.completedAt) - Date.parse(check.startedAt)) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function checkCounts(checks: readonly Check[]) {
  const counts = { success: 0, failure: 0, pending: 0, skipped: 0, neutral: 0 }
  for (const check of checks) counts[check.state]++
  return counts
}

const CHECK_ORDER: Record<Check["state"], number> = { failure: 0, pending: 1, success: 2, neutral: 3, skipped: 4 }

export function sortChecks(checks: readonly Check[]) {
  return [...checks].sort((a, b) => CHECK_ORDER[a.state] - CHECK_ORDER[b.state] || a.name.localeCompare(b.name))
}

export function stateLabel(pr: Pick<PrSummary, "state" | "isDraft" | "isInMergeQueue">) {
  if (pr.state === "MERGED") return "Merged"
  if (pr.state === "CLOSED") return "Closed"
  if (pr.isInMergeQueue) return "Queued"
  if (pr.isDraft) return "Draft"
  return "Open"
}

export function reviewLabel(decision: PrSummary["reviewDecision"]) {
  if (decision === "APPROVED") return "Approved"
  if (decision === "CHANGES_REQUESTED") return "Changes requested"
  if (decision === "REVIEW_REQUIRED") return "Review required"
  return ""
}

/** What stands between the PR and a merge, in GitHub's own terms. */
export function mergeStatusText(pr: PrDetail) {
  if (pr.state === "MERGED") return `Merged ${relativeTime(pr.mergedAt)}`
  if (pr.state === "CLOSED") return "Closed without merging"
  if (pr.isInMergeQueue)
    return pr.mergeQueuePosition === null ? "In the merge queue" : `In the merge queue, position ${pr.mergeQueuePosition + 1}`
  if (pr.autoMerge) return `Auto-merge (${(pr.autoMergeMethod ?? "").toLowerCase()}) is on: merges when requirements pass`
  if (pr.mergeable === "CONFLICTING") return "Has conflicts with the base branch"
  switch (pr.mergeStateStatus) {
    case "CLEAN":
      return "Ready to merge"
    case "UNSTABLE":
      return "Mergeable, but some non-required checks fail"
    case "HAS_HOOKS":
      return "Ready to merge (with pre-receive hooks)"
    case "BEHIND":
      return "Behind the base branch"
    case "BLOCKED":
      return pr.reviewDecision === "REVIEW_REQUIRED" || pr.reviewDecision === "CHANGES_REQUESTED"
        ? `Blocked: ${reviewLabel(pr.reviewDecision).toLowerCase()}`
        : "Blocked by branch protection (required checks or reviews)"
    case "DRAFT":
      return "Draft: mark ready for review to merge"
    case "DIRTY":
      return "Has conflicts with the base branch"
    default:
      return "Checking mergeability…"
  }
}

export const MERGE_METHOD_LABEL = {
  squash: "Squash and merge",
  merge: "Create a merge commit",
  rebase: "Rebase and merge",
} as const

/** Lower-cased language id for a file name, for syntax highlighting. */
export function languageOf(path: string) {
  const name = path.split("/").pop() ?? path
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : ""
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    go: "go",
    py: "python",
    rs: "rust",
    md: "markdown",
    mdx: "markdown",
    json: "json",
    jsonc: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    css: "css",
    html: "html",
    sql: "sql",
    proto: "protobuf",
    tf: "hcl",
    nix: "nix",
  }
  if (name === "Dockerfile") return "dockerfile"
  return map[ext]
}

/** Markdown as GitHub shows it: HTML comments (bot state markers, PR templates) are not rendered. */
export function visibleMarkdown(text: string) {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim()
}
