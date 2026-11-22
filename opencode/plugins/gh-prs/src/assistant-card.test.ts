import { expect, test } from "bun:test"
import {
  addAssistantCardInstruction,
  ASSISTANT_CARD_INSTRUCTION,
  BUILDKITE_CARD_INSTRUCTION,
} from "./assistant-card.ts"

test("composes neutral PR and run guidance with Buildkite guidance only when available", () => {
  const withoutBuildkite: Array<{ type: "text"; text: string }> = []
  const withBuildkite: Array<{ type: "text"; text: string }> = []

  addAssistantCardInstruction(withoutBuildkite, false)
  addAssistantCardInstruction(withBuildkite, true)

  expect(withoutBuildkite).toEqual([{ type: "text", text: ASSISTANT_CARD_INSTRUCTION }])
  expect(withoutBuildkite[0]?.text).not.toContain("```bk-build")
  expect(withBuildkite[0]?.text).toBe(`${ASSISTANT_CARD_INSTRUCTION}\n\n${BUILDKITE_CARD_INSTRUCTION}`)
  expect(withBuildkite[0]?.text).toContain("```bk-build\nhttps://buildkite.com/organization/pipeline/builds/123\n```")
})
