import { sanitizeBuildText, type BuildState, type BuildSummary } from "../build.ts"
import { buildAddress } from "../build-card.ts"

/** Complete asynchronous states of one Buildkite build card lookup. */
export type BuildCardState =
  | { readonly status: "loading" }
  | { readonly status: "resolved"; readonly build: BuildSummary }
  | { readonly status: "failed" }

/** Trusted visual tones used by build states. */
export type BuildCardTone = "success" | "failure" | "warning" | "muted"

/** Visible Buildkite card outcomes, including host code-block fallback. */
export type BuildCardProjection =
  | { readonly type: "loading"; readonly label: string }
  | {
      readonly type: "card"
      readonly title: string
      readonly organization: string
      readonly message: string
      readonly branchCommit: string
      readonly state: string
      readonly tone: BuildCardTone
      readonly timing: string
      readonly failedJobs: string
      readonly url: string
      readonly accessibleLabel: string
    }
  | { readonly type: "fallback" }

/** Projects asynchronous Buildkite state into compact, accessible card content. */
export function buildCardProjection(state: BuildCardState, now = Date.now()): BuildCardProjection {
  if (state.status === "loading") return { type: "loading", label: "Loading Buildkite build…" }
  if (state.status === "failed") return { type: "fallback" }
  const build = state.build
  const status = statusProjection(build.state)
  const pipeline = sanitizeBuildText(build.pipeline, 80) || "Unknown pipeline"
  const branch = sanitizeBuildText(build.branch, 120) || "Unknown branch"
  const shortCommit = sanitizeBuildText(build.commit, 40).slice(0, 7) || "unknown"
  const start = build.startedAt ?? build.createdAt
  const end = build.finishedAt ?? now
  const duration = formatDuration(Math.max(0, Math.round((end - start) / 1_000)))
  const timing = build.finishedAt === null ? `${duration} elapsed` : duration
  const timingLabel = build.finishedAt === null ? `Elapsed ${duration}` : `Duration ${duration}`
  const failed = build.state.kind === "failing" || build.state.kind === "failed" ? build.failedJobs : []
  const visible = failed.slice(0, 3).map((job) => sanitizeBuildText(job, 80) || "Unknown job")
  const more = failed.length - visible.length
  const failedJobs = [...visible, ...(more > 0 ? [`+${more} more`] : [])].join(", ")
  const failedLabel = failed.length > 0 ? ` ${failed.length} failed ${failed.length === 1 ? "job" : "jobs"}.` : ""
  return {
    type: "card",
    title: `${pipeline} #${build.number}`,
    organization: build.organization,
    message: sanitizeBuildText(build.message?.split(/\r\n|\r|\n/, 1)[0] ?? "", 160),
    branchCommit: `${branch} @ ${shortCommit}`,
    state: status.label,
    tone: status.tone,
    timing,
    failedJobs,
    url: buildAddress(build),
    accessibleLabel: `Buildkite pipeline ${pipeline}, build #${build.number}. ${status.label}. Branch ${branch}, commit ${shortCommit}. ${timingLabel}.${failedLabel}`,
  }
}

function statusProjection(state: BuildState): { readonly label: string; readonly tone: BuildCardTone } {
  switch (state.kind) {
    case "scheduled":
      return { label: "Scheduled", tone: "warning" }
    case "running":
      return { label: "Running", tone: "warning" }
    case "failing":
      return { label: "Failing", tone: "failure" }
    case "failed":
      return { label: "Failed", tone: "failure" }
    case "passed":
      return { label: "Passed", tone: "success" }
    case "blocked":
      return { label: "Blocked", tone: "warning" }
    case "canceling":
      return { label: "Canceling", tone: "warning" }
    case "canceled":
      return { label: "Canceled", tone: "failure" }
    case "skipped":
      return { label: "Skipped", tone: "muted" }
    case "not_run":
      return { label: "Not run", tone: "muted" }
    case "unknown":
      return { label: `Unknown: ${state.label}`, tone: "muted" }
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
