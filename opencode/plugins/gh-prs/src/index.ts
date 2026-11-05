import { existsSync } from "node:fs"
import { Plugin } from "@opencode/plugin"
import { PrCardLeases } from "./capability.ts"
import * as GitHub from "./github.ts"
import { addPrCardInstruction, parsePrCardPayload, resolvePrCard } from "./pr-card.ts"
import { GhPrs, type PrAction, type PrRef } from "./rpc.ts"
import { findPrUrls, prKey } from "./shared.ts"
import { GitHubLoadPool, RepositoryCache, SummaryCache } from "./summary-cache.ts"

/** Most mentioned PRs listed per session, newest mention first. */
const MAX_PRS = 40
const SUMMARY_TTL = 30_000
const SUMMARY_CAPACITY = 100
const SUMMARY_CONCURRENCY = 4
const REPOSITORY_CAPACITY = 20
const CARD_LEASE_TTL = 45_000

export default Plugin.define({
  id: "ghprs",
  async setup(ctx) {
    // A desktop app started from the Dock gets a minimal PATH without Homebrew.
    const gh =
      typeof ctx.options.gh === "string"
        ? ctx.options.gh
        : (Bun.which("gh") ?? ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find((path) => existsSync(path)) ?? "gh")
    const loadPool = new GitHubLoadPool(SUMMARY_CONCURRENCY)
    const cache = new SummaryCache({
      ttl: SUMMARY_TTL,
      capacity: SUMMARY_CAPACITY,
      concurrency: SUMMARY_CONCURRENCY,
      pool: loadPool,
      now: Date.now,
      load: (refs, signal) => GitHub.summaries(refs, { gh, signal }),
    })
    const repositories = new RepositoryCache({
      ttl: SUMMARY_TTL,
      capacity: REPOSITORY_CAPACITY,
      pool: loadPool,
      now: Date.now,
      load: (directory, signal) => GitHub.repository(directory, { gh, signal }),
    })
    const leases = new PrCardLeases({ ttl: CARD_LEASE_TTL, now: Date.now })

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

    const resolveInput = (input: unknown): { reference: string; directory?: string } => {
      if (typeof input !== "object" || input === null) throw new GitHub.GhError("Invalid pull request card request")
      const reference = Reflect.get(input, "reference")
      const directory = Reflect.get(input, "directory")
      if (typeof reference !== "string" || (directory !== undefined && typeof directory !== "string")) {
        throw new GitHub.GhError("Invalid pull request card request")
      }
      return directory === undefined ? { reference } : { reference, directory }
    }

    const leaseInput = (input: unknown): { sessionID: string; token: string } => {
      if (typeof input !== "object" || input === null) throw new GitHub.GhError("Invalid PR card capability lease")
      const sessionID = Reflect.get(input, "sessionID")
      const token = Reflect.get(input, "token")
      if (typeof sessionID !== "string" || !sessionID || typeof token !== "string" || !token || token.length > 128) {
        throw new GitHub.GhError("Invalid PR card capability lease")
      }
      return { sessionID, token }
    }

    await ctx.session.hook("context", (event) => {
      if (leases.enabled(event.sessionID)) addPrCardInstruction(event.system)
    })

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
          const prs = await cache.getMany(refs, fresh === true, call.signal)
          return json({ prs: prs.map((pr) => (branch && prKey(pr) === prKey(branch) ? { ...pr, branch: true } : pr)) })
        } catch (error) {
          return { prs: [], error: message(error) }
        }
      },
      detail: async (input, call) => {
        try {
          const ref = checked(input)
          const result = await GitHub.detail(ref, { gh, signal: call.signal })
          cache.put(result)
          return json(result)
        } catch (error) {
          return call.error("gh", message(error), { message: message(error) })
        }
      },
      resolve: async (input, call) => {
        try {
          const request = resolveInput(input)
          const mention = parsePrCardPayload(request.reference)
          if (!mention) throw new GitHub.GhError("Invalid pull request card reference")
          const summary = await resolvePrCard(
            mention,
            request.directory,
            {
              repository: (directory, signal) => repositories.get(directory, signal),
              summary: (ref, signal) => cache.get(ref, signal),
            },
            call.signal,
          )
          return summary ? json(summary) : null
        } catch (error) {
          if (call.signal.aborted) throw error
          return call.error("gh", message(error), { message: message(error) })
        }
      },
      cardLease: async (input) => {
        const request = leaseInput(input)
        return { expiresAt: leases.touch(request.sessionID, request.token) }
      },
      cardRelease: async (input) => {
        const request = leaseInput(input)
        leases.release(request.sessionID, request.token)
        return { released: true }
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
          cache.invalidate(ref)
          return await GitHub.act(ref, action, { gh })
        } catch (error) {
          return call.error("gh", message(error), { message: message(error) })
        }
      },
    })
    return () => {
      repositories.dispose()
      cache.dispose()
    }
  },
})
