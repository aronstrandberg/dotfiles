import { onCleanup, type Accessor } from "solid-js"
import { createKeyed } from "@opencode/plugin/gui"

/** Whether this GUI can register and render `gh-pr` code blocks. */
export function supportsPrCardRenderer<Registry>(
  platform: string,
  registry: Registry | undefined,
): registry is Registry {
  return platform === "desktop" && registry !== undefined
}

/** Registers the renderer before starting session capability negotiation on supported Desktop hosts. */
export function enablePrCardCapability<Registry>(
  platform: string,
  registry: Registry | undefined,
  register: (registry: Registry) => void,
  maintain: () => void,
): boolean {
  if (!supportsPrCardRenderer(platform, registry)) return false
  register(registry)
  maintain()
  return true
}

/** Session identity and client needed to negotiate one renderer lease. */
export interface PrCardLeaseSession<Client> {
  readonly key: string
  readonly id: string
  readonly server?: { readonly client: Client }
}

/** Client operations used by the GUI lease lifecycle. */
export interface PrCardLeaseApi {
  lease(
    input: { readonly sessionID: string; readonly token: string },
    signal: AbortSignal,
  ): Promise<{ readonly expiresAt: number }>
  release(input: { readonly sessionID: string; readonly token: string }): Promise<{ readonly released: boolean }>
}

/** Dependencies for the window-owned capability lifecycle. */
export interface PrCardLeaseLifecycleOptions<Client> {
  readonly current: Accessor<PrCardLeaseSession<Client> | undefined>
  readonly fallbackClient: Client
  readonly token: string
  readonly repeat: (task: () => void, milliseconds: number) => () => void
  readonly api: (client: Client) => PrCardLeaseApi
  readonly onError: (error: unknown) => void
}

/** Maintains one renewable lease for each session routed in this window. */
export function maintainPrCardLease<Client>(options: PrCardLeaseLifecycleOptions<Client>): void {
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
