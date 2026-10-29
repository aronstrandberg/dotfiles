import type { PrAction, PrDetail } from "./rpc.ts"
import { MERGE_METHOD_LABEL } from "./shared.ts"

export interface MergeChoice {
  readonly label: string
  readonly icon: "check" | "warning" | "close" | "edit"
  readonly action: PrAction
  readonly pending: string
  readonly confirm?: { readonly title: string; readonly confirm: string; readonly danger?: boolean }
}

export type MergeMenuEntry = MergeChoice | "separator" | { readonly group: string; readonly items: MergeChoice[] }

/**
 * The merge-related actions a PR offers right now: one primary action and a menu of the rest.
 *
 * Repositories with a merge queue get queue actions without a merge method, because the queue decides it.
 */
export function mergeChoices(pr: PrDetail): { primary?: MergeChoice; menu: MergeMenuEntry[] } {
  if (pr.state !== "OPEN") return { menu: [] }
  const ready = ["CLEAN", "UNSTABLE", "HAS_HOOKS"].includes(pr.mergeStateStatus)
  const merge = (method: PrDetail["defaultMergeMethod"] | undefined, auto: boolean, admin = false): MergeChoice => {
    const queued = pr.mergeQueue && !admin
    const what = queued ? (auto ? "Merge when ready (queue)" : "Add to merge queue") : method ? MERGE_METHOD_LABEL[method] : "Merge"
    const label = admin ? `${what} as admin` : auto && !queued ? `Auto-merge: ${what.toLowerCase()}` : what
    return {
      label,
      icon: admin ? "warning" : "check",
      action: { type: "merge", method: queued ? undefined : method, auto, admin },
      pending: auto ? "Enabling auto-merge…" : queued ? "Adding to the merge queue…" : "Merging…",
      confirm: { title: `${label}: #${pr.number}?`, confirm: admin ? "Bypass and merge" : auto ? "Enable" : "Merge", danger: admin },
    }
  }
  const draftToggle: MergeChoice = pr.isDraft
    ? { label: "Ready for review", icon: "check", action: { type: "ready" }, pending: "Marking ready…" }
    : { label: "Convert to draft", icon: "edit", action: { type: "draft" }, pending: "Converting to draft…" }
  const disableAuto: MergeChoice = {
    label: "Disable auto-merge",
    icon: "close",
    action: { type: "disable-auto" },
    pending: "Disabling auto-merge…",
  }

  let primary: MergeChoice | undefined
  if (pr.isDraft) primary = draftToggle
  else if (pr.autoMerge) primary = disableAuto
  else if (pr.isInMergeQueue) primary = undefined
  else if (pr.mergeQueue) primary = merge(undefined, !ready)
  else primary = merge(pr.defaultMergeMethod, !ready)

  const menu: MergeMenuEntry[] = []
  if (!pr.isDraft && !pr.isInMergeQueue) {
    if (pr.mergeQueue) menu.push(merge(undefined, false), merge(undefined, true))
    else {
      menu.push(...pr.mergeMethods.map((method) => merge(method, false)))
      menu.push({ group: "When requirements pass", items: pr.mergeMethods.map((method) => merge(method, true)) })
    }
    if (pr.viewerPermission === "ADMIN")
      menu.push({ group: "Bypass branch protection", items: pr.mergeMethods.map((method) => merge(method, false, true)) })
  }
  menu.push("separator")
  if (pr.autoMerge) menu.push(disableAuto)
  menu.push(draftToggle)
  return { primary, menu }
}
