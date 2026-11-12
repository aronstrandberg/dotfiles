import { createMemo, createSignal, For, Show, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import Archive from "lucide-solid/icons/archive"
import Ban from "lucide-solid/icons/ban"
import Bot from "lucide-solid/icons/bot"
import ChevronRight from "lucide-solid/icons/chevron-right"
import CircleCheck from "lucide-solid/icons/circle-check"
import CircleCheckBig from "lucide-solid/icons/circle-check-big"
import CircleDashed from "lucide-solid/icons/circle-dashed"
import CircleHelp from "lucide-solid/icons/circle-question-mark"
import CircleMinus from "lucide-solid/icons/circle-minus"
import CircleX from "lucide-solid/icons/circle-x"
import GitMerge from "lucide-solid/icons/git-merge"
import GitPullRequestClosed from "lucide-solid/icons/git-pull-request-closed"
import Hourglass from "lucide-solid/icons/hourglass"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import UserRound from "lucide-solid/icons/user-round"
import type { CiStatus } from "../ci.ts"
import { groupLabels, groupTracked, type GroupId, type TrackedItem } from "../groups.ts"
import type { ChecksState, PrRef, PrSummary } from "../rpc.ts"
import { stateLabel } from "../shared.ts"
import type { TrackedPr } from "../work-status.ts"

const SHOWN_NAMES = 3

/** Status from a server that predates named checks: the rollup's kind without names. */
function fallback(checks: ChecksState): CiStatus {
  if (checks === "success") return { kind: "green" }
  if (checks === "failure") return { kind: "red", count: 0, names: [], running: 0 }
  if (checks === "pending") return { kind: "running", count: 0, names: [] }
  return { kind: "none" }
}

function names(list: readonly string[], count: number) {
  if (list.length === 0) return ""
  const more = Math.max(count, list.length) - Math.min(list.length, SHOWN_NAMES)
  return `: ${list.slice(0, SHOWN_NAMES).join(", ")}${more > 0 ? `, and ${more} more` : ""}`
}

type Icon = (props: { size?: number; "aria-hidden"?: boolean; class?: string }) => JSX.Element

type Mark = { readonly icon: Icon; readonly tone: string; readonly label: string }

const groupIcons: Record<GroupId, Icon> = {
  "waiting-user": UserRound,
  blocked: Ban,
  "agent-working": Bot,
  "waiting-ci": Hourglass,
  unassigned: CircleDashed,
  ready: CircleCheckBig,
  done: Archive,
}

/** The one-character CI mark and the detail line a row shows: CI when it needs attention, else the agent's note. */
function describe(item: TrackedItem): { readonly mark: Mark; readonly detail: string; readonly detailTone: string } {
  const pr = item.pr
  const note = item.tracked.note
  if (!pr)
    return { mark: { icon: CircleHelp, tone: "muted", label: "GitHub data unavailable" }, detail: note, detailTone: "" }
  if (pr.state !== "OPEN") {
    const merged = pr.state === "MERGED"
    return {
      mark: {
        icon: merged ? GitMerge : GitPullRequestClosed,
        tone: merged ? "merged" : "muted",
        label: stateLabel(pr),
      },
      detail: stateLabel(pr),
      detailTone: "",
    }
  }
  const ci = pr.ci ?? fallback(pr.checks)
  switch (ci.kind) {
    case "green":
      return { mark: { icon: CircleCheck, tone: "success", label: "CI all green" }, detail: note, detailTone: "" }
    case "red": {
      const head = ci.count > 0 ? `${ci.count} failing` : "Failing"
      const tail = ci.running > 0 ? ` · ${ci.running} still running` : ""
      return {
        mark: { icon: CircleX, tone: "failure", label: "CI failing" },
        detail: `${head}${names(ci.names, ci.count)}${tail}`,
        detailTone: "failure",
      }
    }
    case "running":
      return {
        mark: { icon: LoaderCircle, tone: "pending", label: "CI running" },
        detail: `${ci.count > 0 ? `${ci.count} running` : "Running"}${names(ci.names, ci.count)}`,
        detailTone: "pending",
      }
    case "unknown":
      return {
        mark: { icon: CircleHelp, tone: "muted", label: "CI state unknown" },
        detail: `${ci.count} checks in an unknown state`,
        detailTone: "",
      }
    case "none":
      return { mark: { icon: CircleMinus, tone: "muted", label: "No checks" }, detail: note, detailTone: "" }
  }
}

function Row(props: { item: TrackedItem; onOpen: (ref: PrRef) => void }) {
  const view = createMemo(() => describe(props.item))
  const ref = () => props.item.tracked
  const title = () => props.item.pr?.title ?? `${ref().owner}/${ref().repo}#${ref().number}`
  const tooltip = () => [title(), props.item.tracked.note].filter(Boolean).join("\n\n")
  return (
    <li>
      <button type="button" class="ghp-row-button" title={tooltip()} onClick={() => props.onOpen(ref())}>
        <span class={`ghp-mark ghp-tone-${view().mark.tone}`}>
          <Dynamic component={view().mark.icon} size={16} aria-hidden />
        </span>
        <span class="ghp-sr-only">{view().mark.label}, </span>
        <span class="ghp-row-number">#{ref().number}</span>
        <span class="ghp-row-title">{title()}</span>
        <Show when={view().detail}>
          <span class={`ghp-row-detail ${view().detailTone ? `ghp-tone-${view().detailTone}` : ""}`}>
            {view().detail}
          </span>
        </Show>
      </button>
    </li>
  )
}

/** Lists registered PRs one line each, grouped by what they need, so a narrow sidebar shows the whole set at a glance. */
export function PrList(props: {
  tracked: readonly TrackedPr[]
  prs: readonly PrSummary[]
  onOpen: (ref: PrRef) => void
}) {
  const groups = createMemo(() => groupTracked(props.tracked, props.prs))
  const [toggled, setToggled] = createSignal<Partial<Record<GroupId, boolean>>>({})
  return (
    <div class="ghp-groups">
      <For each={groups()}>
        {(group) => {
          const open = () => !(toggled()[group.id] ?? group.collapsed)
          const id = `ghp-group-${group.id}`
          return (
            <section aria-labelledby={`${id}-head`}>
              <h3 class="ghp-group-heading">
                <button
                  type="button"
                  id={`${id}-head`}
                  class="ghp-group-toggle"
                  aria-expanded={open()}
                  aria-controls={id}
                  onClick={() => setToggled({ ...toggled(), [group.id]: open() })}
                >
                  <span class="ghp-chevron" data-open={open() ? "" : undefined}>
                    <ChevronRight size={14} aria-hidden />
                  </span>
                  <span class={`ghp-group-icon`} data-group={group.id}>
                    <Dynamic component={groupIcons[group.id]} size={15} aria-hidden />
                  </span>
                  {groupLabels[group.id]}
                  <span class="ghp-group-count">{group.items.length}</span>
                </button>
              </h3>
              <Show when={open()}>
                <ul id={id} class="ghp-rows">
                  <For each={group.items}>{(item) => <Row item={item} onOpen={props.onOpen} />}</For>
                </ul>
              </Show>
            </section>
          )
        }}
      </For>
    </div>
  )
}
