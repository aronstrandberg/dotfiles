import { expect, test } from "bun:test"
import { parseBuild, parseUnknownBuildStateLabel, type BuildState } from "./build.ts"
import type { BuildRef } from "./build-card.ts"

const ref: BuildRef = { organization: "lovable", pipeline: "deploy-production", number: 42 }
const raw = {
  ...ref,
  state: "passed",
  url: "https://buildkite.com/lovable/deploy-production/builds/42",
  branch: "main",
  commit: "0123456789abcdef0123456789abcdef01234567",
  message: "Deploy the API\nwith details",
  createdAt: 1_700_000_000_000,
  startedAt: 1_700_000_005_000,
  finishedAt: 1_700_000_125_000,
  failedJobs: [],
}

test("parses the Ratchet build contract into a narrow build summary", () => {
  expect(parseBuild(ref, raw)).toEqual({ ...raw, state: { kind: "passed" } })
})

test("maps every documented Buildkite state and preserves a sanitized unknown state", () => {
  const states = [
    "scheduled",
    "running",
    "failing",
    "failed",
    "passed",
    "blocked",
    "canceling",
    "canceled",
    "skipped",
    "not_run",
  ] as const

  expect(states.map((state) => parseBuild(ref, { ...raw, state }).state)).toEqual(states.map((kind) => ({ kind })))
  expect(parseBuild(ref, { ...raw, state: `future\u0000 state ${"x".repeat(100)}` }).state).toEqual({
    kind: "unknown",
    label: `future state ${"x".repeat(51)}`,
  } satisfies BuildState)
})

test("parses unknown state labels once with control and bidi stripping and a length cap", () => {
  expect(parseUnknownBuildStateLabel("Passed")).toBe("Passed")
  expect(parseUnknownBuildStateLabel("PASSED")).toBe("PASSED")
  expect(parseUnknownBuildStateLabel("future\u0000\u202estate")).toBe("future state")
  expect(parseUnknownBuildStateLabel("x".repeat(100))).toBe("x".repeat(64))
  expect(() => parseUnknownBuildStateLabel("\u0000\u202e")).toThrow("state")

  expect(parseBuild(ref, { ...raw, state: "Passed" }).state).toEqual({
    kind: "unknown",
    label: "Passed",
  })
  expect(parseBuild(ref, { ...raw, state: "PASSED" }).state).toEqual({
    kind: "unknown",
    label: "PASSED",
  })
})

test("rejects malformed, mismatched, missing, and extra Ratchet build fields", () => {
  const invalid = [
    null,
    { ...raw, number: 43 },
    { ...raw, url: "https://buildkite.com/lovable/deploy-production/builds/43" },
    { ...raw, state: "" },
    { ...raw, message: 1 },
    { ...raw, createdAt: Number.NaN },
    { ...raw, startedAt: "now" },
    { ...raw, failedJobs: ["test", 1] },
    { ...raw, extra: "untrusted" },
    { ...raw, branch: undefined },
  ]

  for (const value of invalid) expect(() => parseBuild(ref, value)).toThrow("Invalid Ratchet build")
})
