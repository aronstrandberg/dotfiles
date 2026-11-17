import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import type { RunSummary } from "../run.ts"
import { createRunCardLookup, openRunCard, runCardLookupState, runCardProjectionOrThrow } from "./run-card-view.tsx"

const run: RunSummary = {
  owner: "lovablelabs",
  repo: "lovable",
  runID: 12_345,
  url: "https://github.com/lovablelabs/lovable/actions/runs/12345",
  workflow: "CI",
  runNumber: 87,
  attempt: 1,
  branch: "main",
  headSha: "0123456789abcdef0123456789abcdef01234567",
  event: "push",
  state: { status: "completed", conclusion: "success" },
  createdAt: "2026-11-16T10:00:00Z",
  startedAt: "2026-11-16T10:00:05Z",
  updatedAt: "2026-11-16T10:02:10Z",
}

test("resolves a run card through the routed session server client", async () => {
  const localClient = { id: "local" }
  const remoteClient = { id: "remote" }
  const clients: unknown[] = []
  let readState = (): ReturnType<typeof runCardLookupState> | undefined => undefined
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    const lookup = createRunCardLookup(
      () => ({ server: { client: remoteClient } }),
      () => run.url,
      localClient,
      async (client) => {
        clients.push(client)
        return run
      },
    )
    readState = () => runCardLookupState(lookup)
  })
  await Bun.sleep(0)

  expect(clients).toEqual([remoteClient])
  expect(readState()).toEqual({ status: "resolved", run })
  dispose()
})

test("aborts the run RPC when its mounted owner is disposed", () => {
  let rpcSignal: AbortSignal | undefined
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    createRunCardLookup(
      () => ({ server: { client: {} } }),
      () => run.url,
      {},
      async (_client, _input, signal) => {
        rpcSignal = signal
        return new Promise<never>(() => {})
      },
    )
  })

  expect(rpcSignal?.aborted).toBe(false)
  dispose()
  expect(rpcSignal?.aborted).toBe(true)
})

test("throws failed and missing lookups so the host restores the original block", () => {
  expect(() => runCardProjectionOrThrow({ latest: null, loading: false, error: undefined })).toThrow("not found")
  expect(() =>
    runCardProjectionOrThrow({ latest: undefined, loading: false, error: new Error("GitHub unavailable") }),
  ).toThrow("GitHub unavailable")
})

test("opens the resolved canonical run URL through the app system API", () => {
  const opened: string[] = []

  openRunCard({ openExternal: (url) => opened.push(url) }, run)

  expect(opened).toEqual([run.url])
})
