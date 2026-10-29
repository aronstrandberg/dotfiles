import { execFile } from "node:child_process"
import type {
  Author,
  Check,
  ChecksState,
  IssueComment,
  MergeMethod,
  PrAction,
  PrDetail,
  PrFile,
  PrRef,
  PrSummary,
  Review,
  ReviewThread,
} from "./rpc.ts"
import { visibleMarkdown } from "./shared.ts"

export class GhError extends Error {
  constructor(
    message: string,
    readonly stdout = "",
  ) {
    super(message)
  }
}

export interface GhOptions {
  readonly gh: string
  readonly signal?: AbortSignal
}

export function gh(args: string[], options: GhOptions & { cwd?: string; stdin?: string }) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      options.gh,
      args,
      {
        cwd: options.cwd,
        maxBuffer: 256 * 1024 * 1024,
        timeout: 120_000,
        signal: options.signal,
        env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1", GH_NO_UPDATE_NOTIFIER: "1" },
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message).trim()
          reject(new GhError(detail || `gh ${args[0]} failed`, String(stdout)))
          return
        }
        resolve(stdout)
      },
    )
    if (options.stdin !== undefined) {
      child.stdin?.end(options.stdin)
    }
  })
}

async function graphql<T>(query: string, variables: Record<string, string | number>, options: GhOptions) {
  const args = ["api", "graphql", "-f", `query=${query}`]
  for (const [key, value] of Object.entries(variables)) {
    args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`)
  }
  const output = JSON.parse(await gh(args, options)) as { data?: T; errors?: { message: string }[] }
  if (!output.data) throw new GhError(output.errors?.map((error) => error.message).join("; ") ?? "GraphQL query failed")
  return output.data
}

const SUMMARY_FIELDS = `
  number title url state isDraft headRefName additions deletions reviewDecision isInMergeQueue
  author { login }
  autoMergeRequest { mergeMethod }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
`

interface RawSummary {
  number: number
  title: string
  url: string
  state: PrSummary["state"]
  isDraft: boolean
  headRefName: string
  additions: number
  deletions: number
  reviewDecision: PrSummary["reviewDecision"]
  isInMergeQueue: boolean
  author: { login: string } | null
  autoMergeRequest: { mergeMethod: string } | null
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] }
}

function rollupState(state: string | undefined | null): ChecksState {
  switch (state) {
    case "SUCCESS":
      return "success"
    case "FAILURE":
    case "ERROR":
      return "failure"
    case "PENDING":
    case "EXPECTED":
      return "pending"
    default:
      return "none"
  }
}

function toSummary(ref: PrRef, raw: RawSummary): PrSummary {
  return {
    owner: ref.owner,
    repo: ref.repo,
    number: raw.number,
    url: raw.url,
    title: raw.title,
    state: raw.state,
    isDraft: raw.isDraft,
    author: raw.author?.login ?? "ghost",
    headRefName: raw.headRefName,
    additions: raw.additions,
    deletions: raw.deletions,
    reviewDecision: raw.reviewDecision,
    checks: rollupState(raw.commits.nodes[0]?.commit.statusCheckRollup?.state),
    isInMergeQueue: raw.isInMergeQueue,
    autoMerge: raw.autoMergeRequest !== null,
  }
}

const NAME = /^[\w.-]+$/

/** Summaries for many PRs in one GraphQL round trip; PRs that do not exist or are inaccessible are left out. */
export async function summaries(refs: readonly PrRef[], options: GhOptions): Promise<PrSummary[]> {
  const valid = refs.filter((ref) => NAME.test(ref.owner) && NAME.test(ref.repo) && Number.isInteger(ref.number))
  if (valid.length === 0) return []
  const body = valid
    .map(
      (ref, index) =>
        `p${index}: repository(owner: "${ref.owner}", name: "${ref.repo}") { pullRequest(number: ${ref.number}) { ${SUMMARY_FIELDS} } }`,
    )
    .join("\n")
  const args = ["api", "graphql", "-f", `query=query { ${body} }`]
  // Partial errors (one PR missing) still return data for the rest.
  let output: { data?: Record<string, { pullRequest: RawSummary | null } | null> }
  try {
    output = JSON.parse(await gh(args, options))
  } catch (error) {
    if (error instanceof GhError && error.stdout.trim().startsWith("{")) output = JSON.parse(error.stdout)
    else throw error
  }
  return valid.flatMap((ref, index) => {
    const raw = output.data?.[`p${index}`]?.pullRequest
    return raw ? [toSummary(ref, raw)] : []
  })
}

export async function branchPr(directory: string, options: GhOptions): Promise<PrRef | undefined> {
  try {
    const out = JSON.parse(await gh(["pr", "view", "--json", "url,number"], { ...options, cwd: directory })) as {
      url: string
    }
    const match = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/.exec(out.url)
    if (!match) return undefined
    return { owner: match[1]!, repo: match[2]!, number: Number(match[3]) }
  } catch {
    return undefined
  }
}

const DETAIL_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed viewerDefaultMergeMethod viewerPermission
    pullRequest(number: $number) {
      ${SUMMARY_FIELDS}
      body baseRefName headRefOid changedFiles createdAt updatedAt mergedAt
      mergeable mergeStateStatus
      mergeQueueEntry { position }
      labels(first: 30) { nodes { name color } }
      reviewRequests(first: 30) { nodes { requestedReviewer { ... on User { login } ... on Team { name } ... on Bot { login } } } }
      latestOpinionatedReviews(first: 30) { nodes { author { login } state } }
      comments(last: 100) { nodes { author { __typename login } body createdAt url } }
      reviews(last: 100) { nodes { author { __typename login } body state submittedAt url } }
      reviewThreads(last: 100) {
        nodes {
          isResolved isOutdated path line originalLine
          comments(first: 50) { nodes { author { __typename login } body createdAt url diffHunk } }
        }
      }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              state
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun {
                    name status conclusion detailsUrl startedAt completedAt
                    checkSuite { workflowRun { workflow { name } } }
                  }
                  ... on StatusContext { context state targetUrl description createdAt }
                }
              }
            }
          }
        }
      }
    }
  }
}`

type RawAuthor = { __typename: string; login: string } | null

function author(raw: RawAuthor): Author {
  if (!raw) return { login: "ghost", bot: false }
  return { login: raw.login, bot: raw.__typename === "Bot" || raw.login.endsWith("[bot]") }
}

type RawContext =
  | {
      __typename: "CheckRun"
      name: string
      status: string
      conclusion: string | null
      detailsUrl: string | null
      startedAt: string | null
      completedAt: string | null
      checkSuite: { workflowRun: { workflow: { name: string } } | null } | null
    }
  | {
      __typename: "StatusContext"
      context: string
      state: string
      targetUrl: string | null
      description: string | null
      createdAt: string
    }

function toCheck(raw: RawContext): Check {
  if (raw.__typename === "StatusContext") {
    const state =
      raw.state === "SUCCESS"
        ? "success"
        : raw.state === "FAILURE" || raw.state === "ERROR"
          ? "failure"
          : "pending"
    return {
      name: raw.context,
      state,
      description: raw.description ?? undefined,
      url: raw.targetUrl ?? undefined,
      startedAt: raw.createdAt,
    }
  }
  const state: Check["state"] =
    raw.status !== "COMPLETED"
      ? "pending"
      : raw.conclusion === "SUCCESS"
        ? "success"
        : raw.conclusion === "SKIPPED"
          ? "skipped"
          : raw.conclusion === "NEUTRAL"
            ? "neutral"
            : "failure"
  return {
    name: raw.name,
    workflow: raw.checkSuite?.workflowRun?.workflow.name,
    state,
    description: raw.conclusion && state === "failure" ? raw.conclusion.toLowerCase().replace(/_/g, " ") : undefined,
    url: raw.detailsUrl ?? undefined,
    startedAt: raw.startedAt ?? undefined,
    completedAt: raw.completedAt ?? undefined,
  }
}

export async function detail(ref: PrRef, options: GhOptions): Promise<PrDetail> {
  const data = await graphql<{ repository: any }>(
    DETAIL_QUERY,
    { owner: ref.owner, name: ref.repo, number: ref.number },
    options,
  )
  const repo = data.repository
  const pr = repo?.pullRequest
  if (!pr) throw new GhError(`${ref.owner}/${ref.repo}#${ref.number} not found`)
  const summary = toSummary(ref, pr)
  const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup
  const methods: MergeMethod[] = [
    ...(repo.squashMergeAllowed ? (["squash"] as const) : []),
    ...(repo.mergeCommitAllowed ? (["merge"] as const) : []),
    ...(repo.rebaseMergeAllowed ? (["rebase"] as const) : []),
  ]
  const defaultMethod = String(repo.viewerDefaultMergeMethod ?? "SQUASH").toLowerCase() as MergeMethod
  const comment = (raw: any): IssueComment => ({
    author: author(raw.author),
    body: visibleMarkdown(raw.body ?? ""),
    createdAt: raw.createdAt,
    url: raw.url,
  })
  const queue = await mergeQueueEnabled(ref, pr.baseRefName, options).catch(() => false)
  return {
    ...summary,
    body: visibleMarkdown(pr.body ?? ""),
    baseRefName: pr.baseRefName,
    headRefOid: pr.headRefOid,
    changedFiles: pr.changedFiles,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    mergedAt: pr.mergedAt,
    mergeable: pr.mergeable,
    mergeStateStatus: pr.mergeStateStatus,
    mergeQueue: queue,
    mergeQueuePosition: pr.mergeQueueEntry?.position ?? null,
    autoMergeMethod: pr.autoMergeRequest?.mergeMethod ?? null,
    labels: pr.labels.nodes,
    reviewRequests: pr.reviewRequests.nodes
      .map((node: any) => node.requestedReviewer?.login ?? node.requestedReviewer?.name)
      .filter(Boolean),
    latestReviews: pr.latestOpinionatedReviews.nodes.map((node: any) => ({
      author: node.author?.login ?? "ghost",
      state: node.state,
    })),
    checkList: (rollup?.contexts.nodes ?? []).filter((node: any) => node?.__typename).map(toCheck),
    comments: pr.comments.nodes.map(comment),
    reviews: pr.reviews.nodes.map(
      (raw: any): Review => ({
        author: author(raw.author),
        body: visibleMarkdown(raw.body ?? ""),
        state: raw.state,
        submittedAt: raw.submittedAt,
        url: raw.url,
      }),
    ),
    threads: pr.reviewThreads.nodes.map(
      (raw: any): ReviewThread => ({
        path: raw.path,
        line: raw.line ?? raw.originalLine ?? null,
        isResolved: raw.isResolved,
        isOutdated: raw.isOutdated,
        diffHunk: raw.comments.nodes[0]?.diffHunk ?? "",
        comments: raw.comments.nodes.map(comment),
      }),
    ),
    mergeMethods: methods.length > 0 ? methods : ["merge"],
    defaultMergeMethod: methods.includes(defaultMethod) ? defaultMethod : (methods[0] ?? "merge"),
    viewerPermission: repo.viewerPermission ?? null,
  }
}

async function mergeQueueEnabled(ref: PrRef, base: string, options: GhOptions) {
  const data = await graphql<{ repository: { mergeQueue: { id: string } | null } }>(
    `query($owner: String!, $name: String!, $branch: String!) { repository(owner: $owner, name: $name) { mergeQueue(branch: $branch) { id } } }`,
    { owner: ref.owner, name: ref.repo, branch: base },
    options,
  )
  return data.repository.mergeQueue !== null
}

/** Total patch bytes sent to a client; later files keep their stats but lose the patch. */
const PATCH_BUDGET = 8 * 1024 * 1024

export async function files(ref: PrRef, options: GhOptions) {
  const out = await gh(
    ["api", "--paginate", "--slurp", `repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100`],
    options,
  )
  const pages = JSON.parse(out) as any[][]
  let budget = PATCH_BUDGET
  let truncated = false
  const list: PrFile[] = pages.flat().map((raw) => {
    const patch: string | undefined = raw.patch
    const fits = patch !== undefined && patch.length <= budget
    if (fits) budget -= patch.length
    else if (patch !== undefined) truncated = true
    return {
      filename: raw.filename,
      previousFilename: raw.previous_filename,
      status: raw.status,
      additions: raw.additions,
      deletions: raw.deletions,
      patch: fits ? patch : undefined,
    }
  })
  return { files: list, truncated }
}

export async function act(ref: PrRef, action: PrAction, options: GhOptions): Promise<{ message: string }> {
  const target = [String(ref.number), "--repo", `${ref.owner}/${ref.repo}`]
  switch (action.type) {
    case "merge": {
      const args = ["pr", "merge", ...target]
      if (action.method) args.push(`--${action.method}`)
      if (action.auto) args.push("--auto")
      if (action.admin) args.push("--admin")
      const out = await gh(args, options)
      return { message: out.trim() || (action.auto ? "Auto-merge enabled" : "Merge requested") }
    }
    case "disable-auto":
      await gh(["pr", "merge", ...target, "--disable-auto"], options)
      return { message: "Auto-merge disabled" }
    case "ready":
      await gh(["pr", "ready", ...target], options)
      return { message: "Marked ready for review" }
    case "draft":
      await gh(["pr", "ready", ...target, "--undo"], options)
      return { message: "Converted to draft" }
    case "comment":
      await gh(["pr", "comment", ...target, "--body-file", "-"], { ...options, stdin: action.body })
      return { message: "Comment posted" }
    case "approve":
      await gh(["pr", "review", ...target, "--approve", "--body-file", "-"], { ...options, stdin: action.body ?? "" })
      return { message: "Approved" }
    case "request-changes":
      await gh(["pr", "review", ...target, "--request-changes", "--body-file", "-"], {
        ...options,
        stdin: action.body,
      })
      return { message: "Changes requested" }
  }
}
