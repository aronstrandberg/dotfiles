import { expect, test } from "bun:test"
import type { BuildSummary } from "./build.ts"
import type { PrSummary } from "./rpc.ts"
import { api, GhPrs, parseBuildSummary, parsePrAction, parsePrSummary, parseRunSummary } from "./rpc.ts"
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

test("keeps old card leases valid and lets new GUIs declare registered languages", () => {
  const input = GhPrs.methods.cardLease.input

  expect(input.required).toEqual(["sessionID", "token"])
  expect(input.properties.languages).toMatchObject({
    type: "array",
    items: { enum: ["gh-pr", "gh-run", "bk-build"] },
    minItems: 2,
    uniqueItems: true,
  })
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

const build: BuildSummary = {
  organization: "lovable",
  pipeline: "deploy",
  number: 42,
  state: { kind: "failed" },
  url: "https://buildkite.com/lovable/deploy/builds/42",
  branch: "main",
  commit: "0123456789abcdef0123456789abcdef01234567",
  message: "Deploy",
  createdAt: 1_700_000_000_000,
  startedAt: 1_700_000_005_000,
  finishedAt: 1_700_000_125_000,
  failedJobs: ["test"],
}

test("parses strict Buildkite build output at the client RPC boundary", async () => {
  expect(parseBuildSummary(build)).toEqual(build)
  expect(() => parseBuildSummary(null)).toThrow("RPC output")
  expect(() => parseBuildSummary({ ...build, state: { kind: "future" } })).toThrow("state")
  expect(() => parseBuildSummary({ ...build, extra: true })).toThrow("fields")
  expect(
    parseBuildSummary({
      ...build,
      state: { kind: "unknown", label: `Passed\u0000\u202e${"x".repeat(100)}` },
    }).state,
  ).toEqual({ kind: "unknown", label: `Passed ${"x".repeat(57)}` })

  const resolving = api({
    rpc: () => ({ resolveBuild: async () => ({ ...build, failedJobs: [1] }) }),
  }).resolveBuild({ reference: build.url })
  await expect(resolving).rejects.toThrow("failedJobs")
})

test("defines strict Buildkite build RPC input, output, and safe Ratchet error schemas", () => {
  const method = GhPrs.methods.resolveBuild

  expect(method.input).toMatchObject({
    type: "object",
    required: ["reference"],
    additionalProperties: false,
  })
  expect(method.output).toMatchObject({ type: "object", additionalProperties: false })
  expect(method.output).not.toHaveProperty("anyOf")
  expect(method.errors).toHaveProperty("ratchet")
})
