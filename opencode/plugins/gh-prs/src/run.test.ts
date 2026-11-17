import { expect, test } from "bun:test"
import { workflowRun } from "./github.ts"
import { parseRun, type RunRef, type RunSummary } from "./run.ts"

const ref: RunRef = { owner: "lovablelabs", repo: "lovable", runID: 12_345 }
const raw = {
  id: 12_345,
  html_url: "https://github.com/lovablelabs/lovable/actions/runs/12345",
  name: "CI",
  display_title: "Add run cards",
  run_number: 87,
  run_attempt: 2,
  head_branch: "feat/run-cards",
  head_sha: "0123456789abcdef0123456789abcdef01234567",
  event: "pull_request",
  status: "completed",
  conclusion: "success",
  created_at: "2026-11-16T10:00:00Z",
  run_started_at: "2026-11-16T10:00:05Z",
  updated_at: "2026-11-16T10:02:10Z",
}

test("parses GitHub run statuses and conclusions into exhaustive domain variants", () => {
  const active = ["queued", "in_progress", "requested", "waiting", "pending"] as const
  const conclusions = [
    "success",
    "failure",
    "neutral",
    "cancelled",
    "skipped",
    "timed_out",
    "action_required",
    "stale",
    "startup_failure",
  ] as const

  const states = [
    ...active.map((status) => parseRun(ref, { ...raw, status, conclusion: null }).state),
    ...conclusions.map((conclusion) => parseRun(ref, { ...raw, status: "completed", conclusion }).state),
  ]

  expect(states).toEqual([
    ...active.map((status) => ({ status })),
    ...conclusions.map((conclusion) => ({ status: "completed" as const, conclusion })),
  ])
})

test("projects only the narrow trusted run fields and falls back from an empty workflow name", () => {
  const run = parseRun(ref, { ...raw, name: " ", extra: "untrusted" })

  expect(run).toEqual<RunSummary>({
    ...ref,
    url: raw.html_url,
    workflow: raw.display_title,
    runNumber: 87,
    attempt: 2,
    branch: "feat/run-cards",
    headSha: raw.head_sha,
    event: "pull_request",
    state: { status: "completed", conclusion: "success" },
    createdAt: raw.created_at,
    startedAt: raw.run_started_at,
    updatedAt: raw.updated_at,
  })
})

test("falls back to the display title when GitHub returns a null or blank workflow name", () => {
  expect(parseRun(ref, { ...raw, name: null }).workflow).toBe(raw.display_title)
  expect(parseRun(ref, { ...raw, name: " \t" }).workflow).toBe(raw.display_title)
  expect(() => parseRun(ref, { ...raw, name: null, display_title: " " })).toThrow("display_title")
})

test("rejects malformed and contradictory GitHub run output", () => {
  const invalid = [
    null,
    { ...raw, id: 12_346 },
    { ...raw, html_url: "https://evil.example/run/12345" },
    { ...raw, run_number: 0 },
    { ...raw, run_attempt: 1.5 },
    { ...raw, head_sha: "not-a-sha" },
    { ...raw, status: "mystery" },
    { ...raw, status: "completed", conclusion: null },
    { ...raw, status: "queued", conclusion: "success" },
    { ...raw, conclusion: "unknown" },
    { ...raw, created_at: "yesterday" },
  ]

  for (const value of invalid) expect(() => parseRun(ref, value)).toThrow("Invalid GitHub Actions run")
})

test("loads one workflow run through the cancellable gh api adapter", async () => {
  const controller = new AbortController()
  const calls: unknown[] = []

  const run = await workflowRun(ref, { gh: "/usr/local/bin/gh", signal: controller.signal }, async (args, options) => {
    calls.push({ args, options })
    return JSON.stringify(raw)
  })

  expect(run.state).toEqual({ status: "completed", conclusion: "success" })
  expect(calls).toEqual([
    {
      args: ["api", "repos/lovablelabs/lovable/actions/runs/12345"],
      options: { gh: "/usr/local/bin/gh", signal: controller.signal },
    },
  ])
})
