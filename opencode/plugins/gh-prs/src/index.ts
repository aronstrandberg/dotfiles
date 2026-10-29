import { existsSync } from "node:fs"
import { Plugin } from "@opencode/plugin"
import * as GitHub from "./github.ts"
import { GhPrs, type PrAction, type PrRef, type PrSummary } from "./rpc.ts"
import { findPrUrls, prKey } from "./shared.ts"

/** Most mentioned PRs listed per session, newest mention first. */
const MAX_PRS = 40
const SUMMARY_TTL = 30_000

export default Plugin.define({
  id: "ghprs",
  async setup(ctx) {
    // A desktop app started from the Dock gets a minimal PATH without Homebrew.
    const gh =
      typeof ctx.options.gh === "string"
        ? ctx.options.gh
        : (Bun.which("gh") ?? ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find((path) => existsSync(path)) ?? "gh")
    const cache = new Map<string, { at: number; summary: PrSummary | null }>()

    async function cachedSummaries(refs: PrRef[], fresh: boolean, signal: AbortSignal) {
      const now = Date.now()
      const stale = refs.filter((ref) => {
        const hit = cache.get(prKey(ref))
        return fresh || !hit || now - hit.at > SUMMARY_TTL
      })
      if (stale.length > 0) {
        const loaded = await GitHub.summaries(stale, { gh, signal })
        const byKey = new Map(loaded.map((summary) => [prKey(summary), summary]))
        for (const ref of stale) cache.set(prKey(ref), { at: now, summary: byKey.get(prKey(ref)) ?? null })
      }
      return refs.flatMap((ref) => {
        const summary = cache.get(prKey(ref))?.summary
        return summary ? [summary] : []
      })
    }

    const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
    // RPC output must be plain JSON: drop undefined fields.
    const json = <T>(value: T): T => JSON.parse(JSON.stringify(value))
    const NAME = /^[\w.-]+$/
    const checked = (input: unknown): PrRef => {
      const { owner, repo, number } = input as PrRef
      if (!NAME.test(owner) || !NAME.test(repo) || !Number.isInteger(number))
        throw new GitHub.GhError(`Invalid pull request reference ${owner}/${repo}#${number}`)
      return { owner, repo, number }
    }

    await ctx.rpc.register(GhPrs, {
      mentioned: async (input, call) => {
        const { sessionID, directory, fresh } = input as { sessionID: string; directory?: string; fresh?: boolean }
        const messages = await ctx.session.context({ sessionID })
        // Newest message first, so the most recently discussed PRs lead the list.
        const seen = new Map<string, PrRef>()
        for (const entry of [...messages].reverse()) {
          for (const ref of findPrUrls(JSON.stringify(entry))) {
            const key = prKey(ref)
            if (!seen.has(key)) seen.set(key, { owner: ref.owner, repo: ref.repo, number: ref.number })
          }
          if (seen.size >= MAX_PRS) break
        }
        const branch = directory ? await GitHub.branchPr(directory, { gh, signal: call.signal }) : undefined
        const refs = [...(branch ? [branch] : []), ...seen.values()].filter(
          (ref, index, all) => all.findIndex((other) => prKey(other) === prKey(ref)) === index,
        )
        try {
          const prs = await cachedSummaries(refs, fresh === true, call.signal)
          return json({ prs: prs.map((pr) => (branch && prKey(pr) === prKey(branch) ? { ...pr, branch: true } : pr)) })
        } catch (error) {
          return { prs: [], error: message(error) }
        }
      },
      detail: async (input, call) => {
        try {
          const ref = checked(input)
          const result = await GitHub.detail(ref, { gh, signal: call.signal })
          cache.set(prKey(ref), { at: Date.now(), summary: result })
          return json(result)
        } catch (error) {
          return call.error("gh", message(error), { message: message(error) })
        }
      },
      files: async (input, call) => {
        try {
          return json(await GitHub.files(checked(input), { gh, signal: call.signal }))
        } catch (error) {
          return call.error("gh", message(error), { message: message(error) })
        }
      },
      act: async (input, call) => {
        const { action } = input as { action: PrAction }
        try {
          const ref = checked(input)
          cache.delete(prKey(ref))
          return await GitHub.act(ref, action, { gh })
        } catch (error) {
          return call.error("gh", message(error), { message: message(error) })
        }
      },
    })
  },
})
