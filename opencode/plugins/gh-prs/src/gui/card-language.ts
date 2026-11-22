import { parseBuildCardPayload } from "../build-card.ts"
import { parsePrCardPayload } from "../pr-card.ts"
import { parseRunCardPayload } from "../run-card.ts"

/** A parsed assistant-card renderer kind. */
export type AssistantCardKind = "pr" | "run" | "build"

/** Selects a renderer only when the complete fenced payload is valid for its language. */
export function assistantCardKind(language: string, code: string): AssistantCardKind | undefined {
  if (language === "gh-pr") return parsePrCardPayload(code) ? "pr" : undefined
  if (language === "gh-run") return parseRunCardPayload(code) ? "run" : undefined
  if (language === "bk-build") return parseBuildCardPayload(code) ? "build" : undefined
  return undefined
}
