import { createSignal, ErrorBoundary } from "solid-js"
import { render } from "solid-js/web"
import type { CodeBlockProps } from "@opencode/plugin/gui"
import { PrList } from "../src/gui/pr-list.tsx"
import { RunCardBlock } from "../src/gui/run-card-view.tsx"
import { css } from "../src/gui/styles.ts"
import type { App } from "../src/gui/state.ts"
import type { RunSummary } from "../src/run.ts"
import { prKey } from "../src/shared.ts"
import type { PrSummary } from "../src/rpc.ts"
import type { TrackedPr } from "../src/work-status.ts"

const first: PrSummary = {
  owner: "lovablelabs",
  repo: "lovable",
  number: 456,
  title: "Fix collector rollout",
  url: "https://github.com/lovablelabs/lovable/pull/456",
  state: "OPEN",
  isDraft: false,
  author: "aronstrandberg",
  headRefName: "collector",
  additions: 10,
  deletions: 3,
  reviewDecision: "APPROVED",
  checks: "failure",
  isInMergeQueue: false,
  autoMerge: false,
  checkCounts: { success: 150, failure: 2, pending: 3, skipped: 3, neutral: 0, unknown: 0 },
  ci: { kind: "red", count: 2, names: ["lint-go", "test-web"], running: 3 },
}
const prs: PrSummary[] = [
  first,
  {
    ...first,
    number: 457,
    title: "Update alert routing",
    checks: "success",
    checkCounts: { success: 12, failure: 0, pending: 0, skipped: 1, neutral: 0, unknown: 0 },
    ci: { kind: "green" },
  },
  { ...first, number: 999, title: "Unrelated PR mentioned in chat" },
  {
    ...first,
    number: 460,
    title: "Teammate's base PR",
    author: "mikn",
    state: "MERGED",
    checks: "failure",
    checkCounts: { success: 15, failure: 1, pending: 0, skipped: 0, neutral: 0, unknown: 0 },
    ci: { kind: "red", count: 1, names: ["leftover-from-merge"], running: 0 },
  },
  {
    ...first,
    number: 461,
    title: "Roll the canary to the next pool",
    checks: "pending",
    checkCounts: { success: 15, failure: 0, pending: 5, skipped: 0, neutral: 0, unknown: 0 },
    ci: { kind: "running", count: 5, names: ["bazel-test", "e2e", "deploy-preview", "lint", "types"] },
  },
]
const tracked: TrackedPr[] = [
  {
    owner: "lovablelabs",
    repo: "lovable",
    number: 456,
    state: "agent-working",
    note: "Fixing the failed lint checks",
    updatedAt: Date.now(),
  },
  {
    owner: "lovablelabs",
    repo: "lovable",
    number: 457,
    state: "waiting-user",
    note: "Approve the production change",
    updatedAt: Date.now(),
  },
  {
    owner: "lovablelabs",
    repo: "lovable",
    number: 458,
    state: "blocked",
    note: "Waiting for the base PR",
    updatedAt: Date.now(),
  },
  {
    owner: "lovablelabs",
    repo: "lovable",
    number: 460,
    state: "blocked",
    note: "Mikael owns this; our PR needs it merged first",
    updatedAt: Date.now(),
  },
  {
    owner: "lovablelabs",
    repo: "lovable",
    number: 461,
    state: "waiting-ci",
    note: "Waiting for the canary checks",
    updatedAt: Date.now(),
  },
]

function PrListFixture() {
  const [opened, setOpened] = createSignal("")
  return (
    <>
      <style>{css}</style>
      <style>{`body { margin: 0; background: #17191e; color: #e7e8eb; font-family: system-ui; color-scheme: dark; } .ghp { height: 100dvh; } .ghp-scroll { min-width: 0; }`}</style>
      <div class="ghp">
        <div class="ghp-list-head">Pull requests · Registered by this session</div>
        <div class="ghp-scroll">
          <PrList
            tracked={tracked}
            prs={prs}
            onOpen={(ref, page) => setOpened(`${prKey(ref)}:${page ?? "overview"}`)}
          />
        </div>
        <div role="status">{opened()}</div>
      </div>
    </>
  )
}

const run: RunSummary = {
  owner: "lovablelabs",
  repo: "lovable",
  runID: 12_345,
  url: "https://github.com/lovablelabs/lovable/actions/runs/12345",
  workflow: "CI",
  runNumber: 87,
  attempt: 2,
  branch: "feat/run-cards",
  headSha: "0123456789abcdef0123456789abcdef01234567",
  event: "pull_request",
  state: { status: "completed", conclusion: "success" },
  createdAt: "2026-11-16T10:00:00Z",
  startedAt: "2026-11-16T10:00:05Z",
  updatedAt: "2026-11-16T10:02:10Z",
}

function RunCardFixture(props: { readonly mode: "loading" | "success" | "error" }) {
  const [opened, setOpened] = createSignal("")
  const client = {
    rpc: () => ({
      resolveRun: async (_input: unknown, options?: { readonly signal?: AbortSignal }) => {
        if (props.mode === "error") throw new Error("GitHub unavailable")
        if (props.mode === "loading") {
          return await new Promise<never>((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true })
          })
        }
        return run
      },
    }),
  }
  const app = {
    ctx: {
      client,
      system: { openExternal: (url: string) => setOpened(url) },
      ui: { Icon: () => <span aria-hidden="true">GH</span> },
    },
  } as unknown as App
  const block = {
    code: run.url,
    language: "gh-run",
    session: {
      key: "local\nsession-1",
      id: "session-1",
      directory: "/workspace",
      server: { client },
    },
  } as unknown as CodeBlockProps

  return (
    <>
      <style>{css}</style>
      <ErrorBoundary
        fallback={(error) => (
          <pre data-host-fallback="true">
            {run.url}
            {"\n"}
            {error instanceof Error ? error.message : "Unknown error"}
          </pre>
        )}
      >
        <RunCardBlock app={app} block={block} />
      </ErrorBoundary>
      <div role="status">{opened()}</div>
    </>
  )
}

function Fixture() {
  const fixture = new URLSearchParams(location.search).get("fixture")
  if (fixture === "run-loading") return <RunCardFixture mode="loading" />
  if (fixture === "run-success") return <RunCardFixture mode="success" />
  if (fixture === "run-error") return <RunCardFixture mode="error" />
  return <PrListFixture />
}

const root = document.getElementById("root")
if (root) render(() => <Fixture />, root)
