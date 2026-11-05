import { createMemo, Show } from "solid-js"
import { createLatest, type CodeBlockProps } from "@opencode/plugin/gui"
import { api } from "../rpc.ts"
import { prCardProjection, type PrCardState } from "./card.ts"
import type { App } from "./state.ts"

interface PrCardBlockProps {
  readonly app: App
  readonly block: CodeBlockProps
}

function failed(error: unknown): never {
  throw error instanceof Error ? error : new Error("GitHub pull request lookup failed")
}

/** Resolves and renders one parsed `gh-pr` block through the plugin RPC. */
export function PrCardBlock(props: PrCardBlockProps) {
  const lookup = createLatest(
    () => props.block.session,
    (session, signal) =>
      api(session.server?.client ?? props.app.ctx.client).resolve(
        { reference: props.block.code.trim(), directory: session.directory },
        signal,
      ),
  )
  const state = createMemo((): PrCardState => {
    const latest = lookup.latest
    const error = lookup.error
    if (lookup.loading || (latest === undefined && !error)) return { status: "loading" }
    if (error || latest === undefined || latest === null) return { status: "failed" }
    return { status: "resolved", pr: latest }
  })
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
