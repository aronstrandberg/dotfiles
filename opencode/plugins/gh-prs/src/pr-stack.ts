import type { PrStack } from "./rpc.ts"

function member(value: unknown): PrStack["members"][number] {
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid stack member")
  const number: unknown = Reflect.get(value, "number")
  const state: unknown = Reflect.get(value, "state")
  const draft: unknown = Reflect.get(value, "draft")
  const merged: unknown = Reflect.get(value, "merged_at")
  if (typeof number !== "number" || !Number.isSafeInteger(number) || (state !== "open" && state !== "closed"))
    throw new TypeError("Invalid stack member")
  if (typeof draft !== "boolean" || (merged !== null && typeof merged !== "string"))
    throw new TypeError("Invalid stack member")
  return { number, state: merged ? "merged" : state, draft }
}

/**
 * Parses `GET /repos/{owner}/{repo}/stacks?pull_request={number}` into the stack containing that PR.
 *
 * @returns `null` when no listed stack contains the PR.
 * @throws TypeError when the response is not a list of stacks.
 */
export function parseStacks(value: unknown, number: number): PrStack | null {
  if (!Array.isArray(value)) throw new TypeError("Invalid stacks response")
  for (const stack of value) {
    if (typeof stack !== "object" || stack === null) throw new TypeError("Invalid stack")
    const id: unknown = Reflect.get(stack, "number")
    const base: unknown = Reflect.get(stack, "base")
    const pulls: unknown = Reflect.get(stack, "pull_requests")
    const ref: unknown = typeof base === "object" && base !== null ? Reflect.get(base, "ref") : undefined
    if (typeof id !== "number" || typeof ref !== "string" || !Array.isArray(pulls)) throw new TypeError("Invalid stack")
    const members = pulls.map(member)
    if (members.some((entry) => entry.number === number)) return { number: id, base: ref, members }
  }
  return null
}
