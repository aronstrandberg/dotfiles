import { expect, test } from "bun:test"
import { githubCardKind } from "./card-language.ts"

test("selects only valid payloads for the registered GitHub card languages", () => {
  expect(githubCardKind("gh-pr", "lovablelabs/lovable#456")).toBe("pr")
  expect(githubCardKind("gh-run", "https://github.com/lovablelabs/lovable/actions/runs/12345")).toBe("run")
  expect(githubCardKind("gh-run", "run 12345")).toBeUndefined()
  expect(githubCardKind("typescript", "https://github.com/lovablelabs/lovable/actions/runs/12345")).toBeUndefined()
})
