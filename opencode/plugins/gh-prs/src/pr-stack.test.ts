import { expect, test } from "bun:test"
import { parseStacks } from "./pr-stack.ts"

const response = [
  {
    number: 155894,
    base: { ref: "main" },
    open: true,
    pull_requests: [
      { number: 154973, state: "closed", draft: false, merged_at: "2026-11-12T15:00:00Z" },
      { number: 154977, state: "open", draft: false, merged_at: null },
      { number: 157610, state: "closed", draft: false, merged_at: null },
    ],
  },
]

test("the Stacks API response becomes the PR's stack, members bottom first, merged told apart from closed", () => {
  expect(parseStacks(response, 154977)).toEqual({
    number: 155894,
    base: "main",
    members: [
      { number: 154973, state: "merged", draft: false },
      { number: 154977, state: "open", draft: false },
      { number: 157610, state: "closed", draft: false },
    ],
  })
})

test("a PR in no stack, or a stack listing that does not contain it, has no stack", () => {
  expect(parseStacks([], 1)).toBeNull()
  expect(parseStacks(response, 999)).toBeNull()
})

test("an unexpected response shape is rejected instead of guessed at", () => {
  expect(() => parseStacks({ message: "Not Found" }, 1)).toThrow()
  expect(() => parseStacks([{ number: 1, base: { ref: "main" }, pull_requests: [{ number: "x" }] }], 1)).toThrow()
})
