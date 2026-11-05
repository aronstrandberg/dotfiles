import { expect, test } from "bun:test"
import { PrCardLeases } from "./capability.ts"

test("does not enable card instructions without an active lease", () => {
  const leases = new PrCardLeases({ ttl: 45_000, now: () => 1_000 })

  const enabled = leases.enabled("session-1")

  expect(enabled).toBe(false)
})

test("enables card instructions for the session with one active lease", () => {
  const leases = new PrCardLeases({ ttl: 45_000, now: () => 1_000 })

  const expiresAt = leases.touch("session-1", "window-1")

  expect(expiresAt).toBe(46_000)
  expect(leases.enabled("session-1")).toBe(true)
  expect(leases.enabled("session-2")).toBe(false)
})

test("renews an existing window lease", () => {
  let now = 1_000
  const leases = new PrCardLeases({ ttl: 45_000, now: () => now })
  leases.touch("session-1", "window-1")

  now = 20_000
  const expiresAt = leases.touch("session-1", "window-1")

  expect(expiresAt).toBe(65_000)
  expect(leases.enabled("session-1")).toBe(true)
})

test("keeps a session enabled until its final window releases", () => {
  const leases = new PrCardLeases({ ttl: 45_000, now: () => 1_000 })
  leases.touch("session-1", "window-1")
  leases.touch("session-1", "window-2")

  leases.release("session-1", "window-1")
  const afterFirstRelease = leases.enabled("session-1")
  leases.release("session-1", "window-2")

  expect(afterFirstRelease).toBe(true)
  expect(leases.enabled("session-1")).toBe(false)
})

test("prunes abandoned leases at the expiry boundary", () => {
  let now = 1_000
  const leases = new PrCardLeases({ ttl: 45_000, now: () => now })
  leases.touch("session-1", "window-expiring")
  now = 10_000
  leases.touch("session-1", "window-live")

  now = 46_000
  const withLiveWindow = leases.enabled("session-1")
  leases.release("session-1", "window-live")

  expect(withLiveWindow).toBe(true)
  expect(leases.enabled("session-1")).toBe(false)
})
