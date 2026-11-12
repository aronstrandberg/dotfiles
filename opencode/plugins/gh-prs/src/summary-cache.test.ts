import { expect, test } from "bun:test"
import type { PrRef, PrSummary } from "./rpc.ts"
import { GitHubLoadPool, RepositoryCache, SummaryCache } from "./summary-cache.ts"

const ref: PrRef = { owner: "lovablelabs", repo: "lovable", number: 456 }
const summary: PrSummary = {
  ...ref,
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

test("reuses a summary loaded inside the cache TTL", async () => {
  let loads = 0
  const cache = new SummaryCache({
    ttl: 30_000,
    capacity: 100,
    concurrency: 4,
    now: () => 1_000,
    load: async () => {
      loads += 1
      return [summary]
    },
  })

  const first = await cache.get(ref, new AbortController().signal)
  const second = await cache.get(ref, new AbortController().signal)

  expect([first, second]).toEqual([summary, summary])
  expect(loads).toBe(1)
})

test("reloads a summary at the cache TTL boundary", async () => {
  let now = 1_000
  let loads = 0
  const cache = new SummaryCache({
    ttl: 30_000,
    capacity: 100,
    concurrency: 4,
    now: () => now,
    load: async () => {
      loads += 1
      return [summary]
    },
  })
  await cache.get(ref, new AbortController().signal)

  now = 31_000
  await cache.get(ref, new AbortController().signal)

  expect(loads).toBe(2)
})

test("deduplicates concurrent loads for the same pull request", async () => {
  let loads = 0
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const cache = new SummaryCache({
    ttl: 30_000,
    capacity: 100,
    concurrency: 4,
    now: () => 1_000,
    load: async () => {
      loads += 1
      await gate
      return [summary]
    },
  })

  const first = cache.get(ref, new AbortController().signal)
  const second = cache.get(ref, new AbortController().signal)
  await Promise.resolve()

  expect(loads).toBe(1)
  finish?.()
  expect(await Promise.all([first, second])).toEqual([summary, summary])
})

test("cancelling one waiter does not cancel the shared summary load", async () => {
  let finish: (() => void) | undefined
  let loadSignal: AbortSignal | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const cache = new SummaryCache({
    ttl: 30_000,
    capacity: 100,
    concurrency: 4,
    now: () => 1_000,
    load: async (_refs, signal) => {
      loadSignal = signal
      await new Promise<void>((resolve, reject) => {
        const aborted = () => reject(signal.reason)
        signal.addEventListener("abort", aborted, { once: true })
        void gate.then(resolve).finally(() => signal.removeEventListener("abort", aborted))
      })
      return [summary]
    },
  })
  const cancelled = new AbortController()

  const first = cache.get(ref, cancelled.signal)
  const second = cache.get(ref, new AbortController().signal)
  cancelled.abort(new DOMException("Cancelled waiter", "AbortError"))

  await expect(first).rejects.toHaveProperty("name", "AbortError")
  expect(loadSignal?.aborted).toBe(false)
  finish?.()
  expect(await second).toEqual(summary)
})

test("bounds concurrent distinct summary loads", async () => {
  let active = 0
  let maximum = 0
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const cache = new SummaryCache({
    ttl: 30_000,
    capacity: 100,
    concurrency: 4,
    now: () => 1_000,
    load: async (refs) => {
      active += 1
      maximum = Math.max(maximum, active)
      await gate
      active -= 1
      return refs.map((item) => ({ ...summary, ...item }))
    },
  })
  const refs = Array.from({ length: 6 }, (_, index) => ({ ...ref, number: index + 1 }))

  const loads = refs.map((item) => cache.get(item, new AbortController().signal))
  await Promise.resolve()
  const observed = maximum
  finish?.()
  await Promise.all(loads)

  expect(observed).toBe(4)
})

test("loads multiple cache misses as one batch and preserves reference order", async () => {
  const batches: PrRef[][] = []
  const cache = new SummaryCache({
    ttl: 30_000,
    capacity: 100,
    concurrency: 4,
    now: () => 1_000,
    load: async (refs) => {
      batches.push([...refs])
      return [...refs].reverse().map((item) => ({ ...summary, ...item }))
    },
  })
  const refs = [
    { ...ref, number: 1 },
    { ...ref, number: 2 },
  ]

  const loaded = await cache.getMany(refs, false, new AbortController().signal)

  expect(batches).toEqual([refs])
  expect(loaded.map((item) => item.number)).toEqual([1, 2])
})

test("evicts the oldest completed summary when capacity is reached", async () => {
  let loads = 0
  const cache = new SummaryCache({
    ttl: 30_000,
    capacity: 2,
    concurrency: 4,
    now: () => 1_000,
    load: async (refs) => {
      loads += 1
      return refs.map((item) => ({ ...summary, ...item }))
    },
  })
  const refs = Array.from({ length: 3 }, (_, index) => ({ ...ref, number: index + 1 }))
  const first = refs[0]
  if (!first) throw new Error("Expected an eviction fixture")

  for (const item of refs) await cache.get(item, new AbortController().signal)
  await cache.get(first, new AbortController().signal)

  expect(loads).toBe(4)
})

test("aborts cache-owned loads when the cache is disposed", async () => {
  let loadSignal: AbortSignal | undefined
  const cache = new SummaryCache({
    ttl: 30_000,
    capacity: 100,
    concurrency: 4,
    now: () => 1_000,
    load: async (_refs, signal) => {
      loadSignal = signal
      return await new Promise<readonly PrSummary[]>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      })
    },
  })
  const loading = cache.get(ref, new AbortController().signal)
  await Promise.resolve()

  cache.dispose()

  await expect(loading).rejects.toHaveProperty("name", "AbortError")
  expect(loadSignal?.aborted).toBe(true)
})

