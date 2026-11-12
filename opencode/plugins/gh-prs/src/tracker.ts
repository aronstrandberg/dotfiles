import type { PrRef } from "./rpc.ts"
import { prKey } from "./shared.ts"
import { parsePrRef, parseTrackedPr, type TrackedPr } from "./work-status.ts"

type Storage = {
  get(key: string): Promise<unknown>
  set(key: string, value: Record<string, string | number>): Promise<void>
  remove(key: string): Promise<void>
  scan(input: {
    prefix: string
    after?: string
  }): Promise<{ entries: readonly { key: string; value: unknown }[]; next?: string }>
}

/** Persists explicitly registered PRs separately for each session. */
export function createTracker(storage: Storage, now: () => number) {
  const prefix = (sessionID: string) => `tracked/${encodeURIComponent(sessionID)}/`
  const key = (sessionID: string, ref: PrRef) => prefix(sessionID) + prKey(ref)
  let writing = Promise.resolve()
  function write<T>(operation: () => Promise<T>): Promise<T> {
    const result = writing.then(operation)
    writing = result.then(
      () => {},
      () => {},
    )
    return result
  }
  return {
    update: (sessionID: string, input: unknown): Promise<TrackedPr> =>
      write(async () => {
        const ref = parsePrRef(input)
        if (typeof input !== "object" || input === null) throw new TypeError("Expected a work status")
        const record = parseTrackedPr({
          ...ref,
          state: Reflect.get(input, "state"),
          note: Reflect.get(input, "note"),
          updatedAt: now(),
        })
        if (record.state === "unassigned") throw new TypeError("Choose a reported work status")
        if ((await storage.get(key(sessionID, ref))) === undefined)
          throw new Error("Register the PR before updating its work status")
        await storage.set(key(sessionID, ref), { ...record })
        return record
      }),
    unregister: (sessionID: string, input: PrRef) =>
      write(async () => {
        await storage.remove(key(sessionID, parsePrRef(input)))
      }),
    list: async (sessionID: string): Promise<TrackedPr[]> => {
      const records: TrackedPr[] = []
      let after: string | undefined
      do {
        const page = await storage.scan({ prefix: prefix(sessionID), after })
        records.push(...page.entries.map((entry) => parseTrackedPr(entry.value)))
        after = page.next
      } while (after !== undefined)
      return records
    },
    register: (sessionID: string, input: PrRef): Promise<TrackedPr> =>
      write(async () => {
        const ref = parsePrRef(input)
        const previous = await storage.get(key(sessionID, ref))
        if (previous !== undefined) return parseTrackedPr(previous)
        const record = parseTrackedPr({ ...ref, state: "unassigned", note: "", updatedAt: now() })
        await storage.set(key(sessionID, ref), { ...record })
        return record
      }),
  }
}
