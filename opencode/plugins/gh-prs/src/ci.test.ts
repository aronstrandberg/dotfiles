import { expect, test } from "bun:test"
import { githubCheckCounts } from "./ci.ts"

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
