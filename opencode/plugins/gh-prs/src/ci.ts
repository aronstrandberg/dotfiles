/** Counts for the current commit, including outcomes the client cannot classify. */
export type CiCounts = Readonly<Record<"success" | "failure" | "pending" | "skipped" | "neutral" | "unknown", number>>

/** Parses normalized check counts received over RPC. */
export function parseCiCounts(value: unknown): CiCounts {
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid CI counts")
  const count = (name: string) => {
    const result: unknown = Reflect.get(value, name)
    if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 0)
      throw new TypeError("Invalid CI count")
    return result
  }
  return {
    success: count("success"),
    failure: count("failure"),
    pending: count("pending"),
    skipped: count("skipped"),
    neutral: count("neutral"),
    unknown: count("unknown"),
  }
}

/** Parses GitHub's full rollup counts without fetching or truncating individual checks. */
export function githubCheckCounts(value: unknown): CiCounts | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "object") throw new TypeError("Invalid GitHub check counts")
  const total: unknown = Reflect.get(value, "totalCount")
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0)
    throw new TypeError("Invalid GitHub check total")
  const counts = { success: 0, failure: 0, pending: 0, skipped: 0, neutral: 0, unknown: 0 }
  for (const field of ["checkRunCountsByState", "statusContextCountsByState"]) {
    const entries: unknown = Reflect.get(value, field)
    if (!Array.isArray(entries)) throw new TypeError("Invalid GitHub check counts")
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) throw new TypeError("Invalid GitHub check count")
      const state: unknown = Reflect.get(entry, "state")
      const count: unknown = Reflect.get(entry, "count")
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
        throw new TypeError("Invalid GitHub check count")
      counts[outcome(state)] += count
    }
  }
  counts.unknown += Math.max(0, total - Object.values(counts).reduce((sum, count) => sum + count, 0))
  return counts
}

type Outcome = keyof CiCounts

/** Maps a GitHub check-run or status-context state to the outcome the panel reports. */
function outcome(state: unknown): Outcome {
  switch (state) {
    case "SUCCESS":
      return "success"
    case "ACTION_REQUIRED":
    case "FAILURE":
    case "ERROR":
    case "STALE":
    case "STARTUP_FAILURE":
    case "TIMED_OUT":
      return "failure"
    case "EXPECTED":
    case "IN_PROGRESS":
    case "PENDING":
    case "QUEUED":
    case "WAITING":
      return "pending"
    case "SKIPPED":
      return "skipped"
    case "CANCELLED":
    case "NEUTRAL":
      return "neutral"
    default:
      return "unknown"
  }
}

/** What CI on the current commit needs from a reader: nothing, a failure to look at, or checks to wait for. */
export type CiStatus =
  | { readonly kind: "none" }
  | { readonly kind: "green" }
  | { readonly kind: "red"; readonly count: number; readonly names: readonly string[]; readonly running: number }
  | { readonly kind: "running"; readonly count: number; readonly names: readonly string[] }
  | { readonly kind: "unknown"; readonly count: number }

/**
 * Summarizes CI from GitHub's complete counts and the first page of check contexts.
 *
 * Counts decide the kind, so a failure beyond the loaded page still reads as red; names cover the loaded page only.
 */
export function ciStatus(counts: CiCounts | undefined, nodes: readonly unknown[]): CiStatus {
  if (!counts || Object.values(counts).every((count) => count === 0)) return { kind: "none" }
  const named = nodes.flatMap((node) => {
    if (typeof node !== "object" || node === null) return []
    const type: unknown = Reflect.get(node, "__typename")
    if (type === "CheckRun") {
      const name: unknown = Reflect.get(node, "name")
      const status: unknown = Reflect.get(node, "status")
      if (typeof name !== "string") return []
      return [{ name, outcome: status === "COMPLETED" ? outcome(Reflect.get(node, "conclusion")) : outcome(status) }]
    }
    if (type === "StatusContext") {
      const name: unknown = Reflect.get(node, "context")
      return typeof name === "string" ? [{ name, outcome: outcome(Reflect.get(node, "state")) }] : []
    }
    return []
  })
  const names = (kind: Outcome) => named.filter((check) => check.outcome === kind).map((check) => check.name)
  if (counts.failure > 0)
    return { kind: "red", count: counts.failure, names: names("failure"), running: counts.pending }
  if (counts.pending > 0) return { kind: "running", count: counts.pending, names: names("pending") }
  if (counts.unknown > 0) return { kind: "unknown", count: counts.unknown }
  return { kind: "green" }
}

/** Parses a CI status received over RPC. */
export function parseCiStatus(value: unknown): CiStatus {
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid CI status")
  const kind: unknown = Reflect.get(value, "kind")
  const count = (field: string) => {
    const result: unknown = Reflect.get(value, field)
    if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 0)
      throw new TypeError(`Invalid CI status field: ${field}`)
    return result
  }
  const names = () => {
    const result: unknown = Reflect.get(value, "names")
    if (!Array.isArray(result) || !result.every((name) => typeof name === "string"))
      throw new TypeError("Invalid CI status field: names")
    return result
  }
  switch (kind) {
    case "none":
    case "green":
      return { kind }
    case "red":
      return { kind, count: count("count"), names: names(), running: count("running") }
    case "running":
      return { kind, count: count("count"), names: names() }
    case "unknown":
      return { kind, count: count("count") }
    default:
      throw new TypeError("Invalid CI status field: kind")
  }
}
