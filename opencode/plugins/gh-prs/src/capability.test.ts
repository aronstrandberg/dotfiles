import { expect, test } from "bun:test"
import { AssistantCardLeases } from "./capability.ts"

test("does not enable card instructions without an active lease", () => {
  const leases = new AssistantCardLeases({ ttl: 45_000, now: () => 1_000 })

  const enabled = leases.enabled("session-1")

  expect(enabled).toBe(false)
})

test("enables card instructions for the session with one active lease", () => {
  const leases = new AssistantCardLeases({ ttl: 45_000, now: () => 1_000 })

  const expiresAt = leases.touch("session-1", "window-1")

  expect(expiresAt).toBe(46_000)
  expect(leases.enabled("session-1")).toBe(true)
  expect(leases.enabled("session-2")).toBe(false)
})

test("renews an existing window lease", () => {
  let now = 1_000
  const leases = new AssistantCardLeases({ ttl: 45_000, now: () => now })
  leases.touch("session-1", "window-1")

  now = 20_000
  const expiresAt = leases.touch("session-1", "window-1")

  expect(expiresAt).toBe(65_000)
  expect(leases.enabled("session-1")).toBe(true)
})

test("keeps a session enabled until its final window releases", () => {
  const leases = new AssistantCardLeases({ ttl: 45_000, now: () => 1_000 })
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
  const leases = new AssistantCardLeases({ ttl: 45_000, now: () => now })
  leases.touch("session-1", "window-expiring")
  now = 10_000
  leases.touch("session-1", "window-live")

  now = 46_000
  const withLiveWindow = leases.enabled("session-1")
  leases.release("session-1", "window-live")

  expect(withLiveWindow).toBe(true)
  expect(leases.enabled("session-1")).toBe(false)
})

test("treats an old-shape lease as PR and run only", () => {
  const leases = new AssistantCardLeases({ ttl: 45_000, now: () => 1_000 })

  leases.touch("session-1", "old-window")

  expect(leases.supports("session-1", "gh-pr")).toBe(true)
  expect(leases.supports("session-1", "gh-run")).toBe(true)
  expect(leases.supports("session-1", "bk-build")).toBe(false)
})

test("enables build cards when any live window declares the renderer", () => {
  const leases = new AssistantCardLeases({ ttl: 45_000, now: () => 1_000 })
  leases.touch("session-1", "old-window")
  leases.touch("session-1", "new-window", ["gh-pr", "gh-run", "bk-build"])

  expect(leases.supports("session-1", "bk-build")).toBe(true)
  leases.release("session-1", "new-window")
  expect(leases.supports("session-1", "bk-build")).toBe(false)
  expect(leases.enabled("session-1")).toBe(true)
})

test("removes build capability when its declaring lease expires", () => {
  let now = 1_000
  const leases = new AssistantCardLeases({ ttl: 45_000, now: () => now })
  leases.touch("session-1", "old-window")
  now = 10_000
  leases.touch("session-1", "new-window", ["gh-pr", "gh-run", "bk-build"])

  now = 55_000

  expect(leases.supports("session-1", "bk-build")).toBe(false)
  expect(leases.enabled("session-1")).toBe(false)
})
