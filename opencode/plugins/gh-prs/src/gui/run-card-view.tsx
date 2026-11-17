import { createMemo, Show, type Accessor } from "solid-js"
import { createLatest, type CodeBlockProps } from "@opencode/plugin/gui"
import { api } from "../rpc.ts"
import type { RunSummary } from "../run.ts"
import { runCardProjection, type RunCardProjection, type RunCardState } from "./run-card.ts"
import type { App } from "./state.ts"

interface RunCardBlockProps {
  readonly app: App
  readonly block: CodeBlockProps
}

/** Session fields needed to resolve a run card through its owning server. */
export interface RunCardLookupSession<Client> {
  readonly server?: { readonly client: Client }
}

/** Reactive result exposed by one run card lookup resource. */
export interface RunCardLookupResult {
  readonly latest: RunSummary | null | undefined
  readonly loading: boolean
  readonly error: unknown
}

/** Creates the cancellable lookup resource used by one mounted run card. */
export function createRunCardLookup<Client>(
  session: Accessor<RunCardLookupSession<Client> | undefined>,
  reference: Accessor<string>,
  fallbackClient: Client,
  resolve: (client: Client, input: { readonly reference: string }, signal: AbortSignal) => Promise<RunSummary | null>,
): RunCardLookupResult {
  return createLatest(session, (current, signal) =>
    resolve(current.server?.client ?? fallbackClient, { reference: reference().trim() }, signal),
  )
}

/** Converts a run card lookup resource to its complete asynchronous state. */
export function runCardLookupState(lookup: RunCardLookupResult): RunCardState {
  if (lookup.loading || (lookup.latest === undefined && !lookup.error)) return { status: "loading" }
  if (lookup.error || lookup.latest === undefined || lookup.latest === null) return { status: "failed" }
  return { status: "resolved", run: lookup.latest }
}

/** Returns visible run content or throws so the host restores the original fenced block. */
export function runCardProjectionOrThrow(lookup: RunCardLookupResult): RunCardProjection {
  const projection = runCardProjection(runCardLookupState(lookup))
  if (projection.type !== "fallback") return projection
  if (lookup.error instanceof Error) throw lookup.error
  throw new Error(lookup.latest === null ? "GitHub Actions run was not found" : "GitHub Actions run lookup failed")
}

/** Opens a trusted run URL through the Desktop system API. */
export function openRunCard(system: { readonly openExternal: (url: string) => unknown }, run: RunSummary): void {
  system.openExternal(run.url)
}

/** Resolves and renders one parsed `gh-run` block through the plugin RPC. */
export function RunCardBlock(props: RunCardBlockProps) {
  const lookup = createRunCardLookup(
    () => props.block.session,
    () => props.block.code,
    props.app.ctx.client,
    (client, input, signal) => api(client).resolveRun(input, signal),
  )
  const projection = createMemo(() => runCardProjectionOrThrow(lookup))
  const resolved = createMemo(() => lookup.latest ?? undefined)
  const loadingLabel = createMemo(() => {
    const value = projection()
    return value.type === "loading" ? value.label : ""
  })
  const ui = props.app.ctx.ui

  return (
    <Show
      when={projection().type === "card" ? projection() : undefined}
      fallback={
        <div class="ghp-card-loading" aria-label="Loading GitHub Actions run">
          <ui.Icon name="github" size="small" />
          <span>{loadingLabel()}</span>
        </div>
      }
    >
      {(card) => {
        const value = card()
        if (value.type !== "card") return undefined
        return (
          <button
            class="ghp-card"
            type="button"
            aria-label={value.accessibleLabel}
            onClick={() => {
              const run = resolved()
              if (run) openRunCard(props.app.ctx.system, run)
            }}
          >
            <span class="ghp-card-label">
              <ui.Icon name="github" size="small" />
              GitHub Actions&nbsp; {value.run}
              {value.attempt ? ` · ${value.attempt}` : ""}
            </span>
            <span class="ghp-card-title">{value.workflow}</span>
            <span class="ghp-card-meta">
              <span>{value.repository}</span>
              <span aria-hidden="true">·</span>
              <span>{value.branchCommit}</span>
              <span aria-hidden="true">·</span>
              <span>{value.event}</span>
              <span aria-hidden="true">·</span>
              <span data-run-tone={value.tone}>{value.state}</span>
              <span aria-hidden="true">·</span>
              <span>{value.timing}</span>
            </span>
          </button>
        )
      }}
    </Show>
  )
}
