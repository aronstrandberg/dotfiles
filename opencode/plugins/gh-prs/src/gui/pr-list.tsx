import { createMemo, For, Match, Show, Switch } from "solid-js"
import type { CiStatus } from "../ci.ts"
import type { ChecksState, PrRef, PrSummary } from "../rpc.ts"
import { prKey, relativeTime, reviewLabel, stateLabel } from "../shared.ts"
import { workLabels, type TrackedPr } from "../work-status.ts"

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

function CiSummary(props: { ci: CiStatus }) {
  return (
    <Switch>
      <Match when={props.ci.kind === "green"}>
        <span class="ghp-tone-success">All green</span>
      </Match>
      <Match when={props.ci.kind === "red" && props.ci}>
        {(red) => (
          <>
            <span class="ghp-tone-failure">{red().count > 0 ? `${red().count} failing` : "Failing"}</span>
            {names(red().names, red().count)}
            <Show when={red().running > 0}>
              <span class="ghp-tone-pending"> · {red().running} still running</span>
            </Show>
          </>
        )}
      </Match>
      <Match when={props.ci.kind === "running" && props.ci}>
        {(running) => (
          <>
            <span class="ghp-tone-pending">{running().count > 0 ? `${running().count} running` : "Running"}</span>
            {names(running().names, running().count)}
          </>
        )}
      </Match>
      <Match when={props.ci.kind === "unknown" && props.ci}>
        {(unknown) => <span class="ghp-muted">{unknown().count} checks in an unknown state</span>}
      </Match>
      <Match when={props.ci.kind === "none"}>
        <span class="ghp-muted">No checks</span>
      </Match>
    </Switch>
  )
}

/**
 * Lists only registered PRs as stacked lines that fit a narrow sidebar, keeping saved work notes visible when GitHub
 * is unavailable.
 */
export function PrList(props: {
  tracked: readonly TrackedPr[]
  prs: readonly PrSummary[]
  onOpen: (ref: PrRef, page?: "checks") => void
}) {
  const prs = createMemo(() => new Map(props.prs.map((pr) => [prKey(pr), pr])))
  return (
    <ul class="ghp-prs" aria-label="Pull requests registered by this session">
      <For each={props.tracked}>
        {(tracked) => {
          const pr = () => prs().get(prKey(tracked))
          const short = `${tracked.repo}#${tracked.number}`
          return (
            <li class="ghp-pr">
              <button type="button" class="ghp-pr-title" onClick={() => props.onOpen(tracked)}>
                {pr()?.title ?? short}
              </button>
              <div class="ghp-pr-meta">
                <span class="ghp-mono">
                  {tracked.owner}/{tracked.repo}#{tracked.number}
                </span>
                <Show when={pr()}>
                  {(value) => (
                    <>
                      <span class="ghp-state" data-state={stateLabel(value())}>
                        {stateLabel(value())}
                      </span>
                      <Show when={reviewLabel(value().reviewDecision)}>
                        {(review) => (
                          <span class="ghp-review-state" data-state={value().reviewDecision ?? undefined}>
                            {review()}
                          </span>
                        )}
                      </Show>
                    </>
                  )}
                </Show>
              </div>
              <Show when={pr()} fallback={<div class="ghp-pr-line ghp-muted">GitHub data unavailable</div>}>
                {(value) => (
                  <Show when={value().state === "OPEN"}>
                    <button
                      type="button"
                      class="ghp-pr-line ghp-pr-ci"
                      aria-label={`View CI checks for ${short}`}
                      onClick={() => props.onOpen(tracked, "checks")}
                    >
                      <CiSummary ci={value().ci ?? fallback(value().checks)} />
                    </button>
                  </Show>
                )}
              </Show>
              <div class="ghp-pr-line">
                <span class="ghp-work-state" data-work={tracked.state}>
                  {workLabels[tracked.state]}
                </span>
                <span class="ghp-muted" title={new Date(tracked.updatedAt).toLocaleString()}>
                  {" "}
                  · {relativeTime(new Date(tracked.updatedAt).toISOString())}
                </span>
              </div>
              <Show when={tracked.note}>
                <div class="ghp-work-note">{tracked.note}</div>
              </Show>
            </li>
          )
        }}
      </For>
    </ul>
  )
}
