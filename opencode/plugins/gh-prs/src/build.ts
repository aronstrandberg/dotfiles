import { buildAddress, type BuildRef } from "./build-card.ts"

/** Buildkite's known display states plus a safe representation of future states. */
export type BuildState =
  | {
      readonly kind:
        | "scheduled"
        | "running"
        | "failing"
        | "failed"
        | "passed"
        | "blocked"
        | "canceling"
        | "canceled"
        | "skipped"
        | "not_run"
    }
  | { readonly kind: "unknown"; readonly label: string }

/** Narrow build data safe to send across the plugin RPC boundary. */
export interface BuildSummary extends BuildRef {
  readonly state: BuildState
  readonly url: string
  readonly branch: string
  readonly commit: string
  readonly message: string | null
  readonly createdAt: number
  readonly startedAt: number | null
  readonly finishedAt: number | null
  readonly failedJobs: readonly string[]
}

const UNSAFE_FORMATTING = /[\p{Cc}\p{Cf}]/gu

/** Strips unsafe formatting, normalizes whitespace, and caps untrusted Buildkite text by code point. */
export function sanitizeBuildText(value: string, maximum: number): string {
  return Array.from(value.replace(UNSAFE_FORMATTING, " ").replace(/\s+/g, " ").trim()).slice(0, maximum).join("")
}

/** Parses the safe display label for an unrecognized Buildkite state. */
export function parseUnknownBuildStateLabel(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Invalid unknown Buildkite state")
  const label = sanitizeBuildText(value, 64)
  if (!label) throw new TypeError("Invalid unknown Buildkite state")
  return label
}

/** Parses untrusted Ratchet output into the Buildkite build domain. */
export function parseBuild(ref: BuildRef, value: unknown): BuildSummary {
  const invalid = (field?: string): never => {
    throw new TypeError(`Invalid Ratchet build${field ? ` field: ${field}` : ""}`)
  }
  if (typeof value !== "object" || value === null) return invalid()
  const allowed = new Set([
    "organization",
    "pipeline",
    "number",
    "state",
    "url",
    "branch",
    "commit",
    "message",
    "createdAt",
    "startedAt",
    "finishedAt",
    "failedJobs",
  ])
  if (Object.keys(value).some((key) => !allowed.has(key)) || Object.keys(value).length !== allowed.size) {
    return invalid()
  }
  const field = (name: string): unknown => Reflect.get(value, name)
  const string = (name: string): string => {
    const result = field(name)
    if (typeof result !== "string") return invalid(name)
    return result
  }
  const timestamp = (name: string, nullable = false): number | null => {
    const result = field(name)
    if (nullable && result === null) return null
    if (typeof result !== "number" || !Number.isFinite(result) || result < 0) return invalid(name)
    return result
  }
  const number = field("number")
  if (!Number.isSafeInteger(number) || number !== ref.number) return invalid("number")
  if (string("organization") !== ref.organization) return invalid("organization")
  if (string("pipeline") !== ref.pipeline) return invalid("pipeline")
  const url = string("url")
  if (url !== buildAddress(ref)) return invalid("url")
  const message = field("message")
  if (message !== null && typeof message !== "string") return invalid("message")
  const failedJobs = field("failedJobs")
  if (!Array.isArray(failedJobs) || failedJobs.some((job) => typeof job !== "string")) return invalid("failedJobs")
  return {
    ...ref,
    state: parseBuildState(field("state"), invalid),
    url,
    branch: string("branch"),
    commit: string("commit"),
    message,
    createdAt: timestamp("createdAt") ?? invalid("createdAt"),
    startedAt: timestamp("startedAt", true),
    finishedAt: timestamp("finishedAt", true),
    failedJobs,
  }
}

function parseBuildState(value: unknown, invalid: (field?: string) => never): BuildState {
  switch (value) {
    case "scheduled":
    case "running":
    case "failing":
    case "failed":
    case "passed":
    case "blocked":
    case "canceling":
    case "canceled":
    case "skipped":
    case "not_run":
      return { kind: value }
    default: {
      try {
        return { kind: "unknown", label: parseUnknownBuildStateLabel(value) }
      } catch {
        return invalid("state")
      }
    }
  }
}
