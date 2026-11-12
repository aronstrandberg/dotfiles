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
      switch (state) {
        case "SUCCESS":
          counts.success += count
          break
        case "ACTION_REQUIRED":
        case "CANCELLED":
        case "FAILURE":
        case "ERROR":
        case "STALE":
        case "STARTUP_FAILURE":
        case "TIMED_OUT":
          counts.failure += count
          break
        case "EXPECTED":
        case "IN_PROGRESS":
        case "PENDING":
        case "QUEUED":
        case "WAITING":
          counts.pending += count
          break
        case "SKIPPED":
          counts.skipped += count
          break
        case "NEUTRAL":
          counts.neutral += count
          break
        default:
          counts.unknown += count
      }
    }
  }
  counts.unknown += Math.max(0, total - Object.values(counts).reduce((sum, count) => sum + count, 0))
  return counts
}
