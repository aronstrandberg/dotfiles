import { onCleanup, type Accessor } from "solid-js"
import { createKeyed } from "@opencode/plugin/gui"

/** Card languages supported by this Desktop capability lease. */
export const GITHUB_CARD_LANGUAGES = ["gh-pr", "gh-run"] as const

/** Whether this GUI can register and render GitHub assistant-card code blocks. */
export function supportsGitHubCardRenderer<Registry>(
  platform: string,
  registry: Registry | undefined,
): registry is Registry {
  return platform === "desktop" && registry !== undefined
}

/** Registers all renderers before starting session capability negotiation on supported Desktop hosts. */
export function enableGitHubCardCapability<Registry>(
  platform: string,
  registry: Registry | undefined,
  register: (registry: Registry) => void,
  maintain: () => void,
): boolean {
  if (!supportsGitHubCardRenderer(platform, registry)) return false
  register(registry)
  maintain()
  return true
}

/** Session identity and client needed to negotiate one renderer lease. */
export interface GitHubCardLeaseSession<Client> {
  readonly key: string
  readonly id: string
  readonly server?: { readonly client: Client }
}

/** Client operations used by the GUI lease lifecycle. */
export interface GitHubCardLeaseApi {
  lease(
    input: { readonly sessionID: string; readonly token: string },
    signal: AbortSignal,
  ): Promise<{ readonly expiresAt: number }>
  release(input: { readonly sessionID: string; readonly token: string }): Promise<{ readonly released: boolean }>
}

/** Dependencies for the window-owned capability lifecycle. */
export interface GitHubCardLeaseLifecycleOptions<Client> {
  readonly current: Accessor<GitHubCardLeaseSession<Client> | undefined>
  readonly fallbackClient: Client
  readonly token: string
  readonly repeat: (task: () => void, milliseconds: number) => () => void
  readonly api: (client: Client) => GitHubCardLeaseApi
  readonly onError: (error: unknown) => void
}

/** Maintains one renewable lease for each session routed in this window. */
export function maintainGitHubCardLease<Client>(options: GitHubCardLeaseLifecycleOptions<Client>): void {
  createKeyed(
    options.current,
    (session) => {
      const api = options.api(session.server?.client ?? options.fallbackClient)
      const controller = new AbortController()
      let stopped = false
      let running: Promise<void> | undefined
      const lease = () => {
        if (stopped || running) return
        const request = api
          .lease({ sessionID: session.id, token: options.token }, controller.signal)
          .then(
            () => {},
            (error) => {
              if (!controller.signal.aborted) options.onError(error)
            },
          )
          .finally(() => {
            if (running === request) running = undefined
          })
        running = request
      }
      lease()
      const stop = options.repeat(lease, 15_000)
      onCleanup(() => {
        stopped = true
        stop()
        controller.abort()
        const release = () =>
          api.release({ sessionID: session.id, token: options.token }).then(() => {}, options.onError)
        if (running) void running.then(release)
        else void release()
      })
    },
    { equals: (previous, next) => previous.key === next.key },
  )
}
