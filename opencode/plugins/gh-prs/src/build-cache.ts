import type { BuildSummary } from "./build.ts"
import { buildAddress, type BuildRef } from "./build-card.ts"

/** Independent FIFO concurrency budget for Ratchet HTTP reads. */
export class BuildLoadPool {
  #active = 0
  readonly #waiting: Array<() => void> = []

  constructor(private readonly limit: number) {}

  /** Runs one load after a slot is available. */
  async run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
    await this.#acquire()
    try {
      if (signal.aborted) throw signal.reason
      return await task()
    } finally {
      this.#release()
    }
  }

  #acquire(): Promise<void> {
    if (this.#active < this.limit) {
      this.#active += 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => this.#waiting.push(resolve))
  }

  #release(): void {
    const next = this.#waiting.shift()
    if (next) next()
    else this.#active -= 1
  }
}

/** Dependencies and limits for the server-owned Buildkite build cache. */
export interface BuildCacheOptions {
  readonly ttl: number
  readonly capacity: number
  readonly now: () => number
  readonly pool: BuildLoadPool
  readonly load: (ref: BuildRef, signal: AbortSignal) => Promise<BuildSummary>
}

/** Caches Ratchet build reads with cache-owned cancellation and caller-independent waits. */
export class BuildCache {
  readonly #entries = new Map<string, { readonly at: number; readonly build: BuildSummary }>()
  readonly #inflight = new Map<
    string,
    { readonly controller: AbortController; readonly promise: Promise<BuildSummary> }
  >()
  #disposed = false

  constructor(private readonly options: BuildCacheOptions) {}

  /** Loads one build without giving a caller ownership of shared work. */
  async get(ref: BuildRef, signal: AbortSignal): Promise<BuildSummary> {
    if (this.#disposed) throw new DOMException("Build cache disposed", "AbortError")
    if (signal.aborted) throw signal.reason
    const key = buildAddress(ref)
    const hit = this.#entries.get(key)
    if (hit && this.options.now() - hit.at < this.options.ttl) return hit.build
    const running = this.#inflight.get(key)
    if (running) return waitFor(running.promise, signal)
    const controller = new AbortController()
    const promise = this.options.pool
      .run(() => this.options.load(ref, controller.signal), controller.signal)
      .then((build) => {
        this.#store(key, build)
        return build
      })
      .finally(() => {
        if (this.#inflight.get(key)?.promise === promise) this.#inflight.delete(key)
      })
    this.#inflight.set(key, { controller, promise })
    return waitFor(promise, signal)
  }

  /** Aborts all cache-owned loads and prevents new work. */
  dispose(): void {
    this.#disposed = true
    this.#entries.clear()
    for (const load of this.#inflight.values()) load.controller.abort()
  }

  #store(key: string, build: BuildSummary): void {
    this.#entries.delete(key)
    this.#entries.set(key, { at: this.options.now(), build })
    while (this.#entries.size > this.options.capacity) {
      const oldest = this.#entries.keys().next()
      if (oldest.done) return
      this.#entries.delete(oldest.value)
    }
  }
}

function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason)
    signal.addEventListener("abort", aborted, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", aborted)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", aborted)
        reject(error)
      },
    )
  })
}
