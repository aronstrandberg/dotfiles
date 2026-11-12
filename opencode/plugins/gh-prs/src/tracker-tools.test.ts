import { expect, test } from "bun:test"
import { createTracker } from "./tracker.ts"
import { trackerTools } from "./tracker-tools.ts"

test("agent tools register and update only the calling session's PRs", async () => {
  const values = new Map<string, unknown>()
  const tools = trackerTools(
    createTracker(
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
      () => 1_000,
    ),
  )
  const ref = { owner: "lovablelabs", repo: "lovable", number: 456 }
  const context = { sessionID: "s1" }

  await tools.register.execute(ref, context)
  await tools.set_status.execute(
    { ...ref, sessionID: "s2", state: "waiting-user", note: "Please review the API contract" },
    context,
  )

  expect(JSON.parse((await tools.list.execute({}, context)).content)).toEqual([
    { ...ref, state: "waiting-user", note: "Please review the API contract", updatedAt: 1_000 },
  ])
  expect(JSON.parse((await tools.list.execute({}, { sessionID: "s2" })).content)).toEqual([])
  await tools.unregister.execute(ref, context)
  expect(JSON.parse((await tools.list.execute({}, context)).content)).toEqual([])
})
