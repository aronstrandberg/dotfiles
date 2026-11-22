import { expect, test } from "bun:test"
import { AssistantCardLeases } from "./capability.ts"
import { cardInstructionHook, RatchetAvailability } from "./ratchet-availability.ts"

test("starts unavailable, refreshes in the background, and flips after a cached refresh", async () => {
  let now = 1_000
  const answers = [false, true]
  const availability = new RatchetAvailability({
    ttl: 30_000,
    now: () => now,
    probe: async () => answers.shift() ?? false,
  })

  expect(availability.available()).toBe(false)
  availability.refresh()
  await Bun.sleep(0)
  expect(availability.available()).toBe(false)
  now = 31_000
  availability.refresh()
  await Bun.sleep(0)
  expect(availability.available()).toBe(true)
})

test("gates Buildkite guidance on both a Desktop lease and the last probe result without awaiting network", async () => {
  let finish: ((value: boolean) => void) | undefined
  const pending = new Promise<boolean>((resolve) => {
    finish = resolve
  })
  const availability = new RatchetAvailability({
    ttl: 30_000,
    now: () => 1_000,
    probe: async () => pending,
  })
  const leased = new Set(["leased"])
  const hook = cardInstructionHook({
    leased: (sessionID) => leased.has(sessionID),
    buildCapable: (sessionID) => sessionID === "leased",
    availability,
  })
  const before: Array<{ type: "text"; text: string }> = []

  expect(hook({ sessionID: "leased", system: before })).toBeUndefined()
  expect(before[0]?.text).not.toContain("```bk-build")
  finish?.(true)
  await Bun.sleep(0)

  const after: Array<{ type: "text"; text: string }> = []
  const unleased: Array<{ type: "text"; text: string }> = []
  hook({ sessionID: "leased", system: after })
  hook({ sessionID: "unleased", system: unleased })
  expect(after[0]?.text).toContain("```bk-build")
  expect(unleased).toEqual([])
})

test("uses any live build-capable window, then removes guidance on release or expiry", async () => {
  let now = 1_000
  const availability = new RatchetAvailability({
    ttl: 30_000,
    now: () => now,
    probe: async () => true,
  })
  availability.refresh()
  await Bun.sleep(0)
  const leases = new AssistantCardLeases({ ttl: 45_000, now: () => now })
  leases.touch("session-1", "old-window")
  const hook = cardInstructionHook({
    leased: (sessionID) => leases.enabled(sessionID),
    buildCapable: (sessionID) => leases.supports(sessionID, "bk-build"),
    availability,
  })
  const oldWindow: Array<{ type: "text"; text: string }> = []
  hook({ sessionID: "session-1", system: oldWindow })
  now = 10_000
  leases.touch("session-1", "new-window", ["gh-pr", "gh-run", "bk-build"])
  const mixedWindows: Array<{ type: "text"; text: string }> = []
  hook({ sessionID: "session-1", system: mixedWindows })
  leases.release("session-1", "new-window")
  const afterRelease: Array<{ type: "text"; text: string }> = []
  hook({ sessionID: "session-1", system: afterRelease })
  leases.touch("session-1", "new-window", ["gh-pr", "gh-run", "bk-build"])
  now = 20_000
  leases.touch("session-1", "old-window")
  now = 55_000
  const afterExpiry: Array<{ type: "text"; text: string }> = []
  hook({ sessionID: "session-1", system: afterExpiry })

  expect(oldWindow[0]?.text).not.toContain("```bk-build")
  expect(mixedWindows[0]?.text).toContain("```bk-build")
  expect(afterRelease[0]?.text).not.toContain("```bk-build")
  expect(afterExpiry[0]?.text).not.toContain("```bk-build")
  expect(afterExpiry[0]?.text).toContain("```gh-run")
})
