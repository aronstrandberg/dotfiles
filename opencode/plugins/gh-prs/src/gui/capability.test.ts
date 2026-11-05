import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { enablePrCardCapability, maintainPrCardLease, supportsPrCardRenderer } from "./capability.ts"

test("detects Desktop hosts that can register the PR card renderer", () => {
  const registry = {}

  expect(supportsPrCardRenderer("desktop", registry)).toBe(true)
  expect(supportsPrCardRenderer("desktop", undefined)).toBe(false)
  expect(supportsPrCardRenderer("web", registry)).toBe(false)
})

test("registers the renderer before leasing and does nothing on unsupported hosts", () => {
  const registry = {}
  const supported: string[] = []
  const unsupported: string[] = []

  enablePrCardCapability(
    "desktop",
    registry,
    () => supported.push("registered"),
    () => supported.push("leased"),
  )
  enablePrCardCapability(
    "desktop",
    undefined,
    () => unsupported.push("registered"),
    () => unsupported.push("leased"),
  )

  expect(supported).toEqual(["registered", "leased"])
  expect(unsupported).toEqual([])
})

test("leases the routed session through its remote server client", async () => {
  const localClient = { id: "local" }
  const remoteClient = { id: "remote" }
  const used: unknown[] = []
  const [session] = createSignal({ key: "remote\nsession-1", id: "session-1", server: { client: remoteClient } })
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    maintainPrCardLease({
      current: session,
      fallbackClient: localClient,
      token: "window-1",
      repeat: () => () => {},
      api: (client) => {
        used.push(client)
        return {
          lease: async () => ({ expiresAt: 46_000 }),
          release: async () => ({ released: true }),
        }
      },
      onError: () => {},
    })
  })
  await Promise.resolve()

  expect(used).toEqual([remoteClient])
  dispose()
})

test("renews the active session lease every fifteen seconds", async () => {
  const client = {}
  const [session] = createSignal({ key: "local\nsession-1", id: "session-1", server: { client } })
  const calls: string[] = []
  let interval = 0
  let renew = () => {}
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    maintainPrCardLease({
      current: session,
      fallbackClient: client,
      token: "window-1",
      repeat: (task, milliseconds) => {
        renew = task
        interval = milliseconds
        return () => {}
      },
      api: () => ({
        lease: async (input) => {
          calls.push(`${input.sessionID}:${input.token}`)
          return { expiresAt: 46_000 }
        },
        release: async () => ({ released: true }),
      }),
      onError: () => {},
    })
  })
  await Bun.sleep(0)
  renew()
  await Bun.sleep(0)

  expect(interval).toBe(15_000)
  expect(calls).toEqual(["session-1:window-1", "session-1:window-1"])
  dispose()
})

test("releases the active lease when the window owner closes", async () => {
  const client = {}
  const [session] = createSignal({ key: "local\nsession-1", id: "session-1", server: { client } })
  const released: string[] = []
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    maintainPrCardLease({
      current: session,
      fallbackClient: client,
      token: "window-1",
      repeat: () => () => {},
      api: () => ({
        lease: async () => ({ expiresAt: 46_000 }),
        release: async (input) => {
          released.push(`${input.sessionID}:${input.token}`)
          return { released: true }
        },
      }),
      onError: () => {},
    })
  })

  dispose()
  await Bun.sleep(0)

  expect(released).toEqual(["session-1:window-1"])
})

test("releases only after an in-flight lease request settles", async () => {
  const client = {}
  const [session] = createSignal({ key: "local\nsession-1", id: "session-1", server: { client } })
  const events: string[] = []
  let finish: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    maintainPrCardLease({
      current: session,
      fallbackClient: client,
      token: "window-1",
      repeat: () => () => {},
      api: () => ({
        lease: async () => {
          await gate
          events.push("lease settled")
          return { expiresAt: 46_000 }
        },
        release: async () => {
          events.push("released")
          return { released: true }
        },
      }),
      onError: () => {},
    })
  })
  dispose()
  await Promise.resolve()
  const beforeLeaseSettles = [...events]
  finish?.()
  await Bun.sleep(0)

  expect(beforeLeaseSettles).toEqual([])
  expect(events).toEqual(["lease settled", "released"])
})
