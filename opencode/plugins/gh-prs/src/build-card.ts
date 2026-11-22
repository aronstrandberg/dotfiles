/** A Buildkite build identity parsed from its browser address. */
export interface BuildRef {
  readonly organization: string
  readonly pipeline: string
  readonly number: number
}

/** Strict RPC request for resolving one canonical Buildkite build reference. */
export interface BuildCardRequest {
  readonly reference: string
}

/** Parses the complete source of one `bk-build` fence. */
export function parseBuildCardPayload(payload: string): BuildRef | undefined {
  const match = /^https:\/\/buildkite\.com\/([\w.-]+)\/([\w.-]+)\/builds\/([1-9]\d*)(?:#[^\s#]+)?$/.exec(payload.trim())
  if (!match) return undefined
  const number = Number(match[3])
  if (!Number.isSafeInteger(number)) return undefined
  return { organization: match[1]!, pipeline: match[2]!, number }
}

/** Returns the canonical browser address and cache key for one build. */
export function buildAddress(ref: BuildRef): string {
  return `https://buildkite.com/${ref.organization}/${ref.pipeline}/builds/${ref.number}`
}

/** Parses untrusted RPC input without accepting fields outside the build-card contract. */
export function parseBuildCardRequest(value: unknown): BuildCardRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.keys(value).some((key) => key !== "reference") ||
    typeof Reflect.get(value, "reference") !== "string"
  ) {
    throw new TypeError("Invalid Buildkite build card request")
  }
  return { reference: Reflect.get(value, "reference") }
}
