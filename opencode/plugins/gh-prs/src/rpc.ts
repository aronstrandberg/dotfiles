import { Rpc } from "@opencode/plugin/rpc"
import { parseCiCounts, parseCiStatus, type CiCounts, type CiStatus } from "./ci.ts"
import { parseTrackedPr } from "./work-status.ts"

export interface PrRef {
  readonly owner: string
  readonly repo: string
  readonly number: number
}

export type PrState = "OPEN" | "CLOSED" | "MERGED"
export type ChecksState = "success" | "failure" | "pending" | "none"
export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null

export interface PrSummary extends PrRef {
  readonly url: string
  readonly title: string
  readonly state: PrState
  readonly isDraft: boolean
  readonly author: string
  readonly headRefName: string
  /** Missing from servers that predate stack graphs. */
  readonly baseRefName?: string
  readonly additions: number
  readonly deletions: number
  readonly reviewDecision: ReviewDecision
  readonly checks: ChecksState
  readonly checkCounts?: CiCounts
  readonly ci?: CiStatus
  readonly isInMergeQueue: boolean
  readonly autoMerge: boolean
  /** The PR of the session directory's current branch, not one the transcript links. */
  readonly branch?: boolean
}

/** Parses nullable pull-request summary output received across the RPC boundary. */
export function parsePrSummary(value: unknown): PrSummary | null {
  if (value === null) return null
  if (typeof value !== "object") throw new TypeError("Invalid pull request summary RPC output")
  const field = (name: string) => Reflect.get(value, name)
  const text = (name: string) => {
    const result = field(name)
    if (typeof result !== "string") throw new TypeError(`Invalid pull request summary field: ${name}`)
    return result
  }
  const integer = (name: string, minimum: number) => {
    const result = field(name)
    if (typeof result !== "number" || !Number.isInteger(result) || result < minimum) {
      throw new TypeError(`Invalid pull request summary field: ${name}`)
    }
    return result
  }
  const boolean = (name: string) => {
    const result = field(name)
    if (typeof result !== "boolean") throw new TypeError(`Invalid pull request summary field: ${name}`)
    return result
  }
  const state = field("state")
  if (state !== "OPEN" && state !== "CLOSED" && state !== "MERGED") {
    throw new TypeError("Invalid pull request summary field: state")
  }
  const reviewDecision = field("reviewDecision")
  if (
    reviewDecision !== null &&
    reviewDecision !== "APPROVED" &&
    reviewDecision !== "CHANGES_REQUESTED" &&
    reviewDecision !== "REVIEW_REQUIRED"
  ) {
    throw new TypeError("Invalid pull request summary field: reviewDecision")
  }
  const checks = field("checks")
  if (checks !== "success" && checks !== "failure" && checks !== "pending" && checks !== "none") {
    throw new TypeError("Invalid pull request summary field: checks")
  }
  const branch = field("branch")
  if (branch !== undefined && typeof branch !== "boolean") {
    throw new TypeError("Invalid pull request summary field: branch")
  }
  return {
    owner: text("owner"),
    repo: text("repo"),
    number: integer("number", 1),
    url: text("url"),
    title: text("title"),
    state,
    isDraft: boolean("isDraft"),
    author: text("author"),
    headRefName: text("headRefName"),
    ...(field("baseRefName") === undefined ? {} : { baseRefName: text("baseRefName") }),
    additions: integer("additions", 0),
    deletions: integer("deletions", 0),
    reviewDecision,
    checks,
    ...(field("checkCounts") === undefined ? {} : { checkCounts: parseCiCounts(field("checkCounts")) }),
    ...(field("ci") === undefined ? {} : { ci: parseCiStatus(field("ci")) }),
    isInMergeQueue: boolean("isInMergeQueue"),
    autoMerge: boolean("autoMerge"),
    ...(branch === undefined ? {} : { branch }),
  }
}

