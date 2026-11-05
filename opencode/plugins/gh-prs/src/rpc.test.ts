import { expect, test } from "bun:test"
import type { PrSummary } from "./rpc.ts"
import { api, parsePrSummary } from "./rpc.ts"

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

test("parses nullable pull-request summary RPC output", () => {
  expect(parsePrSummary(summary)).toEqual(summary)
  expect(parsePrSummary(null)).toBeNull()
})

test("rejects malformed pull-request summary RPC output", () => {
  expect(() => parsePrSummary({ ...summary, checks: "unknown" })).toThrow("checks")
  expect(() => parsePrSummary({ owner: "lovablelabs" })).toThrow()
  expect(() => parsePrSummary("lovablelabs/lovable#456")).toThrow()
})

test("parses resolve output at the client RPC boundary", async () => {
  const client = {
    rpc: () => ({
      mentioned: async () => ({ prs: [] }),
      resolve: async () => ({ ...summary, checks: "unknown" }),
      detail: async () => ({}),
      files: async () => ({}),
      act: async () => ({}),
    }),
  }

  const resolving = api(client).resolve({ reference: "lovablelabs/lovable#456" })

  await expect(resolving).rejects.toThrow("checks")
})

test("parses capability lease output at the client RPC boundary", async () => {
  const client = {
    rpc: () => ({
      mentioned: async () => ({ prs: [] }),
      resolve: async () => null,
      detail: async () => ({}),
      files: async () => ({}),
      act: async () => ({}),
      cardLease: async () => ({ expiresAt: "later" }),
      cardRelease: async () => ({ released: true }),
    }),
  }

  const leasing = api(client).cardLease({ sessionID: "session-1", token: "window-1" })

  await expect(leasing).rejects.toThrow("lease")
})
