import { parsePrCardPayload } from "../pr-card.ts"
import { parseRunCardPayload } from "../run-card.ts"

/** A parsed GitHub assistant-card renderer kind. */
export type GitHubCardKind = "pr" | "run"

/** Selects a renderer only when the complete fenced payload is valid for its language. */
export function githubCardKind(language: string, code: string): GitHubCardKind | undefined {
  if (language === "gh-pr") return parsePrCardPayload(code) ? "pr" : undefined
  if (language === "gh-run") return parseRunCardPayload(code) ? "run" : undefined
  return undefined
}
