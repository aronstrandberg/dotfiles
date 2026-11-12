import { expect, test } from "bun:test"
import { ciStatus, githubCheckCounts } from "./ci.ts"

const counts = { success: 0, failure: 0, pending: 0, skipped: 0, neutral: 0, unknown: 0 }
const run = (name: string, status: string, conclusion: string | null = null) => ({
  __typename: "CheckRun",
  name,
  status,
  conclusion,
})

test("CI with only passing and skipped checks is all green", () => {
  const status = ciStatus({ ...counts, success: 150, skipped: 3 }, [run("Build", "COMPLETED", "SUCCESS")])

  expect(status).toEqual({ kind: "green" })
})

test("failing CI names the failing checks and counts the ones still running", () => {
  const nodes = [
    run("Lint", "COMPLETED", "FAILURE"),
    run("Build", "COMPLETED", "SUCCESS"),
    run("Test", "IN_PROGRESS"),
    { __typename: "StatusContext", context: "buildkite/ci", state: "ERROR" },
  ]

  const status = ciStatus({ ...counts, success: 1, failure: 3, pending: 1 }, nodes)

  expect(status).toEqual({ kind: "red", count: 3, names: ["Lint", "buildkite/ci"], running: 1 })
})

test("running CI names the checks that have not finished", () => {
  const nodes = [run("Test", "QUEUED"), { __typename: "StatusContext", context: "deploy", state: "PENDING" }]

  const status = ciStatus({ ...counts, success: 4, pending: 2 }, nodes)

  expect(status).toEqual({ kind: "running", count: 2, names: ["Test", "deploy"] })
})

test("checks GitHub cancelled after a merge or a newer push do not turn CI red", () => {
  const nodes = [run("test-go", "COMPLETED", "CANCELLED"), run("Build", "COMPLETED", "SUCCESS")]
  const rollup = githubCheckCounts({
    totalCount: 2,
    checkRunCountsByState: [
      { state: "CANCELLED", count: 1 },
      { state: "SUCCESS", count: 1 },
    ],
    statusContextCountsByState: [],
  })

  expect(ciStatus(rollup, nodes)).toEqual({ kind: "green" })
})

test("a commit with no checks, or checks in unknown states, is never all green", () => {
  expect(ciStatus(undefined, [])).toEqual({ kind: "none" })
  expect(ciStatus({ ...counts, success: 3, unknown: 1 }, [])).toEqual({ kind: "unknown", count: 1 })
})

test("CI counts include every GitHub check, including failures beyond the first page", () => {
  const counts = githubCheckCounts({
    totalCount: 158,
    checkRunCountsByState: [
      { state: "SUCCESS", count: 150 },
      { state: "TIMED_OUT", count: 1 },
      { state: "IN_PROGRESS", count: 2 },
      { state: "SKIPPED", count: 3 },
    ],
    statusContextCountsByState: [
      { state: "ERROR", count: 1 },
      { state: "PENDING", count: 1 },
    ],
  })

  expect(counts).toEqual({ success: 150, failure: 2, pending: 3, skipped: 3, neutral: 0, unknown: 0 })
})

test("missing and unfamiliar GitHub outcomes never look like passing CI", () => {
  expect(githubCheckCounts(null)).toBeUndefined()
  expect(
    githubCheckCounts({
      totalCount: 5,
      checkRunCountsByState: [{ state: "NEW_STATE", count: 1 }],
      statusContextCountsByState: [],
    }),
  ).toEqual({ success: 0, failure: 0, pending: 0, skipped: 0, neutral: 0, unknown: 5 })
  expect(() =>
    githubCheckCounts({
      totalCount: 1,
      checkRunCountsByState: [{ state: "SUCCESS", count: -1 }],
      statusContextCountsByState: [],
    }),
  ).toThrow()
})
