import type { PrSummary } from "./rpc.ts"
import { prKey } from "./shared.ts"
import type { TrackedPr } from "./work-status.ts"

/** Group order, most urgent first. Merged and closed PRs always land in `done`. */
const ORDER = ["waiting-user", "blocked", "agent-working", "waiting-ci", "unassigned", "ready", "done"] as const

export type GroupId = (typeof ORDER)[number]

export const groupLabels: Record<GroupId, string> = {
  "waiting-user": "Needs you",
  blocked: "Blocked",
  "agent-working": "Agent working",
  "waiting-ci": "Waiting for CI",
  unassigned: "Not reported",
  ready: "Ready",
  done: "Done",
}

export type TrackedItem = { readonly tracked: TrackedPr; readonly pr: PrSummary | undefined }

export type PrGroup = { readonly id: GroupId; readonly items: readonly TrackedItem[]; readonly collapsed: boolean }

/**
 * Groups registered PRs by what they need, most urgent first, and omits empty groups.
 *
 * A PR GitHub reports as merged or closed goes to Done, which starts collapsed, whatever its last reported status.
 */
export function groupTracked(tracked: readonly TrackedPr[], prs: readonly PrSummary[]): readonly PrGroup[] {
  const byKey = new Map(prs.map((pr) => [prKey(pr), pr]))
  const buckets = new Map<GroupId, TrackedItem[]>()
  for (const entry of tracked) {
    const pr = byKey.get(prKey(entry))
    const id: GroupId = pr && pr.state !== "OPEN" ? "done" : entry.state
    buckets.set(id, [...(buckets.get(id) ?? []), { tracked: entry, pr }])
  }
  return ORDER.flatMap((id) => {
    const items = buckets.get(id)
    return items ? [{ id, items, collapsed: id === "done" }] : []
  })
}