export interface Check {
  readonly name: string
  readonly workflow?: string
  /** Normalized outcome. */
  readonly state: "success" | "failure" | "pending" | "skipped" | "neutral"
  readonly description?: string
  readonly url?: string
  readonly startedAt?: string
  readonly completedAt?: string
}

export interface Author {
  readonly login: string
  readonly bot: boolean
}

export interface IssueComment {
  readonly author: Author
  readonly body: string
  readonly createdAt: string
  readonly url: string
}

export interface Review {
  readonly author: Author
  readonly body: string
  readonly state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING"
  readonly submittedAt: string
  readonly url: string
}

export interface ReviewThread {
  readonly path: string
  readonly line: number | null
  readonly isResolved: boolean
  readonly isOutdated: boolean
  readonly diffHunk: string
  readonly comments: readonly IssueComment[]
}

export type MergeMethod = "squash" | "merge" | "rebase"

export interface PrDetail extends PrSummary {
  readonly body: string
  readonly baseRefName: string
  readonly headRefOid: string
  readonly changedFiles: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly mergedAt: string | null
  readonly mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN"
  readonly mergeStateStatus: string
  /** Whether the base branch requires a merge queue; `null` when GitHub could not say. */
  readonly mergeQueue: boolean | null
  readonly mergeQueuePosition: number | null
  readonly autoMergeMethod: string | null
  readonly labels: readonly { name: string; color: string }[]
  readonly reviewRequests: readonly string[]
  readonly latestReviews: readonly { author: string; state: Review["state"] }[]
  readonly checkList: readonly Check[]
  readonly comments: readonly IssueComment[]
  readonly reviews: readonly Review[]
  readonly threads: readonly ReviewThread[]
  readonly mergeMethods: readonly MergeMethod[]
  readonly defaultMergeMethod: MergeMethod
  readonly viewerPermission: string | null
  /** The `gh` account the server acts as. */
  readonly viewerLogin: string
  /** The GitHub stack this PR belongs to, members bottom first; `null` for a standalone PR or a repo without stacks. */
  readonly stack: PrStack | null
}

export interface PrStack {
  readonly number: number
  /** The branch the whole stack targets. */
  readonly base: string
  readonly members: readonly {
    readonly number: number
    readonly state: "open" | "merged" | "closed"
    readonly draft: boolean
  }[]
}

export interface PrFile {
  readonly filename: string
  readonly previousFilename?: string
  readonly status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged"
  readonly additions: number
  readonly deletions: number
  /** Missing for binary files, very large files, and once the response size budget is spent. */
  readonly patch?: string
}

export type PrAction =
  | { readonly type: "merge"; readonly method?: MergeMethod; readonly auto?: boolean }
  | { readonly type: "merge-stack"; readonly method: MergeMethod }
  | { readonly type: "disable-auto" }
  | { readonly type: "ready" }
  | { readonly type: "draft" }
  | { readonly type: "comment"; readonly body: string }
  | { readonly type: "approve"; readonly body?: string }
  | { readonly type: "request-changes"; readonly body: string }

const METHODS: readonly MergeMethod[] = ["squash", "merge", "rebase"]

/**
 * Parses an action a client asks the server to run with `gh`.
 *
 * Only known fields of known types pass, so no input becomes a `gh` flag the plugin did not choose.
 *
 * @throws TypeError for any other shape.
 */
