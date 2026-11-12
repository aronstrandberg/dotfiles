import { expect, test } from "bun:test"
import { canReview, mergeChoices, type MergeMenuEntry } from "./merge.ts"
import type { PrDetail } from "./rpc.ts"

const pr = (extra: Partial<PrDetail> = {}): PrDetail => ({
  owner: "lovablelabs",
  repo: "lovable",
  number: 1,
  url: "",
  title: "t",
  state: "OPEN",
  isDraft: false,
  author: "aronstrandberg",
  headRefName: "h",
  baseRefName: "main",
  additions: 0,
  deletions: 0,
  reviewDecision: "APPROVED",
  checks: "success",
  isInMergeQueue: false,
  autoMerge: false,
  body: "",
  headRefOid: "abc",
  changedFiles: 1,
  createdAt: "",
  updatedAt: "",
  mergedAt: null,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  mergeQueue: true,
  mergeQueuePosition: null,
  autoMergeMethod: null,
  labels: [],
  reviewRequests: [],
  latestReviews: [],
  checkList: [],
  comments: [],
  reviews: [],
  threads: [],
  mergeMethods: ["squash"],
  defaultMergeMethod: "squash",
  viewerPermission: "ADMIN",
  viewerLogin: "aronstrandberg",
  stack: null,
  ...extra,
})

const actions = (menu: readonly MergeMenuEntry[]) =>
  menu.flatMap((entry) => (entry === "separator" ? [] : "group" in entry ? entry.items : [entry]))

test("on a merge-queue repo the primary button is Queue, whether or not checks have passed", () => {
  for (const mergeStateStatus of ["CLEAN", "BLOCKED"]) {
    const { primary } = mergeChoices(pr({ mergeStateStatus }))

    expect(primary?.label).toBe("Queue")
    expect(primary?.action).toEqual({ type: "merge" })
  }
})

test("an admin viewer is never offered a merge that bypasses the queue or branch protection", () => {
  const { primary, menu } = mergeChoices(pr({ viewerPermission: "ADMIN" }))
  const all = [...(primary ? [primary] : []), ...actions(menu)]

  expect(all.some((choice) => /admin|bypass/i.test(choice.label))).toBe(false)
  expect(all.some((choice) => "admin" in choice.action)).toBe(false)
})

test("when the queue cannot be detected, Queue still leaves the choice to gh instead of merging directly", () => {
  const { primary, menu } = mergeChoices(pr({ mergeQueue: null }))

  expect(primary?.label).toBe("Queue")
  expect(primary?.action).toEqual({ type: "merge" })
  expect(actions(menu).some((choice) => choice.action.type === "merge" && "method" in choice.action)).toBe(false)
})

test("a stacked PR whose base has no queue gets no merge button, and the menu names the base it merges into", () => {
  const { primary, menu } = mergeChoices(
    pr({ mergeQueue: false, baseRefName: "aronstrandberg/dx-1764-buildbarn-worker-flags" }),
  )
  const merges = actions(menu).filter((choice) => choice.action.type === "merge")

  expect(primary).toBeUndefined()
  expect(merges.map((choice) => choice.label)).toEqual([
    "Squash and merge into aronstrandberg/dx-1764-buildbarn-worker-flags",
    "Auto-merge into aronstrandberg/dx-1764-buildbarn-worker-flags: squash and merge",
  ])
})

const stack = (numbers: readonly [number, "open" | "merged" | "closed"][]): NonNullable<PrDetail["stack"]> => ({
  number: 155894,
  base: "main",
  members: numbers.map(([number, state]) => ({ number, state, draft: false })),
})

test("a PR in a GitHub stack queues every open PR up to it, through gh stack merge", () => {
  const { primary } = mergeChoices(
    pr({
      number: 157610,
      mergeQueue: false,
      baseRefName: "aronstrandberg/dx-1768-ci-amd64-rollout",
      stack: stack([
        [154973, "merged"],
        [154976, "merged"],
        [154977, "open"],
        [154978, "open"],
        [157610, "open"],
        [157700, "open"],
      ]),
    }),
  )

  expect(primary?.label).toBe("Queue stack (3 PRs)")
  expect(primary?.action).toEqual({ type: "merge-stack", method: "squash" })
  expect(primary?.confirm?.title).toBe("Queue #154977, #154978 and #157610?")
})

test("the last open PR at the bottom of a stack is plain Queue, but still goes through the stack", () => {
  const { primary } = mergeChoices(
    pr({
      number: 154977,
      baseRefName: "aronstrandberg/dx-1768-custom-rollout",
      mergeQueue: false,
      stack: stack([
        [154976, "merged"],
        [154977, "open"],
        [154978, "open"],
      ]),
    }),
  )

  expect(primary?.label).toBe("Queue")
  expect(primary?.action).toEqual({ type: "merge-stack", method: "squash" })
})

test("a draft lower in the stack removes every merge choice instead of falling back to merging into the parent", () => {
  const draftStack = stack([
    [154977, "open"],
    [154978, "open"],
  ])
  const { primary, menu } = mergeChoices(
    pr({
      number: 154978,
      mergeQueue: false,
      stack: { ...draftStack, members: [{ ...draftStack.members[0]!, draft: true }, draftStack.members[1]!] },
    }),
  )

  expect(primary).toBeUndefined()
  expect(actions(menu).some((choice) => choice.action.type.startsWith("merge"))).toBe(false)
})

test("a PR already in the queue offers no merge button", () => {
  expect(mergeChoices(pr({ isInMergeQueue: true })).primary).toBeUndefined()
})

test("authors cannot approve or request changes on their own PR", () => {
  expect(canReview(pr({ author: "aronstrandberg", viewerLogin: "aronstrandberg" }))).toBe(false)
  expect(canReview(pr({ author: "AronStrandberg", viewerLogin: "aronstrandberg" }))).toBe(false)
  expect(canReview(pr({ author: "mikn", viewerLogin: "aronstrandberg" }))).toBe(true)
  expect(canReview(pr({ author: "mikn", viewerLogin: "aronstrandberg", state: "MERGED" }))).toBe(false)
})
