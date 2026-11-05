import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import type { PrSummary } from "../rpc.ts"
import { createPrCardLookup, prCardLookupState } from "./card-view.tsx"

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

test("resolves a card through the routed session client", async () => {
  const localClient = { id: "local" }
  const remoteClient = { id: "remote" }
  const clients: unknown[] = []
  let readState = (): ReturnType<typeof prCardLookupState> | undefined => undefined
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    const lookup = createPrCardLookup(
      () => ({ directory: "/workspace", server: { client: remoteClient } }),
      () => "lovablelabs/lovable#456",
      localClient,
      async (client) => {
        clients.push(client)
        return summary
      },
    )
    readState = () => prCardLookupState(lookup)
  })
  await Bun.sleep(0)

  expect(clients).toEqual([remoteClient])
  expect(readState()).toEqual({ status: "resolved", pr: summary })
  dispose()
})

test("projects null and failed card lookups to host fallback", async () => {
  const stateFor = async (resolve: () => Promise<PrSummary | null>) => {
    let readState = (): ReturnType<typeof prCardLookupState> | undefined => undefined
    let dispose = () => {}
    createRoot((rootDispose) => {
      dispose = rootDispose
      const lookup = createPrCardLookup(
        () => ({ directory: "/workspace", server: { client: {} } }),
        () => "lovablelabs/lovable#456",
        {},
        resolve,
      )
      readState = () => prCardLookupState(lookup)
    })
    await Bun.sleep(0)
    const state = readState()
    dispose()
    return state
  }

  const missing = await stateFor(async () => null)
  const failed = await stateFor(async () => {
    throw new Error("GitHub unavailable")
  })

  expect(missing).toEqual({ status: "failed" })
  expect(failed).toEqual({ status: "failed" })
})

test("aborts the card RPC when its mounted owner is disposed", async () => {
  let rpcSignal: AbortSignal | undefined
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    createPrCardLookup(
      () => ({ directory: "/workspace", server: { client: {} } }),
      () => "lovablelabs/lovable#456",
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
