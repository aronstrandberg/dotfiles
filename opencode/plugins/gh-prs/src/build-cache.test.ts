import { expect, test } from "bun:test"
import { BuildCache, BuildLoadPool } from "./build-cache.ts"
import type { BuildSummary } from "./build.ts"
import type { BuildRef } from "./build-card.ts"

const ref: BuildRef = { organization: "lovable", pipeline: "deploy", number: 42 }
const summary: BuildSummary = {
  ...ref,
  state: { kind: "running" },
  url: "https://buildkite.com/lovable/deploy/builds/42",
  branch: "main",
  commit: "0123456789abcdef0123456789abcdef01234567",
  message: "Deploy",
  createdAt: 1_700_000_000_000,
  startedAt: 1_700_000_005_000,
  finishedAt: null,
  failedJobs: [],
}

function cache(options: {
  now?: () => number
  capacity?: number
  pool?: BuildLoadPool
  load?: (ref: BuildRef, signal: AbortSignal) => Promise<BuildSummary>
}) {
  return new BuildCache({
    ttl: 30_000,
    capacity: options.capacity ?? 20,
    now: options.now ?? (() => 1_000),
    pool: options.pool ?? new BuildLoadPool(2),
    load: options.load ?? (async (input) => ({ ...summary, ...input })),
  })
}

test("reuses builds within the TTL, reloads at the boundary, and evicts at capacity", async () => {
  let now = 1_000
  let loads = 0
  const builds = cache({
    capacity: 2,
    now: () => now,
    load: async (input) => {
      loads += 1
      return { ...summary, ...input, url: `https://buildkite.com/lovable/deploy/builds/${input.number}` }
    },
  })

  await builds.get(ref, new AbortController().signal)
  await builds.get(ref, new AbortController().signal)
  now = 31_000
  await builds.get(ref, new AbortController().signal)
  for (const number of [43, 44]) await builds.get({ ...ref, number }, new AbortController().signal)
  await builds.get(ref, new AbortController().signal)

  expect(loads).toBe(5)
})

test("deduplicates loads while callers cancel independently", async () => {
  let loads = 0
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  let loadSignal: AbortSignal | undefined
  const builds = cache({
    load: async (_ref, signal) => {
      loads += 1
      loadSignal = signal
      await gate
      return summary
    },
  })
  const cancelled = new AbortController()

  const first = builds.get(ref, cancelled.signal)
  const second = builds.get(ref, new AbortController().signal)
  cancelled.abort(new DOMException("Caller left", "AbortError"))

  await expect(first).rejects.toHaveProperty("name", "AbortError")
  expect(loads).toBe(1)
  expect(loadSignal?.aborted).toBe(false)
  finish?.()
  expect(await second).toEqual(summary)
})

test("uses its own bounded load pool", async () => {
  const pool = new BuildLoadPool(1)
  let active = 0
  let maximum = 0
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const builds = cache({
    pool,
    load: async (input) => {
      active += 1
      maximum = Math.max(maximum, active)
      await gate
      active -= 1
      return { ...summary, ...input, url: `https://buildkite.com/lovable/deploy/builds/${input.number}` }
    },
  })
  const first = builds.get(ref, new AbortController().signal)
  const second = builds.get({ ...ref, number: 43 }, new AbortController().signal)
  await Promise.resolve()

  expect(maximum).toBe(1)
  finish?.()
  await Promise.all([first, second])
  expect(maximum).toBe(1)
})

test("aborts cache-owned work and rejects new loads after disposal", async () => {
  let loadSignal: AbortSignal | undefined
  const builds = cache({
    load: async (_input, signal) => {
      loadSignal = signal
      return await new Promise<BuildSummary>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      })
    },
  })
  const loading = builds.get(ref, new AbortController().signal)
  const rejected = loading.catch((error: unknown) => error)
  await Promise.resolve()

  builds.dispose()

  expect(await rejected).toHaveProperty("name", "AbortError")
  expect(loadSignal?.aborted).toBe(true)
  await expect(builds.get(ref, new AbortController().signal)).rejects.toHaveProperty("name", "AbortError")
})
