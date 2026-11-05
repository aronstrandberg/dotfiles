/** Time and expiry policy for pull-request card capability leases. */
export interface PrCardLeaseOptions {
  readonly ttl: number
  readonly now: () => number
}

/** Tracks short-lived Desktop renderer leases by server session. */
export class PrCardLeases {
  readonly #leases = new Map<string, Map<string, number>>()

  constructor(private readonly options: PrCardLeaseOptions) {}

  /** Creates or renews one window's lease for a session and returns its expiry. */
  touch(sessionID: string, token: string): number {
    const expiresAt = this.options.now() + this.options.ttl
    const session = this.#leases.get(sessionID) ?? new Map<string, number>()
    session.set(token, expiresAt)
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
    const session = this.#leases.get(sessionID)
    if (!session) return false
    const now = this.options.now()
    for (const [token, expiresAt] of session) {
      if (expiresAt <= now) session.delete(token)
    }
    if (session.size > 0) return true
    this.#leases.delete(sessionID)
    return false
  }
}
