import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import type { BuildSummary } from "../build.ts"
import {
  buildCardLookupState,
  buildCardProjectionOrThrow,
  createBuildCardLookup,
  openBuildCard,
} from "./build-card-view.tsx"
import { api } from "../rpc.ts"

const build: BuildSummary = {
  organization: "lovable",
  pipeline: "deploy",
  number: 42,
  state: { kind: "passed" },
  url: "https://buildkite.com/lovable/deploy/builds/42",
  branch: "main",
  commit: "0123456789abcdef0123456789abcdef01234567",
  message: "Deploy",
  createdAt: 1_700_000_000_000,
  startedAt: 1_700_000_005_000,
  finishedAt: 1_700_000_125_000,
  failedJobs: [],
}

test("resolves a build card through the routed server and aborts with its mounted owner", async () => {
  const local = { id: "local" }
  const remote = { id: "remote" }
  let signal: AbortSignal | undefined
  let read = (): ReturnType<typeof buildCardLookupState> | undefined => undefined
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    const lookup = createBuildCardLookup(
      () => ({ server: { client: remote } }),
      () => build.url,
      local,
      async (client, _input, currentSignal) => {
        expect(client).toBe(remote)
        signal = currentSignal
        return build
      },
    )
    read = () => buildCardLookupState(lookup)
  })
  await Bun.sleep(0)

  expect(read()).toEqual({ status: "resolved", build })
  expect(signal?.aborted).toBe(false)
  dispose()
  expect(signal?.aborted).toBe(true)
})

test("treats null RPC output as a parse failure that restores the original block", async () => {
  const client = { rpc: () => ({ resolveBuild: async () => null }) }
  const error = await api(client)
    .resolveBuild({ reference: build.url })
    .catch((cause: unknown) => cause)

  expect(() => buildCardProjectionOrThrow({ latest: undefined, loading: false, error })).toThrow("RPC output")
})

test("throws lookup failures for host fallback and opens the canonical address through the system seam", () => {
  expect(() =>
    buildCardProjectionOrThrow({ latest: undefined, loading: false, error: new Error("Ratchet unavailable") }),
  ).toThrow("Ratchet unavailable")
  const opened: string[] = []
  openBuildCard({ openExternal: (url) => opened.push(url) }, { ...build, url: "https://attacker.invalid/build" })
  expect(opened).toEqual([build.url])
})
