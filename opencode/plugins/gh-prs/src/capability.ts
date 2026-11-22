/** Every assistant-card language this plugin version can render. */
export const ASSISTANT_CARD_LANGUAGES = ["gh-pr", "gh-run", "bk-build"] as const

/** Card languages registered by Desktop versions whose lease omitted capabilities. */
export const LEGACY_CARD_LANGUAGES = ["gh-pr", "gh-run"] as const

/** One renderer language a Desktop lease can declare. */
export type AssistantCardLanguage = (typeof ASSISTANT_CARD_LANGUAGES)[number]

/** Time and expiry policy for assistant-card capability leases. */
export interface AssistantCardLeaseOptions {
  readonly ttl: number
  readonly now: () => number
}

/** Tracks short-lived Desktop renderer leases by server session. */
export class AssistantCardLeases {
  readonly #leases = new Map<
    string,
    Map<string, { readonly expiresAt: number; readonly languages: readonly AssistantCardLanguage[] }>
  >()

  constructor(private readonly options: AssistantCardLeaseOptions) {}

  /** Creates or renews one window's lease for a session and returns its expiry. */
  touch(sessionID: string, token: string, languages: readonly AssistantCardLanguage[] = LEGACY_CARD_LANGUAGES): number {
    const expiresAt = this.options.now() + this.options.ttl
    const session =
      this.#leases.get(sessionID) ??
      new Map<string, { readonly expiresAt: number; readonly languages: readonly AssistantCardLanguage[] }>()
    session.set(token, { expiresAt, languages })
    this.#leases.set(sessionID, session)
    return expiresAt
  }

  /** Releases one window's lease without affecting other windows. */
  release(sessionID: string, token: string): void {
    const session = this.#leases.get(sessionID)
    if (!session) return
    session.delete(token)
    if (session.size === 0) this.#leases.delete(sessionID)
  }

  /** Whether a session currently has at least one renderer lease. */
  enabled(sessionID: string): boolean {
    return this.#live(sessionID).size > 0
  }

  /**
   * Whether any live window for this session declared one renderer.
   *
   * A mixed old/new session enables a language if any live window supports it. This lets the
   * agent serve the capable window, while an old window may show the fence as plain code.
   */
  supports(sessionID: string, language: AssistantCardLanguage): boolean {
    for (const lease of this.#live(sessionID).values()) {
      if (lease.languages.includes(language)) return true
    }
    return false
  }

  #live(
    sessionID: string,
  ): Map<string, { readonly expiresAt: number; readonly languages: readonly AssistantCardLanguage[] }> {
    const session = this.#leases.get(sessionID)
    if (!session) return new Map()
    const now = this.options.now()
    for (const [token, lease] of session) {
      if (lease.expiresAt <= now) session.delete(token)
    }
    if (session.size === 0) this.#leases.delete(sessionID)
    return session
  }
}
