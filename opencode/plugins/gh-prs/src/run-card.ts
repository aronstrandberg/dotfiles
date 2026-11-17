import type { RunRef } from "./run.ts"

/** Strict RPC request for resolving one canonical workflow run reference. */
export interface RunCardRequest {
  readonly reference: string
}

/** Parses the complete source of one `gh-run` fence. */
export function parseRunCardPayload(payload: string): RunRef | undefined {
  const value = payload.trim()
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/([1-9]\d*)$/.exec(value)
  if (!match || !githubOwner(match[1]!) || !githubRepository(match[2]!)) return undefined
  const runID = Number(match[3])
  if (!Number.isSafeInteger(runID)) return undefined
  return { owner: match[1]!, repo: match[2]!, runID }
}

/** Parses untrusted RPC input without accepting fields outside the run-card contract. */
export function parseRunCardRequest(value: unknown): RunCardRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.keys(value).some((key) => key !== "reference") ||
    typeof Reflect.get(value, "reference") !== "string"
  ) {
    throw new TypeError("Invalid GitHub Actions run card request")
  }
  return { reference: Reflect.get(value, "reference") }
}

function githubOwner(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 39 &&
    /^[A-Za-z0-9-]+$/.test(value) &&
    !value.startsWith("-") &&
    !value.endsWith("-") &&
    !value.includes("--")
  )
}

function githubRepository(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 100 &&
    /^[A-Za-z0-9._-]+$/.test(value) &&
    value !== "." &&
    value !== ".." &&
    !value.endsWith(".git")
  )
}
