import { createMemo, For, Show } from "solid-js"
import type { PrRef, PrSummary } from "../rpc.ts"
import { prKey, relativeTime, reviewLabel, stateLabel } from "../shared.ts"
import { workLabels, type TrackedPr } from "../work-status.ts"

/** Shows only registered PRs, keeping saved work notes visible when GitHub is unavailable. */
export function PrTable(props: {
  tracked: readonly TrackedPr[]
  prs: readonly PrSummary[]
  onOpen: (ref: PrRef, page?: "checks") => void
}) {
  const prs = createMemo(() => new Map(props.prs.map((pr) => [prKey(pr), pr])))
  const labels = { success: "Passing", failure: "Failing", pending: "Running / queued", none: "Not reported" }
  return (
    <table class="ghp-table">
      <caption class="ghp-sr-only">Pull requests registered by this session</caption>
      <thead>
        <tr>
          <th scope="col">Pull request</th>
          <th scope="col">CI</th>
          <th scope="col">Review</th>
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
                        <span class="ghp-state" data-state={stateLabel(value())}>
                          {stateLabel(value())}
                        </span>
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
                    <span class={`ghp-tone-${pr()?.checks ?? "neutral"}`}>
                      {pr() ? labels[pr()?.checks ?? "none"] : "Unavailable"}
                    </span>
                  </button>
                  <Show when={pr()?.checkCounts}>
                    {(counts) => (
                      <div class="ghp-ci-counts">
                        <Show when={counts().failure > 0}>
                          <span class="ghp-tone-failure">{counts().failure} failing</span>
                        </Show>
                        <Show when={counts().pending > 0}>
                          <span class="ghp-tone-pending">{counts().pending} running / queued</span>
                        </Show>
                        <span>{counts().success} passed</span>
                        <Show when={counts().skipped + counts().neutral > 0}>
                          <span>{counts().skipped + counts().neutral} skipped / neutral</span>
                        </Show>
                        <Show when={counts().unknown > 0}>
                          <span>{counts().unknown} unknown</span>
                        </Show>
                      </div>
                    )}
                  </Show>
                </td>
                <td class="ghp-muted">
                  {pr() ? reviewLabel(pr()?.reviewDecision ?? null) || "Not reported" : "Unavailable"}
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
