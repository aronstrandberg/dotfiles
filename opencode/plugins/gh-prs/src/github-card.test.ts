import { expect, test } from "bun:test"
import { addGitHubCardInstruction, GITHUB_CARD_INSTRUCTION } from "./github-card.ts"

test("owns the shared PR and run card instruction in a neutral module", () => {
  const system: Array<{ type: "text"; text: string }> = []

  addGitHubCardInstruction(system)

  expect(system).toEqual([{ type: "text", text: GITHUB_CARD_INSTRUCTION }])
  expect(GITHUB_CARD_INSTRUCTION).toContain("```gh-pr")
  expect(GITHUB_CARD_INSTRUCTION).toContain("```gh-run")
})
