import { expect, test } from "bun:test"
import type { PrSummary } from "./rpc.ts"
import { stackMermaid } from "./stack.ts"

const pr = (number: number, head: string, base: string, extra: Partial<PrSummary> = {}): PrSummary => ({
  owner: "lovablelabs",
  repo: "lovable",
  number,
  url: `https://github.com/lovablelabs/lovable/pull/${number}`,
  title: `PR ${number}`,
  state: "OPEN",
  isDraft: false,
  author: "aronstrandberg",
  headRefName: head,
  baseRefName: base,
  additions: 1,
  deletions: 1,
  reviewDecision: null,
  checks: "success",
  ci: { kind: "green" },
  isInMergeQueue: false,
  autoMerge: false,
  ...extra,
})

test("a stack draws each PR on top of the PR whose branch it targets", () => {
  const graph = stackMermaid([pr(2, "two", "one"), pr(1, "one", "main")])

  expect(graph).toContain('b0["main"]')
  expect(graph).toContain('p0["#35;2 PR 2"]')
  expect(graph).toContain('p1["#35;1 PR 1"]')
  expect(graph).toContain("b0 --> p1")
  expect(graph).toContain("p1 --> p0")
  expect(graph?.startsWith("flowchart BT")).toBe(true)
})

test("independent PRs on the same base share one base node", () => {
  const graph = stackMermaid([pr(1, "one", "main"), pr(2, "two", "main")])

  expect(graph?.match(/\["main"\]/g)).toHaveLength(1)
  expect(graph).toContain("b0 --> p0")
  expect(graph).toContain("b0 --> p1")
})

test("branches with the same name in different repositories do not link", () => {
  const graph = stackMermaid([pr(1, "feature", "main"), pr(2, "child", "feature", { repo: "other" })])

  expect(graph).not.toContain("p0 --> p1")
  expect(graph).toContain('["other: feature"]')
})

test("titles cannot break the Mermaid syntax and long titles are shortened", () => {
  const graph = stackMermaid([pr(1, "one", "main", { title: 'Quote " and #hash ] and a title far longer than fits' })])

  expect(graph).toContain('p0["#35;1 Quote #quot; and #35;hash ] and a title far longer…"]')
})

test("nodes are classed by CI and merge state so the graph shows where attention is needed", () => {
  const graph = stackMermaid([
    pr(1, "one", "main", { ci: { kind: "red", count: 1, names: ["lint"], running: 0 } }),
    pr(2, "two", "one", { ci: { kind: "running", count: 1, names: ["test"] } }),
    pr(3, "three", "two", { state: "MERGED" }),
  ])

  expect(graph).toContain("class p0 red")
  expect(graph).toContain("class p1 running")
  expect(graph).toContain("class p2 merged")
})

test("no PRs give no graph", () => {
  expect(stackMermaid([])).toBeUndefined()
})
