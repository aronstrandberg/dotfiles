import type { RunRef, RunSummary } from "./run.ts"
import type { GitHubLoadPool } from "./summary-cache.ts"

/** Dependencies and limits for the server-owned workflow run cache. */
export interface RunCacheOptions {
  readonly ttl: number
  readonly capacity: number
  readonly now: () => number
  readonly pool: GitHubLoadPool
  readonly load: (ref: RunRef, signal: AbortSignal) => Promise<RunSummary>
}

/** Caches workflow runs separately from PR summaries while sharing their process budget. */
export class RunCache {
  readonly #entries = new Map<string, { readonly at: number; readonly run: RunSummary }>()
  readonly #inflight = new Map<
    string,
    { readonly controller: AbortController; readonly promise: Promise<RunSummary> }
  >()
  #disposed = false

  constructor(private readonly options: RunCacheOptions) {}

  /** Loads one run without giving a caller ownership of shared work. */
  async get(ref: RunRef, signal: AbortSignal): Promise<RunSummary> {
    if (this.#disposed) throw new DOMException("Run cache disposed", "AbortError")
    if (signal.aborted) throw signal.reason
    const key = runKey(ref)
    const hit = this.#entries.get(key)
    if (hit && this.options.now() - hit.at < this.options.ttl) return hit.run
    const running = this.#inflight.get(key)
    if (running) return waitFor(running.promise, signal)
    const controller = new AbortController()
    const promise = this.options.pool
      .run(() => this.options.load(ref, controller.signal), controller.signal)
      .then((run) => {
        this.#store(key, run)
        return run
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

  #store(key: string, run: RunSummary): void {
    this.#entries.delete(key)
    this.#entries.set(key, { at: this.options.now(), run })
    while (this.#entries.size > this.options.capacity) {
      const oldest = this.#entries.keys().next()
      if (oldest.done) return
      this.#entries.delete(oldest.value)
    }
  }
}

function runKey(ref: RunRef): string {
  return `${ref.owner}/${ref.repo}/actions/runs/${ref.runID}`
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