export function parsePrAction(value: unknown): PrAction {
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid pull request action")
  const field = (name: string): unknown => Reflect.get(value, name)
  const keys = (...allowed: string[]) => {
    const extra = Object.keys(value).filter((key) => key !== "type" && !allowed.includes(key))
    if (extra.length > 0) throw new TypeError(`Unexpected pull request action fields: ${extra.join(", ")}`)
  }
  const method = (required: boolean): MergeMethod | undefined => {
    const result = field("method")
    if (result === undefined && !required) return undefined
    const match = METHODS.find((candidate) => candidate === result)
    if (!match) throw new TypeError("Invalid merge method")
    return match
  }
  const text = (name: string, required: boolean) => {
    const result = field(name)
    if (result === undefined && !required) return undefined
    if (typeof result !== "string") throw new TypeError(`Invalid pull request action field: ${name}`)
    return result
  }
  const type = field("type")
  switch (type) {
    case "merge": {
      keys("method", "auto")
      const auto = field("auto")
      if (auto !== undefined && typeof auto !== "boolean")
        throw new TypeError("Invalid pull request action field: auto")
      const chosen = method(false)
      return { type: "merge", ...(chosen ? { method: chosen } : {}), ...(auto === undefined ? {} : { auto }) }
    }
    case "merge-stack": {
      keys("method")
      const chosen = method(true)
      if (!chosen) throw new TypeError("Invalid merge method")
      return { type: "merge-stack", method: chosen }
    }
    case "disable-auto":
    case "ready":
    case "draft": {
      keys()
      return { type }
    }
    case "comment":
    case "request-changes": {
      keys("body")
      return { type, body: text("body", true) ?? "" }
    }
    case "approve": {
      keys("body")
      const body = text("body", false)
      return body === undefined ? { type: "approve" } : { type: "approve", body }
    }
    default:
      throw new TypeError("Unknown pull request action")
  }
}

const ref = {
  owner: { type: "string" },
  repo: { type: "string" },
  number: { type: "integer", minimum: 1 },
} as const

const unknownOutput = {} as const
const prSummary = {
  type: "object",
  properties: {
    ...ref,
    url: { type: "string" },
    title: { type: "string" },
    state: { type: "string", enum: ["OPEN", "CLOSED", "MERGED"] },
    isDraft: { type: "boolean" },
    author: { type: "string" },
    headRefName: { type: "string" },
    baseRefName: { type: "string" },
    additions: { type: "integer", minimum: 0 },
    deletions: { type: "integer", minimum: 0 },
    reviewDecision: {
      anyOf: [{ type: "string", enum: ["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"] }, { type: "null" }],
    },
    checks: { type: "string", enum: ["success", "failure", "pending", "none"] },
    checkCounts: {
      type: "object",
      properties: {
        success: { type: "integer", minimum: 0 },
        failure: { type: "integer", minimum: 0 },
        pending: { type: "integer", minimum: 0 },
        skipped: { type: "integer", minimum: 0 },
        neutral: { type: "integer", minimum: 0 },
        unknown: { type: "integer", minimum: 0 },
      },
      required: ["success", "failure", "pending", "skipped", "neutral", "unknown"],
      additionalProperties: false,
    },
    ci: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["none", "green", "red", "running", "unknown"] },
        count: { type: "integer", minimum: 0 },
        names: { type: "array", items: { type: "string" } },
        running: { type: "integer", minimum: 0 },
      },
      required: ["kind"],
      additionalProperties: false,
    },
    isInMergeQueue: { type: "boolean" },
    autoMerge: { type: "boolean" },
    branch: { type: "boolean" },
  },
  required: [
    "owner",
    "repo",
    "number",
    "url",
    "title",
    "state",
    "isDraft",
    "author",
    "headRefName",
    "additions",
    "deletions",
    "reviewDecision",
    "checks",
    "isInMergeQueue",
    "autoMerge",
  ],
  additionalProperties: false,
} as const
const nullablePrSummary = { anyOf: [prSummary, { type: "null" }] } as const
const cardLeaseInput = {
  type: "object",
  properties: {
    sessionID: { type: "string", minLength: 1 },
    token: { type: "string", minLength: 1, maxLength: 128 },
  },
  required: ["sessionID", "token"],
  additionalProperties: false,
} as const
const errors = { gh: { type: "object", properties: { message: { type: "string" } } } } as const

