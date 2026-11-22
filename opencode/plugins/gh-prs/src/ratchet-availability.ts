import { addAssistantCardInstruction } from "./assistant-card.ts"

/** Dependencies for the cached Ratchet route availability probe. */
export interface RatchetAvailabilityOptions {
  readonly ttl: number
  readonly now: () => number
  readonly probe: (signal: AbortSignal) => Promise<boolean>
}

/** Keeps the last completed Ratchet route probe off the context-hook hot path. */
export class RatchetAvailability {
  #available = false
  #checkedAt: number | undefined
  #running: Promise<void> | undefined
  readonly #controller = new AbortController()

  constructor(private readonly options: RatchetAvailabilityOptions) {}

  /** Returns only the last completed probe result, starting unavailable. */
  available(): boolean {
    return this.#available
  }

  /** Starts a stale probe in detached, owned work and returns immediately. */
  refresh(): void {
    if (
      this.#controller.signal.aborted ||
      this.#running ||
      (this.#checkedAt !== undefined && this.options.now() - this.#checkedAt < this.options.ttl)
    ) {
      return
    }
    const request = this.options
      .probe(this.#controller.signal)
      .then(
        (available) => {
          this.#available = available
        },
        () => {
          this.#available = false
        },
      )
      .finally(() => {
        this.#checkedAt = this.options.now()
        if (this.#running === request) this.#running = undefined
      })
    this.#running = request
  }

  /** Stops future probes and aborts the current owned request. */
  dispose(): void {
    this.#controller.abort()
  }
}

/** Minimal capability interface required by the assistant-card context hook. */
export interface CardInstructionHookOptions {
  readonly leased: (sessionID: string) => boolean
  readonly buildCapable: (sessionID: string) => boolean
  readonly availability: RatchetAvailability
}

/** Creates a synchronous context hook that uses only cached availability. */
export function cardInstructionHook(options: CardInstructionHookOptions) {
  return (event: { readonly sessionID: string; readonly system: Array<{ type: "text"; text: string }> }): void => {
    options.availability.refresh()
    if (options.leased(event.sessionID)) {
      addAssistantCardInstruction(
        event.system,
        options.buildCapable(event.sessionID) && options.availability.available(),
      )
    }
  }
}
