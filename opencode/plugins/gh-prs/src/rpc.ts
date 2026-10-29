import { Rpc } from "@opencode/plugin/rpc"

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
  readonly additions: number
  readonly deletions: number
  readonly reviewDecision: ReviewDecision
  readonly checks: ChecksState
  readonly isInMergeQueue: boolean
  readonly autoMerge: boolean
  /** The PR of the session directory's current branch, not one the transcript links. */
  readonly branch?: boolean
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
  readonly mergeQueue: boolean
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
  | { readonly type: "merge"; readonly method?: MergeMethod; readonly auto?: boolean; readonly admin?: boolean }
  | { readonly type: "disable-auto" }
  | { readonly type: "ready" }
  | { readonly type: "draft" }
  | { readonly type: "comment"; readonly body: string }
  | { readonly type: "approve"; readonly body?: string }
  | { readonly type: "request-changes"; readonly body: string }

const ref = {
  owner: { type: "string" },
  repo: { type: "string" },
  number: { type: "integer", minimum: 1 },
} as const

const any = {} as const
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
      output: any,
      errors,
    },
    detail: {
      input: { type: "object", properties: ref, required: ["owner", "repo", "number"] },
      output: any,
      errors,
    },
    files: {
      input: { type: "object", properties: ref, required: ["owner", "repo", "number"] },
      output: any,
      errors,
    },
    act: {
      input: {
        type: "object",
        properties: { ...ref, action: { type: "object", properties: { type: { type: "string" } }, required: ["type"] } },
        required: ["owner", "repo", "number", "action"],
      },
      output: any,
      errors,
    },
  },
  events: {},
})

/** Typed calls over an OpenCode client's subclient for {@link GhPrs}. */
export function api(client: { rpc(definition: typeof GhPrs): unknown }) {
  const rpc = client.rpc(GhPrs) as Record<keyof typeof GhPrs.methods, (input: unknown) => Promise<unknown>>
  return {
    mentioned: (input: { sessionID: string; directory?: string; fresh?: boolean }) =>
      rpc.mentioned(input) as Promise<{ prs: PrSummary[]; error?: string }>,
    detail: (input: PrRef) => rpc.detail(pick(input)) as Promise<PrDetail>,
    files: (input: PrRef) => rpc.files(pick(input)) as Promise<{ files: PrFile[]; truncated: boolean }>,
    act: (input: PrRef, action: PrAction) => rpc.act({ ...pick(input), action }) as Promise<{ message: string }>,
  }
}

function pick(input: PrRef): PrRef {
  return { owner: input.owner, repo: input.repo, number: input.number }
}