export const GhPrs = Rpc.define({
  id: "ghprs",
  methods: {
    mentioned: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" }, directory: { type: "string" }, fresh: { type: "boolean" } },
        required: ["sessionID"],
      },
      output: unknownOutput,
      errors,
    },
    detail: {
      input: { type: "object", properties: ref, required: ["owner", "repo", "number"] },
      output: unknownOutput,
      errors,
    },
    resolve: {
      input: {
        type: "object",
        properties: { reference: { type: "string" }, directory: { type: "string" } },
        required: ["reference"],
        additionalProperties: false,
      },
      output: nullablePrSummary,
      errors,
    },
    cardLease: {
      input: cardLeaseInput,
      output: {
        type: "object",
        properties: { expiresAt: { type: "integer", minimum: 0 } },
        required: ["expiresAt"],
        additionalProperties: false,
      },
    },
    cardRelease: {
      input: cardLeaseInput,
      output: {
        type: "object",
        properties: { released: { type: "boolean" } },
        required: ["released"],
        additionalProperties: false,
      },
    },
    files: {
      input: { type: "object", properties: ref, required: ["owner", "repo", "number"] },
      output: unknownOutput,
      errors,
    },
    act: {
      input: {
        type: "object",
        properties: {
          ...ref,
          action: { type: "object", properties: { type: { type: "string" } }, required: ["type"] },
        },
        required: ["owner", "repo", "number", "action"],
      },
      output: unknownOutput,
      errors,
    },
  },
  events: {},
})

/** Typed calls over an OpenCode client's subclient for {@link GhPrs}. */
export function api(client: { rpc(definition: typeof GhPrs): unknown }) {
  const rpc = client.rpc(GhPrs) as Record<
    keyof typeof GhPrs.methods,
    (input: unknown, options?: { readonly signal?: AbortSignal }) => Promise<unknown>
  >
  return {
    mentioned: async (input: { sessionID: string; directory?: string; fresh?: boolean }) => {
      const value = await rpc.mentioned(input)
      if (typeof value !== "object" || value === null) throw new TypeError("Invalid PR tracker response")
      const prs: unknown = Reflect.get(value, "prs")
      const tracked: unknown = Reflect.get(value, "tracked")
      const error: unknown = Reflect.get(value, "error")
      if (!Array.isArray(prs) || !Array.isArray(tracked))
        throw new TypeError("Update the gh-prs plugin on this session's server to use the PR tracker")
      if (error !== undefined && typeof error !== "string") throw new TypeError("Invalid PR tracker error")
      return {
        prs: prs.flatMap((pr) => {
          const parsed = parsePrSummary(pr)
          return parsed ? [parsed] : []
        }),
        tracked: tracked.map(parseTrackedPr),
        error,
      }
    },
    resolve: async (input: { reference: string; directory?: string }, signal?: AbortSignal) =>
      parsePrSummary(await rpc.resolve(input, { signal })),
    cardLease: async (input: { sessionID: string; token: string }, signal?: AbortSignal) =>
      parseCardLease(await rpc.cardLease(input, { signal })),
    cardRelease: async (input: { sessionID: string; token: string }) => parseCardRelease(await rpc.cardRelease(input)),
    detail: (input: PrRef) => rpc.detail(pick(input)) as Promise<PrDetail>,
    files: (input: PrRef) => rpc.files(pick(input)) as Promise<{ files: PrFile[]; truncated: boolean }>,
    act: (input: PrRef, action: PrAction) => rpc.act({ ...pick(input), action }) as Promise<{ message: string }>,
  }
}

function parseCardLease(value: unknown): { readonly expiresAt: number } {
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid PR card capability lease output")
  const expiresAt = Reflect.get(value, "expiresAt")
  if (typeof expiresAt !== "number" || !Number.isInteger(expiresAt) || expiresAt < 0) {
    throw new TypeError("Invalid PR card capability lease output")
  }
  return { expiresAt }
}

function parseCardRelease(value: unknown): { readonly released: boolean } {
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid PR card capability release output")
  const released = Reflect.get(value, "released")
  if (typeof released !== "boolean") throw new TypeError("Invalid PR card capability release output")
  return { released }
}

function pick(input: PrRef): PrRef {
  return { owner: input.owner, repo: input.repo, number: input.number }
}
