import { expect, test } from "bun:test"
import { groupTracked } from "./groups.ts"
import type { PrSummary } from "./rpc.ts"
import type { TrackedPr } from "./work-status.ts"

const tracked = (number: number, state: TrackedPr["state"]): TrackedPr => ({
  owner: "lovablelabs",
  repo: "lovable",
  number,
  state,
  note: "",
  updatedAt: number,
})

const summary = (number: number, state: PrSummary["state"]): PrSummary => ({
  owner: "lovablelabs",
  repo: "lovable",
  number,
  url: "",
  title: `PR ${number}`,
  state,
  isDraft: false,
  author: "a",
  headRefName: `h${number}`,
  additions: 0,
  deletions: 0,
  reviewDecision: null,
  checks: "success",
  isInMergeQueue: false,
  autoMerge: false,
})

test("PRs group by what they need, in order of urgency, omitting empty groups", () => {
  const groups = groupTracked(
    [tracked(1, "ready"), tracked(2, "waiting-user"), tracked(3, "blocked"), tracked(4, "waiting-user")],
    [],
  )

  expect(groups.map((group) => [group.id, group.items.map((item) => item.tracked.number)])).toEqual([
    ["waiting-user", [2, 4]],
    ["blocked", [3]],
    ["ready", [1]],
  ])
})

test("merged and closed PRs go to Done whatever their last reported status", () => {
  const groups = groupTracked(
    [tracked(1, "blocked"), tracked(2, "agent-working"), tracked(3, "waiting-ci")],
    [summary(1, "MERGED"), summary(2, "CLOSED"), summary(3, "OPEN")],
  )

  expect(groups.map((group) => [group.id, group.items.map((item) => item.tracked.number)])).toEqual([
    ["waiting-ci", [3]],
    ["done", [1, 2]],
  ])
  expect(groups.at(-1)?.collapsed).toBe(true)
})

test("each item carries its GitHub summary when GitHub returned one", () => {
  const [group] = groupTracked([tracked(1, "ready"), tracked(2, "ready")], [summary(1, "OPEN")])

  expect(group?.items.map((item) => item.pr?.number)).toEqual([1, undefined])
})
