import { expect, test } from "bun:test"
import type { PrSummary } from "./rpc.ts"
import { api, GhPrs, parsePrAction, parsePrSummary, parseRunSummary } from "./rpc.ts"
import type { RunSummary } from "./run.ts"

test("PR actions from clients cannot smuggle gh flags such as --admin", () => {
  expect(() => parsePrAction({ type: "merge", method: "admin" })).toThrow()
  expect(() => parsePrAction({ type: "merge-stack", method: "squash --admin" })).toThrow()
  expect(() => parsePrAction({ type: "merge", admin: true })).toThrow()
  expect(() => parsePrAction({ type: "force-merge" })).toThrow()
  expect(parsePrAction({ type: "merge" })).toEqual({ type: "merge" })
  expect(parsePrAction({ type: "merge", method: "squash", auto: true })).toEqual({
    type: "merge",
    method: "squash",
    auto: true,
  })
  expect(parsePrAction({ type: "merge-stack", method: "rebase" })).toEqual({ type: "merge-stack", method: "rebase" })
  expect(parsePrAction({ type: "comment", body: "hi" })).toEqual({ type: "comment", body: "hi" })
})

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

test("parses nullable workflow run RPC output", () => {
  expect(parseRunSummary(run)).toEqual(run)
  expect(parseRunSummary(null)).toBeNull()
  expect(() => parseRunSummary({ ...run, state: { status: "completed", conclusion: "unknown" } })).toThrow("state")
  expect(() => parseRunSummary({ ...run, runID: Number.MAX_SAFE_INTEGER + 1 })).toThrow("runID")
  expect(() => parseRunSummary({ ...run, extra: "untrusted" })).toThrow("fields")
})

test("parses workflow run resolve output at the client RPC boundary", async () => {
  const client = {
    rpc: () => ({
      resolveRun: async () => ({ ...run, attempt: "two" }),
    }),
  }

  const resolving = api(client).resolveRun({
    reference: "https://github.com/lovablelabs/lovable/actions/runs/12345",
  })

  await expect(resolving).rejects.toThrow("attempt")
})

test("defines strict workflow run RPC input and output schemas", () => {
  const method = GhPrs.methods.resolveRun

  expect(method.input).toMatchObject({
    type: "object",
    required: ["reference"],
    additionalProperties: false,
  })
  expect(method.output).toMatchObject({ anyOf: [{ type: "object", additionalProperties: false }, { type: "null" }] })
})
