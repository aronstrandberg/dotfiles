import type { PrRef } from "./rpc.ts"

/** Agent-reported work states, independent of GitHub checks and reviews. */
export const workStates = ["agent-working", "waiting-user", "waiting-ci", "blocked", "ready"] as const

/** A registered PR and its last reported work status. */
export type TrackedPr = PrRef & {
  readonly state: "unassigned" | (typeof workStates)[number]
  readonly note: string
  readonly updatedAt: number
}

/** Display labels for explicitly reported work, not inferred agent activity. */
export const workLabels: Record<TrackedPr["state"], string> = {
  unassigned: "Not reported",
  "agent-working": "Agent working",
  "waiting-user": "Waiting for you",
  "waiting-ci": "Waiting for CI",
  blocked: "Blocked",
  ready: "Ready",
}

function isWorkState(value: unknown): value is TrackedPr["state"] {
  return value === "unassigned" || workStates.some((state) => state === value)
}

/** Parses a GitHub reference at tool and persistence boundaries. */
export function parsePrRef(value: unknown): PrRef {
  if (typeof value !== "object" || value === null) throw new TypeError("Expected a pull request reference")
  const owner = Reflect.get(value, "owner")
  const repo = Reflect.get(value, "repo")
  const number = Reflect.get(value, "number")
  if (
    typeof owner !== "string" ||
    !/^[\w.-]+$/.test(owner) ||
    typeof repo !== "string" ||
    !/^[\w.-]+$/.test(repo) ||
    typeof number !== "number" ||
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw new TypeError("Expected owner, repo, and a positive PR number")
  }
  return { owner: owner.toLowerCase(), repo: repo.toLowerCase(), number }
}

/** Parses durable work records and RPC results without trusting serialized types. */
export function parseTrackedPr(value: unknown): TrackedPr {
  const ref = parsePrRef(value)
  if (typeof value !== "object" || value === null) throw new TypeError("Expected a work status")
  const state = Reflect.get(value, "state")
  const note = Reflect.get(value, "note")
  const updatedAt = Reflect.get(value, "updatedAt")
  if (
    !isWorkState(state) ||
    typeof note !== "string" ||
    note.length > 1_000 ||
    (state !== "unassigned" && !note.trim()) ||
    typeof updatedAt !== "number" ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < 0 ||
    updatedAt > 8_640_000_000_000_000
  ) {
    throw new TypeError("Invalid work status: choose a state and provide a short note")
  }
  return { ...ref, state, note: note.trim(), updatedAt }
}
