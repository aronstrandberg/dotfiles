/** A GitHub Actions workflow run identity. */
export interface RunRef {
  readonly owner: string
  readonly repo: string
  readonly runID: number
}

/** GitHub's non-terminal workflow run statuses. */
export type RunActiveStatus = "queued" | "in_progress" | "requested" | "waiting" | "pending"

/** GitHub's terminal workflow run conclusions. */
export type RunConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "stale"
  | "startup_failure"

/** A workflow run's legal execution states. */
export type RunState =
  | { readonly status: RunActiveStatus }
  | { readonly status: "completed"; readonly conclusion: RunConclusion }

/** Narrow workflow run data safe to send across the plugin RPC boundary. */
export interface RunSummary extends RunRef {
  readonly url: string
  readonly workflow: string
  readonly runNumber: number
  readonly attempt: number
  readonly branch: string | null
  readonly headSha: string
  readonly event: string
  readonly state: RunState
  readonly createdAt: string
  readonly startedAt: string | null
  readonly updatedAt: string
}

/** Parses untrusted GitHub REST output into the workflow run domain. */
export function parseRun(ref: RunRef, value: unknown): RunSummary {
  const invalid = (field?: string): never => {
    throw new TypeError(`Invalid GitHub Actions run${field ? ` field: ${field}` : ""}`)
  }
  if (typeof value !== "object" || value === null) return invalid()
  const field = (name: string): unknown => Reflect.get(value, name)
  const text = (name: string): string => {
    const result = field(name)
    if (typeof result !== "string" || result.trim() === "") return invalid(name)
    return result
  }
  const string = (name: string): string => {
    const result = field(name)
    if (typeof result !== "string") return invalid(name)
    return result
  }
  const nullableString = (name: string): string | null => {
    const result = field(name)
    if (result !== null && typeof result !== "string") return invalid(name)
    return result
  }
  const integer = (name: string): number => {
    const result = field(name)
    if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 1) return invalid(name)
    return result
  }
  const timestamp = (name: string, nullable = false): string | null => {
    const result = field(name)
    if (nullable && result === null) return null
    if (typeof result !== "string" || !Number.isFinite(Date.parse(result))) return invalid(name)
    return result
  }
  if (integer("id") !== ref.runID) return invalid("id")
  const url = text("html_url")
  if (url !== `https://github.com/${ref.owner}/${ref.repo}/actions/runs/${ref.runID}`) return invalid("html_url")
  const name = nullableString("name")?.trim() ?? ""
  const displayTitle = string("display_title").trim()
  if (!displayTitle) return invalid("display_title")
  const branch = field("head_branch")
  if (branch !== null && (typeof branch !== "string" || branch.trim() === "")) return invalid("head_branch")
  const headSha = text("head_sha")
  if (!/^[0-9a-f]{40}$/i.test(headSha)) return invalid("head_sha")
  return {
    ...ref,
    url,
    workflow: name || displayTitle,
    runNumber: integer("run_number"),
    attempt: integer("run_attempt"),
    branch,
    headSha,
    event: text("event"),
    state: parseRunState(field("status"), field("conclusion"), invalid),
    createdAt: timestamp("created_at") ?? invalid("created_at"),
    startedAt: timestamp("run_started_at", true),
    updatedAt: timestamp("updated_at") ?? invalid("updated_at"),
  }
}

function parseRunState(status: unknown, conclusion: unknown, invalid: (field?: string) => never): RunState {
  switch (status) {
    case "queued":
    case "in_progress":
    case "requested":
    case "waiting":
    case "pending":
      if (conclusion !== null) return invalid("conclusion")
      return { status }
    case "completed":
      switch (conclusion) {
        case "success":
        case "failure":
        case "neutral":
        case "cancelled":
        case "skipped":
        case "timed_out":
        case "action_required":
        case "stale":
        case "startup_failure":
          return { status, conclusion }
        default:
          return invalid("conclusion")
      }
    default:
      return invalid("status")
  }
}
