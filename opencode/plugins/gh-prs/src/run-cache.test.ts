import { expect, test } from "bun:test"
import { RunCache } from "./run-cache.ts"
import type { RunRef, RunSummary } from "./run.ts"
import { GitHubLoadPool } from "./summary-cache.ts"

const ref: RunRef = { owner: "lovablelabs", repo: "lovable", runID: 12_345 }
const summary: RunSummary = {
  ...ref,
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

function cache(options: {
  now?: () => number
  capacity?: number
  pool?: GitHubLoadPool
  load?: (ref: RunRef, signal: AbortSignal) => Promise<RunSummary>
}) {
  return new RunCache({
    ttl: 30_000,
    capacity: options.capacity ?? 20,
    now: options.now ?? (() => 1_000),
    pool: options.pool ?? new GitHubLoadPool(4),
    load: options.load ?? (async (input) => ({ ...summary, ...input })),
  })
}

test("reuses a run inside the TTL and reloads at its boundary", async () => {
  let now = 1_000
  let loads = 0
  const runs = cache({
    now: () => now,
    load: async () => {
      loads += 1
      return summary
    },
  })

  await runs.get(ref, new AbortController().signal)
  await runs.get(ref, new AbortController().signal)
  now = 31_000
  await runs.get(ref, new AbortController().signal)

  expect(loads).toBe(2)
})

test("deduplicates a run load while each caller waits independently", async () => {
  let loads = 0
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  let loadSignal: AbortSignal | undefined
  const runs = cache({
    load: async (_ref, signal) => {
      loads += 1
      loadSignal = signal
      await gate
      return summary
    },
  })
  const cancelled = new AbortController()

  const first = runs.get(ref, cancelled.signal)
  const second = runs.get(ref, new AbortController().signal)
  cancelled.abort(new DOMException("Caller left", "AbortError"))

  await expect(first).rejects.toHaveProperty("name", "AbortError")
  expect(loads).toBe(1)
  expect(loadSignal?.aborted).toBe(false)
  finish?.()
  expect(await second).toEqual(summary)
})

test("evicts the oldest completed run at bounded capacity", async () => {
  let loads = 0
  const runs = cache({
    capacity: 2,
    load: async (input) => {
      loads += 1
      return {
        ...summary,
        ...input,
        url: `https://github.com/${input.owner}/${input.repo}/actions/runs/${input.runID}`,
      }
    },
  })
  const refs = [1, 2, 3].map((runID) => ({ ...ref, runID }))

  for (const input of refs) await runs.get(input, new AbortController().signal)
  await runs.get(refs[0]!, new AbortController().signal)

  expect(loads).toBe(4)
})

test("aborts cache-owned loads and rejects new work after disposal", async () => {
  let loadSignal: AbortSignal | undefined
  const runs = cache({
    load: async (_ref, signal) => {
      loadSignal = signal
      return await new Promise<RunSummary>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      })
    },
  })
  const loading = runs.get(ref, new AbortController().signal)
  await Promise.resolve()

  runs.dispose()

  await expect(loading).rejects.toHaveProperty("name", "AbortError")
  expect(loadSignal?.aborted).toBe(true)
  await expect(runs.get(ref, new AbortController().signal)).rejects.toHaveProperty("name", "AbortError")
})

test("shares the GitHub process limit with other cache users", async () => {
  const pool = new GitHubLoadPool(1)
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  let runLoads = 0
  const runs = cache({
    pool,
    load: async () => {
      runLoads += 1
      return summary
    },
  })

  const blocker = pool.run(async () => gate, new AbortController().signal)
  const loading = runs.get(ref, new AbortController().signal)
  await Promise.resolve()
  const whileBlocked = runLoads
  finish?.()
  await Promise.all([blocker, loading])

  expect(whileBlocked).toBe(0)
  expect(runLoads).toBe(1)
})
