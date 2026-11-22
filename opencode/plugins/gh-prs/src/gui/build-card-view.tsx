import { createMemo, Show, type Accessor } from "solid-js"
import { createLatest, type CodeBlockProps } from "@opencode/plugin/gui"
import type { BuildSummary } from "../build.ts"
import { buildAddress } from "../build-card.ts"
import { api } from "../rpc.ts"
import { buildCardProjection, type BuildCardProjection, type BuildCardState } from "./build-card.ts"
import type { App } from "./state.ts"

interface BuildCardBlockProps {
  readonly app: App
  readonly block: CodeBlockProps
}

/** Session fields needed to resolve a build card through its owning server. */
export interface BuildCardLookupSession<Client> {
  readonly server?: { readonly client: Client }
}

/** Reactive result exposed by one Buildkite card lookup resource. */
export interface BuildCardLookupResult {
  readonly latest: BuildSummary | undefined
  readonly loading: boolean
  readonly error: unknown
}

/** Creates the cancellable lookup resource used by one mounted Buildkite card. */
export function createBuildCardLookup<Client>(
  session: Accessor<BuildCardLookupSession<Client> | undefined>,
  reference: Accessor<string>,
  fallbackClient: Client,
  resolve: (client: Client, input: { readonly reference: string }, signal: AbortSignal) => Promise<BuildSummary>,
): BuildCardLookupResult {
  return createLatest(session, (current, signal) =>
    resolve(current.server?.client ?? fallbackClient, { reference: reference().trim() }, signal),
  )
}

/** Converts a Buildkite lookup resource to its complete asynchronous state. */
export function buildCardLookupState(lookup: BuildCardLookupResult): BuildCardState {
  if (lookup.loading || (lookup.latest === undefined && !lookup.error)) return { status: "loading" }
  if (lookup.error || lookup.latest === undefined) return { status: "failed" }
  return { status: "resolved", build: lookup.latest }
}

/** Returns visible build content or throws so the host restores the original fenced block. */
export function buildCardProjectionOrThrow(lookup: BuildCardLookupResult): BuildCardProjection {
  const projection = buildCardProjection(buildCardLookupState(lookup))
  if (projection.type !== "fallback") return projection
  if (lookup.error instanceof Error) throw lookup.error
  throw new Error("Buildkite build lookup failed")
}

/** Opens a trusted build URL through the Desktop system API. */
export function openBuildCard(system: { readonly openExternal: (url: string) => unknown }, build: BuildSummary): void {
  system.openExternal(buildAddress(build))
}

/** Resolves and renders one parsed `bk-build` block through the plugin RPC. */
export function BuildCardBlock(props: BuildCardBlockProps) {
  const lookup = createBuildCardLookup(
    () => props.block.session,
    () => props.block.code,
    props.app.ctx.client,
    (client, input, signal) => api(client).resolveBuild(input, signal),
  )
  const projection = createMemo(() => buildCardProjectionOrThrow(lookup))
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
        <div class="ghp-card-loading" aria-label="Loading Buildkite build">
          <ui.Icon name="status-active" size="small" />
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
              const build = resolved()
              if (build) openBuildCard(props.app.ctx.system, build)
            }}
          >
            <span class="ghp-card-label">
              <ui.Icon name="status-active" size="small" />
              Buildkite · {value.organization}
            </span>
            <span class="ghp-card-title">{value.title}</span>
            <Show when={value.message}>
              <span class="ghp-card-message">{value.message}</span>
            </Show>
            <span class="ghp-card-meta">
              <span>{value.branchCommit}</span>
              <span aria-hidden="true">·</span>
              <span data-run-tone={value.tone}>{value.state}</span>
              <span aria-hidden="true">·</span>
              <span>{value.timing}</span>
            </span>
            <Show when={value.failedJobs}>
              <span class="ghp-card-failures">Failed: {value.failedJobs}</span>
            </Show>
          </button>
        )
      }}
    </Show>
  )
}
