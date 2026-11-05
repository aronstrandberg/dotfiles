import type { PrSummary } from "../rpc.ts"
import { stateLabel } from "../shared.ts"

/** Complete asynchronous states of one PR card lookup. */
export type PrCardState =
  | { readonly status: "loading" }
  | { readonly status: "resolved"; readonly pr: PrSummary }
  | { readonly status: "failed" }

/** Visible renderer outcomes, including fallback to the host code block. */
export type PrCardProjection =
  | { readonly type: "loading"; readonly label: string }
  | { readonly type: "card"; readonly number: string; readonly title: string; readonly repository: string; readonly state: string; readonly checks: string }
  | { readonly type: "fallback" }

function checksLabel(checks: PrSummary["checks"]): string {
  switch (checks) {
    case "success":
      return "Checks passing"
    case "failure":
      return "Checks failing"
    case "pending":
      return "Checks running"
    case "none":
      return "No checks"
  }
}

/** Projects asynchronous PR lookup state into the compact card's visible content. */
export function prCardProjection(state: PrCardState): PrCardProjection {
  if (state.status === "loading") return { type: "loading", label: "Loading pull request…" }
  if (state.status === "resolved") {
    const pr = state.pr
    return {
      type: "card",
      number: `#${pr.number}`,
      title: pr.title,
      repository: `${pr.owner}/${pr.repo}`,
      state: stateLabel(pr),
      checks: checksLabel(pr.checks),
    }
  }
  return { type: "fallback" }
}
