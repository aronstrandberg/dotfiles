import { parseBuild, type BuildSummary } from "./build.ts"
import { buildAddress, type BuildRef } from "./build-card.ts"

/** Safe client-facing text for every expected Ratchet lookup failure. */
export const RATCHET_UNAVAILABLE_MESSAGE = "Buildkite build details are unavailable"

/** Expected Ratchet failures with a stable RPC-safe discriminant. */
export class RatchetError extends Error {
  readonly _tag = "RatchetError"

  constructor(message = RATCHET_UNAVAILABLE_MESSAGE) {
    super(message)
    this.name = "RatchetError"
  }
}

/** Parses the plugin's Ratchet option once at setup. */
export function parseRatchetBaseUrl(value: unknown): string {
  if (value === undefined) return "http://127.0.0.1:9876"
  if (typeof value !== "string") throw new TypeError("Invalid Ratchet URL")
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError("Invalid Ratchet URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError("Invalid Ratchet URL")
  if (url.username || url.password || url.search || url.hash) throw new TypeError("Invalid Ratchet URL")
  return url.toString().replace(/\/$/, "")
}

/** Runtime dependencies for the server-side Ratchet client. */
export interface RatchetBuildClientOptions {
  readonly baseUrl: string
  readonly timeout: number
}

/** Probes for the documented build route without sending a build address. */
export async function probeRatchetBuildRoute(
  options: RatchetBuildClientOptions,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) throw signal.reason
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Ratchet probe timed out", "TimeoutError")),
    options.timeout,
  )
  const cancelled = () => controller.abort(signal.reason)
  signal.addEventListener("abort", cancelled, { once: true })
  try {
    const response = await fetch(`${options.baseUrl}/builds`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    })
    if (response.status !== 400) return false
    const body: unknown = await response.json()
    return (
      typeof body === "object" &&
      body !== null &&
      Object.keys(body).length === 1 &&
      typeof Reflect.get(body, "error") === "string"
    )
  } catch {
    if (signal.aborted) throw signal.reason
    return false
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", cancelled)
  }
}

/** Loads and parses read-only Buildkite build data through Ratchet. */
export class RatchetBuildClient {
  constructor(private readonly options: RatchetBuildClientOptions) {}

  /** Resolves one build while preserving cancellation owned by the caller. */
  async build(ref: BuildRef, signal: AbortSignal): Promise<BuildSummary> {
    if (signal.aborted) throw signal.reason
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Ratchet request timed out", "TimeoutError")),
      this.options.timeout,
    )
    const cancelled = () => controller.abort(signal.reason)
    signal.addEventListener("abort", cancelled, { once: true })
    try {
      const url = new URL(`${this.options.baseUrl}/builds`)
      url.searchParams.set("url", buildAddress(ref))
      const response = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal })
      if (response.status !== 200) throw new RatchetError()
      return parseBuild(ref, await response.json())
    } catch (error) {
      if (signal.aborted) throw signal.reason
      if (error instanceof RatchetError) throw error
      throw new RatchetError()
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener("abort", cancelled)
    }
  }
}