test("seeds and invalidates a completed summary", async () => {
  let loads = 0
  const cache = new SummaryCache({
    ttl: 30_000,
    capacity: 100,
    concurrency: 4,
    now: () => 1_000,
    load: async () => {
      loads += 1
      return [summary]
    },
  })
  cache.put(summary)

  const seeded = await cache.get(ref, new AbortController().signal)
  cache.invalidate(ref)
  await cache.get(ref, new AbortController().signal)

  expect(seeded).toEqual(summary)
  expect(loads).toBe(1)
})

test("deduplicates concurrent repository discovery by session directory", async () => {
  let loads = 0
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const cache = new RepositoryCache({
    ttl: 30_000,
    capacity: 20,
    now: () => 1_000,
    pool: new GitHubLoadPool(4),
    load: async () => {
      loads += 1
      await gate
      return { owner: "lovablelabs", repo: "lovable" }
    },
  })

  const first = cache.get("/workspace", new AbortController().signal)
  const second = cache.get("/workspace", new AbortController().signal)
  await Promise.resolve()

  expect(loads).toBe(1)
  finish?.()
  expect(await Promise.all([first, second])).toEqual([
    { owner: "lovablelabs", repo: "lovable" },
    { owner: "lovablelabs", repo: "lovable" },
  ])
})

test("shares one concurrency budget across summaries and repository discovery", async () => {
  const pool = new GitHubLoadPool(1)
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  let repositoryLoads = 0
  const summaries = new SummaryCache({
    ttl: 30_000,
    capacity: 100,
    concurrency: 1,
    pool,
    now: () => 1_000,
    load: async () => {
      await gate
      return [summary]
    },
  })
  const repositories = new RepositoryCache({
    ttl: 30_000,
    capacity: 20,
    pool,
    now: () => 1_000,
    load: async () => {
      repositoryLoads += 1
      return { owner: "lovablelabs", repo: "lovable" }
    },
  })

  const summaryLoad = summaries.get(ref, new AbortController().signal)
  const repositoryLoad = repositories.get("/workspace", new AbortController().signal)
  await Promise.resolve()
  const whileSummaryRuns = repositoryLoads
  finish?.()
  await Promise.all([summaryLoad, repositoryLoad])

  expect(whileSummaryRuns).toBe(0)
  expect(repositoryLoads).toBe(1)
})
