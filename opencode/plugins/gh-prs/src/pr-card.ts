import type { PrRef, PrSummary } from "./rpc.ts"

/** One complete PR mention parsed from a `gh-pr` fence. */
export type PrCardMention =
  | { readonly type: "qualified"; readonly ref: PrRef }
  | { readonly type: "bare"; readonly number: number }

/** GitHub capabilities needed to resolve a card without exposing transport details. */
export interface PrCardSource {
  repository(directory: string, signal: AbortSignal): Promise<Pick<PrRef, "owner" | "repo"> | undefined>
  summary(ref: PrRef, signal: AbortSignal): Promise<PrSummary | undefined>
}

/** Transient agent guidance added to primary session model calls. */
export const PR_CARD_INSTRUCTION = `OpenCode Desktop can render GitHub pull request title cards. When your assistant answer mentions a GitHub pull request: Keep the ordinary explanatory prose and add a separate closed fenced code block with the language gh-pr for that PR. Put exactly one canonical reference in each block: https://github.com/owner/repo/pull/123, owner/repo#123, or #123 only when it belongs to the session directory's GitHub repository. Do not put prose or multiple references inside the block. Always close the fence. Example:

\`\`\`gh-pr
owner/repo#123
\`\`\``

/** Adds the transient model instruction used by the server session context hook. */
export function addPrCardInstruction(system: Array<{ type: "text"; text: string }>): void {
  system.push({ type: "text", text: PR_CARD_INSTRUCTION })
}

function prNumber(input: string): number | undefined {
  const number = Number(input)
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}

/** Parses the complete source of one `gh-pr` fence into one pull request mention. */
export function parsePrCardPayload(payload: string): PrCardMention | undefined {
  const value = payload.trim()
  const url = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)(?:\/[^\s]*)?$/.exec(value)
  if (url) {
    const number = prNumber(url[3]!)
    if (number === undefined) return undefined
    return {
      type: "qualified",
      ref: { owner: url[1]!, repo: url[2]!, number },
    }
  }
  const qualified = /^([\w.-]+)\/([\w.-]+)#([1-9]\d*)$/.exec(value)
  if (qualified) {
    const number = prNumber(qualified[3]!)
    if (number === undefined) return undefined
    return {
      type: "qualified",
      ref: { owner: qualified[1]!, repo: qualified[2]!, number },
    }
  }
  const bare = /^#([1-9]\d*)$/.exec(value)
  if (bare) {
    const number = prNumber(bare[1]!)
    if (number !== undefined) return { type: "bare", number }
  }
  return undefined
}

/** Resolves a parsed mention through the server-owned GitHub adapter. */
export async function resolvePrCard(
  mention: PrCardMention,
  directory: string | undefined,
  source: PrCardSource,
  signal: AbortSignal,
): Promise<PrSummary | undefined> {
  if (mention.type === "qualified") return source.summary(mention.ref, signal)
  if (!directory) return undefined
  const repository = await source.repository(directory, signal)
  if (!repository) return undefined
  return source.summary({ ...repository, number: mention.number }, signal)
}
