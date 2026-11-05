import { createMemo, Show, type Accessor } from "solid-js"
import { createLatest, type CodeBlockProps } from "@opencode/plugin/gui"
import { api, type PrSummary } from "../rpc.ts"
import { prCardProjection, type PrCardState } from "./card.ts"
import type { App } from "./state.ts"

interface PrCardBlockProps {
  readonly app: App
  readonly block: CodeBlockProps
}

/** Session fields needed to resolve one card through its owning server. */
export interface PrCardLookupSession<Client> {
  readonly directory: string
  readonly server?: { readonly client: Client }
}

/** Reactive result exposed by a card lookup resource. */
export interface PrCardLookupResult {
  readonly latest: PrSummary | null | undefined
  readonly loading: boolean
  readonly error: unknown
}

/** Creates the cancellable lookup resource used by one mounted card. */
export function createPrCardLookup<Client>(
  session: Accessor<PrCardLookupSession<Client> | undefined>,
  reference: Accessor<string>,
  fallbackClient: Client,
  resolve: (
    client: Client,
    input: { readonly reference: string; readonly directory: string },
    signal: AbortSignal,
  ) => Promise<PrSummary | null>,
): PrCardLookupResult {
  return createLatest(session, (current, signal) =>
    resolve(
      current.server?.client ?? fallbackClient,
      { reference: reference().trim(), directory: current.directory },
      signal,
    ),
  )
}

/** Converts the card lookup resource to the renderer's complete state union. */
export function prCardLookupState(lookup: PrCardLookupResult): PrCardState {
  const latest = lookup.latest
  const error = lookup.error
  if (lookup.loading || (latest === undefined && !error)) return { status: "loading" }
  if (error || latest === undefined || latest === null) return { status: "failed" }
  return { status: "resolved", pr: latest }
}

function failed(error: unknown): never {
  throw error instanceof Error ? error : new Error("GitHub pull request lookup failed")
}

/** Resolves and renders one parsed `gh-pr` block through the plugin RPC. */
export function PrCardBlock(props: PrCardBlockProps) {
  const lookup = createPrCardLookup(
    () => props.block.session,
    () => props.block.code,
    props.app.ctx.client,
    (client, input, signal) => api(client).resolve(input, signal),
  )
  const state = createMemo(() => prCardLookupState(lookup))
  const projection = createMemo(() => {
    const value = prCardProjection(state())
    if (value.type !== "fallback") return value
    return failed(
      lookup.error ??
        new Error(lookup.latest === null ? "GitHub pull request was not found" : "GitHub pull request lookup returned no result"),
    )
  })
  const resolved = createMemo(() => {
    const current = state()
    return current.status === "resolved" ? current.pr : undefined
  })
  const loadingLabel = createMemo(() => {
    const value = projection()
    return value.type === "loading" ? value.label : ""
  })
  const ui = props.app.ctx.ui

  return (
    <Show
      when={projection().type === "card" ? projection() : undefined}
      fallback={
        <div class="ghp-card-loading" aria-label="Loading pull request">
          <ui.Icon name="github" size="small" />
          <span>{loadingLabel()}</span>
        </div>
      }
    >
      {(card) => {
        const value = card()
        if (value.type !== "card") return undefined
        const session = props.block.session
        if (!session) return undefined
        return (
          <button
            class="ghp-card"
            type="button"
            aria-label={value.accessibleLabel}
            onClick={() => {
              const pr = resolved()
              if (pr) props.app.openPr(session, pr)
            }}
          >
            <span class="ghp-card-label">
              <ui.Icon name="github" size="small" />
              GitHub&nbsp; {value.number}
            </span>
            <span class="ghp-card-title">{value.title}</span>
            <span class="ghp-card-meta">
              <span>{value.repository}</span>
              <span aria-hidden="true">·</span>
              <span>{value.state}</span>
              <span aria-hidden="true">·</span>
              <span data-checks={resolved()?.checks ?? "none"}>{value.checks}</span>
            </span>
          </button>
        )
      }}
    </Show>
  )
}
