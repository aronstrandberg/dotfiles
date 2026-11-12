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

function Names(props: { names: readonly string[]; count: number }) {
  const more = () => Math.max(props.count, props.names.length) - Math.min(props.names.length, SHOWN_NAMES)
  return (
    <Show when={props.names.length > 0}>
      <span class="ghp-ci-names">
        {props.names.slice(0, SHOWN_NAMES).join(", ")}
        {more() > 0 ? `, and ${more()} more` : ""}
      </span>
    </Show>
  )
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
            <Names names={red().names} count={red().count} />
            <Show when={red().running > 0}>
              <span class="ghp-ci-names ghp-tone-pending">{red().running} still running</span>
            </Show>
          </>
        )}
      </Match>
      <Match when={props.ci.kind === "running" && props.ci}>
        {(running) => (
          <>
            <span class="ghp-tone-pending">{running().count > 0 ? `${running().count} running` : "Running"}</span>
            <Names names={running().names} count={running().count} />
          </>
        )}
      </Match>
      <Match when={props.ci.kind === "unknown" && props.ci}>
        {(unknown) => <span class="ghp-muted">{unknown().count} in an unknown state</span>}
      </Match>
      <Match when={props.ci.kind === "none"}>
        <span class="ghp-muted">No checks</span>
      </Match>
    </Switch>
  )
}

/** Shows only registered PRs, keeping saved work notes visible when GitHub is unavailable. */
export function PrTable(props: {
  tracked: readonly TrackedPr[]
  prs: readonly PrSummary[]
  onOpen: (ref: PrRef, page?: "checks") => void
}) {
  const prs = createMemo(() => new Map(props.prs.map((pr) => [prKey(pr), pr])))
  return (
    <table class="ghp-table">
      <caption class="ghp-sr-only">Pull requests registered by this session</caption>
      <thead>
        <tr>
          <th scope="col">Pull request</th>
          <th scope="col">CI</th>
          <th scope="col">Work status</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.tracked}>
          {(tracked) => {
            const pr = () => prs().get(prKey(tracked))
            return (
              <tr>
                <td>
                  <button type="button" class="ghp-table-link" onClick={() => props.onOpen(tracked)}>
                    {pr()?.title ?? `${tracked.repo}#${tracked.number}`}
                  </button>
                  <div class="ghp-table-meta">
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
                </td>
                <td>
                  <button
                    type="button"
                    class="ghp-table-link"
                    aria-label={`View CI checks for ${tracked.repo}#${tracked.number}`}
                    onClick={() => props.onOpen(tracked, "checks")}
                  >
                    <Show when={pr()} fallback={<span class="ghp-muted">Unavailable</span>}>
                      {(value) => (
                        <Show when={value().state === "OPEN"}>
                          <CiSummary ci={value().ci ?? fallback(value().checks)} />
                        </Show>
                      )}
                    </Show>
                  </button>
                </td>
                <td>
                  <div class="ghp-work-state" data-work={tracked.state}>
                    {workLabels[tracked.state]}
                  </div>
                  <Show when={tracked.note}>
                    <div class="ghp-work-note">{tracked.note}</div>
                  </Show>
                  <div class="ghp-table-meta" title={new Date(tracked.updatedAt).toLocaleString()}>
                    Reported {relativeTime(new Date(tracked.updatedAt).toISOString())}
                  </div>
                </td>
              </tr>
            )
          }}
        </For>
      </tbody>
    </table>
  )
}
