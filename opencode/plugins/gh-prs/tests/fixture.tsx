import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { PrTable } from "../src/gui/pr-table.tsx"
import { css } from "../src/gui/styles.ts"
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

function Fixture() {
  const [opened, setOpened] = createSignal("")
  return (
    <>
      <style>{css}</style>
      <style>{`body { margin: 0; background: #17191e; color: #e7e8eb; font-family: system-ui; color-scheme: dark; } .ghp { height: 100dvh; } .ghp-scroll { min-width: 0; }`}</style>
      <div class="ghp">
        <div class="ghp-list-head">Pull requests · Registered by this session</div>
        <div class="ghp-scroll">
          <PrTable
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

const root = document.getElementById("root")
if (root) render(() => <Fixture />, root)
