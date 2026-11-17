import type { RunConclusion, RunState, RunSummary } from "../run.ts"

/** Complete asynchronous states of one workflow run card lookup. */
export type RunCardState =
  | { readonly status: "loading" }
  | { readonly status: "resolved"; readonly run: RunSummary }
  | { readonly status: "failed" }

/** Trusted visual tones used by workflow run states. */
export type RunCardTone = "success" | "failure" | "warning" | "muted"

/** Visible workflow run card outcomes, including host code-block fallback. */
export type RunCardProjection =
  | { readonly type: "loading"; readonly label: string }
  | {
      readonly type: "card"
      readonly workflow: string
      readonly run: string
      readonly attempt: string
      readonly repository: string
      readonly branchCommit: string
      readonly event: string
      readonly state: string
      readonly tone: RunCardTone
      readonly timing: string
      readonly url: string
      readonly accessibleLabel: string
    }
  | { readonly type: "fallback" }

/** Projects asynchronous workflow run state into compact, accessible card content. */
export function runCardProjection(state: RunCardState, now = Date.now()): RunCardProjection {
  if (state.status === "loading") return { type: "loading", label: "Loading GitHub Actions run…" }
  if (state.status === "failed") return { type: "fallback" }
  const run = state.run
  const status = statusProjection(run.state)
  const repository = `${run.owner}/${run.repo}`
  const shortSha = run.headSha.slice(0, 7)
  const branchCommit = run.branch ? `${run.branch} @ ${shortSha}` : shortSha
  const start = Date.parse(run.startedAt ?? run.createdAt)
  const end = run.state.status === "completed" ? Date.parse(run.updatedAt) : now
  const duration = formatDuration(Math.max(0, Math.round((end - start) / 1_000)))
  const timing = run.state.status === "completed" ? duration : `${duration} elapsed`
  const attempt = run.attempt > 1 ? `Attempt ${run.attempt}` : ""
  const attemptLabel = run.attempt > 1 ? `, attempt ${run.attempt}` : ""
  const sourceLabel = run.branch ? `Branch ${run.branch}, commit ${shortSha}` : `Commit ${shortSha}`
  const timingLabel = run.state.status === "completed" ? `Duration ${duration}` : `Elapsed ${duration}`
  return {
    type: "card",
    workflow: run.workflow,
    run: `#${run.runNumber}`,
    attempt,
    repository,
    branchCommit,
    event: run.event,
    state: status.label,
    tone: status.tone,
    timing,
    url: run.url,
    accessibleLabel: `GitHub Actions workflow ${run.workflow}, run #${run.runNumber}${attemptLabel}. ${status.label}. Repository ${repository}. ${sourceLabel}. Event ${run.event}. ${timingLabel}.`,
  }
}

function statusProjection(state: RunState): { readonly label: string; readonly tone: RunCardTone } {
  switch (state.status) {
    case "queued":
      return { label: "Queued", tone: "warning" }
    case "in_progress":
      return { label: "In progress", tone: "warning" }
    case "requested":
      return { label: "Requested", tone: "warning" }
    case "waiting":
      return { label: "Waiting", tone: "warning" }
    case "pending":
      return { label: "Pending", tone: "warning" }
    case "completed":
      return conclusionProjection(state.conclusion)
  }
}

function conclusionProjection(conclusion: RunConclusion): { readonly label: string; readonly tone: RunCardTone } {
  switch (conclusion) {
    case "success":
      return { label: "Success", tone: "success" }
    case "failure":
      return { label: "Failure", tone: "failure" }
    case "cancelled":
      return { label: "Cancelled", tone: "failure" }
    case "skipped":
      return { label: "Skipped", tone: "muted" }
    case "neutral":
      return { label: "Neutral", tone: "muted" }
    case "action_required":
      return { label: "Action required", tone: "failure" }
    case "timed_out":
      return { label: "Timed out", tone: "failure" }
    case "stale":
      return { label: "Stale", tone: "muted" }
    case "startup_failure":
      return { label: "Startup failure", tone: "failure" }
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
