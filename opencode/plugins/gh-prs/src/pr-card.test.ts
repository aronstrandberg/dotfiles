import { expect, test } from "bun:test"
import type { PrSummary } from "./rpc.ts"
import { addPrCardInstruction, parsePrCardPayload, resolvePrCard } from "./pr-card.ts"

const summary: PrSummary = {
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

test("parses a full GitHub pull request URL", () => {
  const mention = parsePrCardPayload("https://github.com/lovablelabs/lovable/pull/123")

  expect(mention).toEqual({
    type: "qualified",
    ref: { owner: "lovablelabs", repo: "lovable", number: 123 },
  })
})

test("parses a repository-qualified pull request reference", () => {
  const mention = parsePrCardPayload("lovablelabs/lovable#456")

  expect(mention).toEqual({
    type: "qualified",
    ref: { owner: "lovablelabs", repo: "lovable", number: 456 },
  })
})

test("parses a bare pull request reference", () => {
  const mention = parsePrCardPayload("#789")

  expect(mention).toEqual({ type: "bare", number: 789 })
})

test("normalizes fenced whitespace and tolerates a URL subpage", () => {
  const mention = parsePrCardPayload(" \n\thttps://github.com/lovablelabs/lovable/pull/321/files#diff-1\n ")

  expect(mention).toEqual({
    type: "qualified",
    ref: { owner: "lovablelabs", repo: "lovable", number: 321 },
  })
})

test("rejects empty, malformed, prose, and multiple-reference payloads", () => {
  const invalid = [
    "",
    "#0",
    "#9007199254740993",
    "owner/repo #12",
    "PR owner/repo#12",
    "owner/repo#12\nowner/repo#13",
    "https://gitlab.com/owner/repo/pull/12",
  ]

  expect(invalid.map(parsePrCardPayload)).toEqual(invalid.map(() => undefined))
})

test("resolves a qualified reference without repository discovery", async () => {
  const mention = parsePrCardPayload("lovablelabs/lovable#456")!
  const source = {
    repository: async () => {
      throw new Error("repository discovery must not run")
    },
    summary: async () => summary,
  }

  const resolved = await resolvePrCard(mention, "/workspace", source, new AbortController().signal)

  expect(resolved).toEqual(summary)
})

test("resolves a bare reference against the session directory repository", async () => {
  const mention = parsePrCardPayload("#456")!
  const directories: string[] = []
  const refs: unknown[] = []
  const source = {
    repository: async (directory: string) => {
      directories.push(directory)
      return { owner: "lovablelabs", repo: "lovable" }
    },
    summary: async (ref: unknown) => {
      refs.push(ref)
      return summary
    },
  }

  const resolved = await resolvePrCard(mention, "/workspace", source, new AbortController().signal)

  expect(resolved).toEqual(summary)
  expect(directories).toEqual(["/workspace"])
  expect(refs).toEqual([{ owner: "lovablelabs", repo: "lovable", number: 456 }])
})

test("returns no card when repository discovery or GitHub summary lookup misses", async () => {
  const signal = new AbortController().signal
  const noRepository = await resolvePrCard(
    { type: "bare", number: 456 },
    "/workspace",
    { repository: async () => undefined, summary: async () => summary },
    signal,
  )
  const noSummary = await resolvePrCard(
    { type: "qualified", ref: summary },
    "/workspace",
    { repository: async () => ({ owner: "unused", repo: "unused" }), summary: async () => undefined },
    signal,
  )

  expect([noRepository, noSummary]).toEqual([undefined, undefined])
})

test("propagates lookup cancellation with the caller signal", async () => {
  const controller = new AbortController()
  const aborted = new DOMException("The operation was aborted", "AbortError")
  const source = {
    repository: async () => ({ owner: "lovablelabs", repo: "lovable" }),
    summary: async (_ref: unknown, signal: AbortSignal) => {
      expect(signal).toBe(controller.signal)
      throw aborted
    },
  }

  const resolving = resolvePrCard({ type: "qualified", ref: summary }, "/workspace", source, controller.signal)

  await expect(resolving).rejects.toBe(aborted)
})

test("adds a specific agent instruction without changing persisted messages", () => {
  const system: Array<{ type: "text"; text: string }> = []

  addPrCardInstruction(system)

  expect(system).toHaveLength(1)
  expect(system[0]?.text).toContain("Keep the ordinary explanatory prose")
  expect(system[0]?.text).toContain("exactly one")
  expect(system[0]?.text).toContain("```gh-pr\nowner/repo#123\n```")
  expect(system[0]?.text).toContain("Always close the fence")
})
