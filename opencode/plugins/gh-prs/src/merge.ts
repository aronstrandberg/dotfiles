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

/** Whether the viewer may approve or request changes: GitHub refuses both on a PR you authored. */
export function canReview(pr: Pick<PrDetail, "state" | "author" | "viewerLogin">) {
  return pr.state === "OPEN" && pr.author.toLowerCase() !== pr.viewerLogin.toLowerCase()
}

/**
 * The merge-related actions a PR offers right now: one primary action and a menu of the rest.
 *
 * No choice bypasses branch protection or the merge queue, and the primary merge action is only ever Queue. Where the
 * base branch has a merge queue, or GitHub could not say, Queue is a bare `gh pr merge`, which queues a PR whose checks
 * passed and otherwise enables auto-merge into the queue. A base without a queue, such as a stacked PR's parent
 * branch, gets no primary merge action; the menu offers merges that name the base branch.
 */
export function mergeChoices(pr: PrDetail): { primary?: MergeChoice; menu: MergeMenuEntry[] } {
  if (pr.state !== "OPEN") return { menu: [] }
  const queued = pr.mergeQueue !== false
  const queue: MergeChoice = {
    label: "Queue",
    icon: "check",
    action: { type: "merge" },
    pending: "Adding to the merge queue…",
    confirm: {
      title: `Queue #${pr.number}?`,
      confirm: "Queue",
    },
  }
  const merge = (method: PrDetail["defaultMergeMethod"], auto: boolean): MergeChoice => {
    const into = `into ${pr.baseRefName}`
    const label = auto
      ? `Auto-merge ${into}: ${MERGE_METHOD_LABEL[method].toLowerCase()}`
      : `${MERGE_METHOD_LABEL[method]} ${into}`
    return {
      label,
      icon: "check",
      action: { type: "merge", method, auto },
      pending: auto ? "Enabling auto-merge…" : "Merging…",
      confirm: { title: `${label}: #${pr.number}?`, confirm: auto ? "Enable" : "Merge" },
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
  else if (queued) primary = queue

  const menu: MergeMenuEntry[] = []
  if (!pr.isDraft && !pr.isInMergeQueue && !queued) {
    menu.push(...pr.mergeMethods.map((method) => merge(method, false)))
    menu.push({ group: "When requirements pass", items: pr.mergeMethods.map((method) => merge(method, true)) })
  }
  menu.push("separator")
  if (pr.autoMerge) menu.push(disableAuto)
  menu.push(draftToggle)
  return { primary, menu }
}
