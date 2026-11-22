import { expect, test } from "bun:test"
import { parseUnknownBuildStateLabel, type BuildSummary } from "../build.ts"
import { buildCardProjection } from "./build-card.ts"

const build: BuildSummary = {
  organization: "lovable",
  pipeline: "deploy-production",
  number: 42,
  state: { kind: "failed" },
  url: "https://buildkite.com/lovable/deploy-production/builds/42",
  branch: "main",
  commit: "0123456789abcdef0123456789abcdef01234567",
  message: "Deploy the API\nextra details",
  createdAt: 1_700_000_000_000,
  startedAt: 1_700_000_005_000,
  finishedAt: 1_700_000_125_000,
  failedJobs: ["lint", "test", "deploy", "notify", "cleanup"],
}

test("projects all build fields, a first-line message, capped failed jobs, and an accessible label", () => {
  expect(buildCardProjection({ status: "resolved", build })).toEqual({
    type: "card",
    title: "deploy-production #42",
    organization: "lovable",
    message: "Deploy the API",
    branchCommit: "main @ 0123456",
    state: "Failed",
    tone: "failure",
    timing: "2m 0s",
    failedJobs: "lint, test, deploy, +2 more",
    url: build.url,
    accessibleLabel:
      "Buildkite pipeline deploy-production, build #42. Failed. Branch main, commit 0123456. Duration 2m 0s. 5 failed jobs.",
  })
})

test("projects elapsed time and unknown Buildkite state text without treating it as success", () => {
  const projection = buildCardProjection(
    {
      status: "resolved",
      build: {
        ...build,
        state: { kind: "unknown", label: "future_state" },
        message: null,
        startedAt: null,
        finishedAt: null,
        failedJobs: ["must not show"],
      },
    },
    1_700_000_065_000,
  )

  expect(projection).toMatchObject({
    type: "card",
    message: "",
    state: "Unknown: future_state",
    tone: "muted",
    timing: "1m 5s elapsed",
    failedJobs: "",
  })
  expect(projection.type === "card" ? projection.accessibleLabel : "").toContain("Unknown: future_state")
  expect(projection.type === "card" ? projection.tone : "").not.toBe("success")
})

test("labels every unknown state explicitly without success styling", () => {
  const cases = [
    ["Passed", "Passed"],
    ["PASSED", "PASSED"],
    ["future\u0000\u202estate", "future state"],
    ["x".repeat(100), "x".repeat(64)],
  ] as const

  for (const [source, safe] of cases) {
    const projection = buildCardProjection({
      status: "resolved",
      build: { ...build, state: { kind: "unknown", label: parseUnknownBuildStateLabel(source) } },
    })

    expect(projection).toMatchObject({ type: "card", state: `Unknown: ${safe}`, tone: "muted" })
    expect(projection.type === "card" ? projection.accessibleLabel : "").toContain(`Unknown: ${safe}`)
    expect(projection.type === "card" ? projection.tone : "").not.toBe("success")
  }
})

test("sanitizes and caps every untrusted display field and splits CR-only messages", () => {
  const projection = buildCardProjection({
    status: "resolved",
    build: {
      ...build,
      pipeline: `deploy\u0000\u202e-${"p".repeat(100)}`,
      branch: `main\u0000\u202e-${"b".repeat(140)}`,
      commit: `0123456\u202e`,
      message: `First line\rSecond line ${"m".repeat(200)}`,
      failedJobs: [`lint\u0000\u202e-job`, "j".repeat(100), "\u0000\u202e"],
    },
  })

  expect(projection).toMatchObject({
    type: "card",
    title: `deploy -${"p".repeat(72)} #42`,
    message: "First line",
    branchCommit: `main -${"b".repeat(114)} @ 0123456`,
    failedJobs: `lint -job, ${"j".repeat(80)}, Unknown job`,
  })
  const serialized =
    projection.type === "card"
      ? JSON.stringify([
          projection.title,
          projection.message,
          projection.branchCommit,
          projection.failedJobs,
          projection.accessibleLabel,
        ])
      : ""
  expect(serialized).not.toContain("\u0000")
  expect(serialized).not.toContain("\u202e")
})

test("caps an overlong first message line", () => {
  const projection = buildCardProjection({
    status: "resolved",
    build: { ...build, message: "m".repeat(200) },
  })

  expect(projection.type === "card" ? projection.message : "").toBe("m".repeat(160))
})

test("maps every documented Buildkite state to explicit text and a non-implicit tone", () => {
  const cases = [
    ["scheduled", "Scheduled", "warning"],
    ["running", "Running", "warning"],
    ["failing", "Failing", "failure"],
    ["failed", "Failed", "failure"],
    ["passed", "Passed", "success"],
    ["blocked", "Blocked", "warning"],
    ["canceling", "Canceling", "warning"],
    ["canceled", "Canceled", "failure"],
    ["skipped", "Skipped", "muted"],
    ["not_run", "Not run", "muted"],
  ] as const

  const projected = cases.map(([kind]) => {
    const result = buildCardProjection({ status: "resolved", build: { ...build, state: { kind } } })
    return result.type === "card" ? [result.state, result.tone] : undefined
  })

  expect(projected).toEqual(cases.map(([, label, tone]) => [label, tone]))
})

test("projects loading and failure to reserved-height UI and host fallback", () => {
  expect(buildCardProjection({ status: "loading" })).toEqual({
    type: "loading",
    label: "Loading Buildkite build…",
  })
  expect(buildCardProjection({ status: "failed" })).toEqual({ type: "fallback" })
})
