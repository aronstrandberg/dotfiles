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
}
const prs: PrSummary[] = [
  first,
  {
    ...first,
    number: 457,
    title: "Update alert routing",
    checks: "success",
    checkCounts: { success: 12, failure: 0, pending: 0, skipped: 1, neutral: 0, unknown: 0 },
  },
  { ...first, number: 999, title: "Unrelated PR mentioned in chat" },
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
