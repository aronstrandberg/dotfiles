import { expect, test } from "bun:test"
import { assistantCardKind } from "./card-language.ts"

test("selects only valid payloads for the registered assistant-card languages", () => {
  expect(assistantCardKind("gh-pr", "lovablelabs/lovable#456")).toBe("pr")
  expect(assistantCardKind("gh-run", "https://github.com/lovablelabs/lovable/actions/runs/12345")).toBe("run")
  expect(assistantCardKind("bk-build", "https://buildkite.com/lovable/deploy/builds/42#job")).toBe("build")
  expect(assistantCardKind("gh-run", "run 12345")).toBeUndefined()
  expect(assistantCardKind("bk-build", "build 42")).toBeUndefined()
  expect(assistantCardKind("typescript", "https://github.com/lovablelabs/lovable/actions/runs/12345")).toBeUndefined()
})
