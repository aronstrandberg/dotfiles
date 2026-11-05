import { expect, test } from "bun:test"
import type { PrSummary } from "../rpc.ts"
import { prCardProjection } from "./card.ts"

const open: PrSummary = {
  owner: "lovablelabs",
  repo: "lovable",
  number: 456,
  url: "https://github.com/lovablelabs/lovable/pull/456",
  title: "Render pull request cards",
  state: "OPEN",
  isDraft: false,
  author: "aronstrandberg",
  headRefName: "pr-cards",
  additions: 42,
  deletions: 7,
  reviewDecision: null,
  checks: "success",
  isInMergeQueue: false,
  autoMerge: false,
}

test("projects a stable loading card", () => {
  expect(prCardProjection({ status: "loading" })).toEqual({
    type: "loading",
    label: "Loading pull request…",
  })
})

test("projects an open pull request and successful checks", () => {
  expect(prCardProjection({ status: "resolved", pr: open })).toEqual({
    type: "card",
    number: "#456",
    title: "Render pull request cards",
    repository: "lovablelabs/lovable",
    state: "Open",
    checks: "Checks passing",
  })
})

test("projects draft, merged, and closed states with each check status", () => {
  const cases = [
    [{ ...open, isDraft: true, checks: "pending" as const }, ["Draft", "Checks running"]],
    [{ ...open, state: "MERGED" as const, checks: "none" as const }, ["Merged", "No checks"]],
    [{ ...open, state: "CLOSED" as const, checks: "failure" as const }, ["Closed", "Checks failing"]],
  ] as const

  const labels = cases.map(([pr]) => {
    const projection = prCardProjection({ status: "resolved", pr })
    return projection.type === "card" ? [projection.state, projection.checks] : undefined
  })

  expect(labels).toEqual(cases.map(([, expected]) => [...expected]))
})

test("projects lookup failure as host code-block fallback", () => {
  expect(prCardProjection({ status: "failed" })).toEqual({ type: "fallback" })
})
