import { expect, test } from "bun:test"
import { createTracker } from "./tracker.ts"

test("only explicitly registered PRs appear, survive reload, and stay isolated by session", async () => {
  const values = new Map<string, unknown>()
  const storage = {
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value)
    },
    remove: async (key: string) => {
      values.delete(key)
    },
    scan: async ({ prefix }: { prefix: string; after?: string }) => ({
      entries: [...values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })),
    }),
  }
  const tracker = createTracker(storage, () => 1_000)
  const ref = { owner: "lovablelabs", repo: "lovable", number: 456 }

  expect(await tracker.list("session-1")).toEqual([])
  await tracker.register("session-1", ref)
  const reloaded = createTracker(storage, () => 2_000)

  expect(await reloaded.list("session-1")).toEqual([{ ...ref, state: "unassigned", note: "", updatedAt: 1_000 }])
  expect(await reloaded.list("session-2")).toEqual([])
})

test("status updates require registration, survive re-registration, and disappear on unregister", async () => {
  const values = new Map<string, unknown>()
  const tracker = createTracker(
    {
      get: async (key) => values.get(key),
      set: async (key, value) => {
        values.set(key, value)
      },
      remove: async (key) => {
        values.delete(key)
      },
      scan: async ({ prefix }) => ({
        entries: [...values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })),
      }),
    },
    () => 2_000,
  )
  const ref = { owner: "LovableLabs", repo: "Lovable", number: 456 }
  const update = { ...ref, state: "blocked", note: "Waiting for the base PR to merge" }

  await expect(tracker.update("s1", update)).rejects.toThrow("Register")
  await tracker.register("s1", ref)
  await tracker.update("s1", update)
  await tracker.register("s1", ref)

  expect(await tracker.list("s1")).toEqual([
    { ...ref, owner: "lovablelabs", repo: "lovable", state: "blocked", note: update.note, updatedAt: 2_000 },
  ])
  await tracker.unregister("s1", ref)
  expect(await tracker.list("s1")).toEqual([])
})
test("invalid status input cannot replace an existing status", async () => {
  const values = new Map<string, unknown>()
  const tracker = createTracker(
    {
      get: async (key) => values.get(key),
      set: async (key, value) => {
        values.set(key, value)
      },
      remove: async (key) => {
        values.delete(key)
      },
      scan: async ({ prefix }) => ({
        entries: [...values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })),
      }),
    },
    () => 2_000,
  )
  const ref = { owner: "lovablelabs", repo: "lovable", number: 456 }
  await tracker.register("s1", ref)

  for (const input of [
    { state: "blocked", note: " " },
    { state: "unknown", note: "Something" },
    { state: "blocked", note: "x".repeat(1_001) },
    { state: "unassigned", note: "This is not an update state" },
  ])
    await expect(tracker.update("s1", { ...ref, ...input })).rejects.toThrow()

  expect((await tracker.list("s1"))[0]?.state).toBe("unassigned")
})
test("listing follows storage cursors instead of hiding older registered PRs", async () => {
  const first = {
    owner: "lovablelabs",
    repo: "lovable",
    number: 456,
    state: "unassigned",
    note: "",
    updatedAt: 1_000,
  } as const
  const second = { ...first, number: 457 }
  const tracker = createTracker(
    {
      get: async () => undefined,
      set: async () => {},
      remove: async () => {},
      scan: async ({ after }) =>
        after === undefined
          ? { entries: [{ key: "first", value: first }], next: "page-2" }
          : { entries: [{ key: "second", value: second }] },
    },
    () => 1_000,
  )

  expect(await tracker.list("s1")).toEqual([first, second])
})

test("concurrent registration does not overwrite an agent's status update", async () => {
  const values = new Map<string, unknown>()
  let finish: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  let writes = 0
  const tracker = createTracker(
    {
      get: async (key) => values.get(key),
      set: async (key, value) => {
        if (++writes === 1) await gate
        values.set(key, value)
      },
      remove: async (key) => {
        values.delete(key)
      },
      scan: async () => ({ entries: [...values].map(([key, value]) => ({ key, value })) }),
    },
    () => 1_000,
  )
  const ref = { owner: "lovablelabs", repo: "lovable", number: 456 }

  const first = tracker.register("s1", ref)
  const second = tracker
    .register("s1", ref)
    .then(() => tracker.update("s1", { ...ref, state: "agent-working", note: "Fixing CI" }))
  await Bun.sleep(0)
  finish()
  await Promise.all([first, second])

  expect((await tracker.list("s1"))[0]?.state).toBe("agent-working")
})
