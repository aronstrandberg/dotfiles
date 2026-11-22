import { expect, test } from "bun:test"
import { addAssistantCardInstruction } from "./assistant-card.ts"
import { parseRunCardPayload, parseRunCardRequest } from "./run-card.ts"

test("parses exactly one canonical GitHub Actions run URL with surrounding whitespace", () => {
  expect(parseRunCardPayload(" \nhttps://github.com/lovablelabs/lovable/actions/runs/1234567890\t")).toEqual({
    owner: "lovablelabs",
    repo: "lovable",
    runID: 1_234_567_890,
  })
})

test("rejects ambiguous, malformed, unsafe, and unsupported run references", () => {
  const invalid = [
    "",
    "1234567890",
    "lovablelabs/lovable#1234567890",
    "Run https://github.com/lovablelabs/lovable/actions/runs/1234567890",
    "https://github.com/lovablelabs/lovable/actions/runs/1\nhttps://github.com/lovablelabs/lovable/actions/runs/2",
    "https://gitlab.com/lovablelabs/lovable/actions/runs/1234567890",
    "https://github.com/lovablelabs/lovable/actions/runs/0",
    "https://github.com/lovablelabs/lovable/actions/runs/9007199254740992",
    "https://github.com/lovablelabs/lovable/actions/runs/123/jobs/456",
    "https://github.com/lovablelabs/lovable/actions/runs/123?check_suite_focus=true",
    "https://github.com/lovable labs/lovable/actions/runs/123",
    "https://github.com/lovablelabs/lovable.git/actions/runs/123",
  ]

  expect(invalid.map(parseRunCardPayload)).toEqual(invalid.map(() => undefined))
})

test("applies GitHub owner and repository name rules separately", () => {
  expect(parseRunCardPayload("https://github.com/github/.github/actions/runs/123")).toEqual({
    owner: "github",
    repo: ".github",
    runID: 123,
  })
  const invalid = [
    "https://github.com/a_b/repo/actions/runs/123",
    "https://github.com/a.b/repo/actions/runs/123",
    "https://github.com/a--b/repo/actions/runs/123",
    "https://github.com/-a/repo/actions/runs/123",
    "https://github.com/a-/repo/actions/runs/123",
    `https://github.com/${"a".repeat(40)}/repo/actions/runs/123`,
    `https://github.com/owner/${"r".repeat(101)}/actions/runs/123`,
    "https://github.com/owner/./actions/runs/123",
    "https://github.com/owner/../actions/runs/123",
  ]

  expect(invalid.map(parseRunCardPayload)).toEqual(invalid.map(() => undefined))
})

test("composes PR and run guidance as one transient GitHub card instruction", () => {
  const system: Array<{ type: "text"; text: string }> = []

  addAssistantCardInstruction(system, false)

  expect(system).toHaveLength(1)
  expect(system[0]?.text).toContain("Keep the ordinary explanatory prose")
  expect(system[0]?.text).toContain("one reference per fence")
  expect(system[0]?.text).toContain("```gh-pr\nowner/repo#123\n```")
  expect(system[0]?.text).toContain("```gh-run\nhttps://github.com/owner/repo/actions/runs/1234567890\n```")
})

test("parses only the strict run-card RPC request shape", () => {
  const request = { reference: "https://github.com/lovablelabs/lovable/actions/runs/1234567890" }

  expect(parseRunCardRequest(request)).toEqual(request)
  expect(() => parseRunCardRequest({ ...request, extra: true })).toThrow("request")
  expect(() => parseRunCardRequest({ reference: 123 })).toThrow("request")
})
