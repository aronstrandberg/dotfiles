import { expect, test } from "bun:test"
import type { RunSummary } from "../run.ts"
import { runCardProjection } from "./run-card.ts"

const run: RunSummary = {
  owner: "lovablelabs",
  repo: "lovable",
  runID: 12_345,
  url: "https://github.com/lovablelabs/lovable/actions/runs/12345",
  workflow: "CI",
  runNumber: 87,
  attempt: 2,
  branch: "feat/run-cards",
  headSha: "0123456789abcdef0123456789abcdef01234567",
  event: "pull_request",
  state: { status: "completed", conclusion: "success" },
  createdAt: "2026-11-16T10:00:00Z",
  startedAt: "2026-11-16T10:00:05Z",
  updatedAt: "2026-11-16T10:02:10Z",
}

test("projects a workflow run card with duration and a complete accessible label", () => {
  expect(runCardProjection({ status: "resolved", run }, Date.parse("2026-11-16T10:03:00Z"))).toEqual({
    type: "card",
    workflow: "CI",
    run: "#87",
    attempt: "Attempt 2",
    repository: "lovablelabs/lovable",
    branchCommit: "feat/run-cards @ 0123456",
    event: "pull_request",
    state: "Success",
    tone: "success",
    timing: "2m 5s",
    url: run.url,
    accessibleLabel:
      "GitHub Actions workflow CI, run #87, attempt 2. Success. Repository lovablelabs/lovable. Branch feat/run-cards, commit 0123456. Event pull_request. Duration 2m 5s.",
  })
})

test("projects every active status and terminal conclusion without trusting raw state strings", () => {
  const cases = [
    [{ status: "queued" as const }, ["Queued", "warning"]],
    [{ status: "in_progress" as const }, ["In progress", "warning"]],
    [{ status: "requested" as const }, ["Requested", "warning"]],
    [{ status: "waiting" as const }, ["Waiting", "warning"]],
    [{ status: "pending" as const }, ["Pending", "warning"]],
    [{ status: "completed" as const, conclusion: "success" as const }, ["Success", "success"]],
    [{ status: "completed" as const, conclusion: "failure" as const }, ["Failure", "failure"]],
    [{ status: "completed" as const, conclusion: "cancelled" as const }, ["Cancelled", "failure"]],
    [{ status: "completed" as const, conclusion: "skipped" as const }, ["Skipped", "muted"]],
    [{ status: "completed" as const, conclusion: "neutral" as const }, ["Neutral", "muted"]],
    [{ status: "completed" as const, conclusion: "action_required" as const }, ["Action required", "failure"]],
    [{ status: "completed" as const, conclusion: "timed_out" as const }, ["Timed out", "failure"]],
    [{ status: "completed" as const, conclusion: "stale" as const }, ["Stale", "muted"]],
    [{ status: "completed" as const, conclusion: "startup_failure" as const }, ["Startup failure", "failure"]],
  ] as const

  const labels = cases.map(([state]) => {
    const projection = runCardProjection({ status: "resolved", run: { ...run, state } })
    return projection.type === "card" ? [projection.state, projection.tone] : undefined
  })

  expect(labels).toEqual(cases.map(([, expected]) => [...expected]))
})

test("uses elapsed time for an active run and a detached commit label when no branch exists", () => {
  const projection = runCardProjection(
    {
      status: "resolved",
      run: {
        ...run,
        attempt: 1,
        branch: null,
        state: { status: "in_progress" },
        startedAt: null,
      },
    },
    Date.parse("2026-11-16T10:01:05Z"),
  )

  expect(projection).toMatchObject({
    type: "card",
    attempt: "",
    branchCommit: "0123456",
    state: "In progress",
    timing: "1m 5s elapsed",
  })
  expect(projection.type === "card" ? projection.accessibleLabel : "").toContain("Commit 0123456")
})

test("projects loading and failure to reserved-height UI and host fallback", () => {
  expect(runCardProjection({ status: "loading" })).toEqual({
    type: "loading",
    label: "Loading GitHub Actions run…",
  })
  expect(runCardProjection({ status: "failed" })).toEqual({ type: "fallback" })
})
