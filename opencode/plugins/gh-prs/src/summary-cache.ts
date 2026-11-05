import type { PrRef, PrSummary } from "./rpc.ts"
import { prKey } from "./shared.ts"

/** Dependencies and limits for a server-owned pull-request summary cache. */
export interface SummaryCacheOptions {
  readonly ttl: number
  readonly capacity: number
  readonly concurrency: number
  readonly pool?: GitHubLoadPool
  readonly now: () => number
  readonly load: (refs: readonly PrRef[], signal: AbortSignal) => Promise<readonly PrSummary[]>
}

/** Caches GitHub summary lookups and owns the underlying load lifetimes. */
export class SummaryCache {
  readonly #entries = new Map<string, { readonly at: number; readonly summary: PrSummary | undefined }>()
  readonly #inflight = new Map<
    string,
    { readonly controller: AbortController; readonly promise: Promise<PrSummary | undefined> }
  >()
  readonly #pool: GitHubLoadPool
  #disposed = false

  constructor(private readonly options: SummaryCacheOptions) {
    this.#pool = options.pool ?? new GitHubLoadPool(options.concurrency)
  }

  /** Loads one summary, or returns `undefined` when GitHub has no accessible PR. */
  async get(ref: PrRef, signal: AbortSignal): Promise<PrSummary | undefined> {
    if (this.#disposed) throw new DOMException("Summary cache disposed", "AbortError")
    if (signal.aborted) throw signal.reason
    const key = prKey(ref)
    const hit = this.#entries.get(key)
    if (hit && this.options.now() - hit.at < this.options.ttl) return hit.summary
    const running = this.#inflight.get(key)
    if (running) return waitFor(running.promise, signal)
    const started = this.#start([ref]).get(key)
    if (!started) throw new Error("Summary cache did not start a requested load")
    return waitFor(started.promise, signal)
  }

  /** Loads summaries in input order, omitting inaccessible pull requests. */
  async getMany(refs: readonly PrRef[], fresh: boolean, signal: AbortSignal): Promise<PrSummary[]> {
    if (this.#disposed) throw new DOMException("Summary cache disposed", "AbortError")
    if (signal.aborted) throw signal.reason
    const now = this.options.now()
    const missing = new Map<string, PrRef>()
    for (const ref of refs) {
      const key = prKey(ref)
      const hit = this.#entries.get(key)
      if (!this.#inflight.has(key) && (fresh || !hit || now - hit.at >= this.options.ttl)) missing.set(key, ref)
    }
    this.#start([...missing.values()])
    const loaded = await waitFor(
      Promise.all(
        refs.map((ref) => {
          const key = prKey(ref)
          const running = this.#inflight.get(key)
          if (running) return running.promise
          return Promise.resolve(this.#entries.get(key)?.summary)
        }),
      ),
      signal,
    )
    return loaded.flatMap((summary) => (summary ? [summary] : []))
  }

  /** Aborts all cache-owned loads and prevents new work. */
  dispose(): void {
    this.#disposed = true
    this.#entries.clear()
    for (const controller of new Set([...this.#inflight.values()].map((load) => load.controller))) controller.abort()
  }

  /** Stores a summary returned by a more detailed GitHub lookup. */
  put(summary: PrSummary): void {
    this.#store(prKey(summary), summary)
  }

  /** Removes a completed summary after a mutating GitHub action. */
  invalidate(ref: PrRef): void {
    this.#entries.delete(prKey(ref))
  }

  #start(refs: readonly PrRef[]) {
    const started = new Map<
      string,
      { readonly controller: AbortController; readonly promise: Promise<PrSummary | undefined> }
    >()
    if (refs.length === 0) return started
    const controller = new AbortController()
    const batch = this.#pool
      .run(() => this.options.load(refs, controller.signal), controller.signal)
      .then((loaded) => new Map(loaded.map((summary) => [prKey(summary), summary])))
    for (const ref of refs) {
      const key = prKey(ref)
      const promise = batch
        .then((loaded) => {
          const summary = loaded.get(key)
          this.#store(key, summary)
          return summary
        })
        .finally(() => {
          if (this.#inflight.get(key)?.promise === promise) this.#inflight.delete(key)
        })
      const load = { controller, promise }
      this.#inflight.set(key, load)
      started.set(key, load)
    }
    return started
  }

  #store(key: string, summary: PrSummary | undefined): void {
    this.#entries.delete(key)
    this.#entries.set(key, { at: this.options.now(), summary })
    while (this.#entries.size > this.options.capacity) {
      const oldest = this.#entries.keys().next()
      if (oldest.done) return
      this.#entries.delete(oldest.value)
    }
  }
}

/** Shared FIFO concurrency budget for GitHub processes owned by the card resolver. */
export class GitHubLoadPool {
  #active = 0
  readonly #waiting: Array<() => void> = []

  constructor(private readonly limit: number) {}

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

type Repository = Pick<PrRef, "owner" | "repo">

/** Dependencies and limits for cached repository discovery. */
export interface RepositoryCacheOptions {
  readonly ttl: number
  readonly capacity: number
  readonly now: () => number
  readonly pool: GitHubLoadPool
  readonly load: (directory: string, signal: AbortSignal) => Promise<Repository | undefined>
}

/** Caches and deduplicates the repository selected for a session directory. */
export class RepositoryCache {
  readonly #entries = new Map<string, { readonly at: number; readonly repository: Repository | undefined }>()
  readonly #inflight = new Map<
    string,
    { readonly controller: AbortController; readonly promise: Promise<Repository | undefined> }
  >()
  #disposed = false

  constructor(private readonly options: RepositoryCacheOptions) {}

  /** Discovers one directory's repository without giving a caller ownership of shared work. */
  async get(directory: string, signal: AbortSignal): Promise<Repository | undefined> {
    if (this.#disposed) throw new DOMException("Repository cache disposed", "AbortError")
    if (signal.aborted) throw signal.reason
    const hit = this.#entries.get(directory)
    if (hit && this.options.now() - hit.at < this.options.ttl) return hit.repository
    const running = this.#inflight.get(directory)
    if (running) return waitFor(running.promise, signal)
    const controller = new AbortController()
    const promise = this.options.pool
      .run(() => this.options.load(directory, controller.signal), controller.signal)
      .then((repository) => {
        this.#store(directory, repository)
        return repository
      })
      .finally(() => {
        if (this.#inflight.get(directory)?.promise === promise) this.#inflight.delete(directory)
      })
    this.#inflight.set(directory, { controller, promise })
    return waitFor(promise, signal)
  }

  /** Aborts cache-owned repository discovery and prevents new work. */
  dispose(): void {
    this.#disposed = true
    this.#entries.clear()
    for (const load of this.#inflight.values()) load.controller.abort()
  }

  #store(directory: string, repository: Repository | undefined): void {
    this.#entries.delete(directory)
    this.#entries.set(directory, { at: this.options.now(), repository })
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
