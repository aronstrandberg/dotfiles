import { existsSync } from "node:fs"
import { Plugin } from "@opencode/plugin"
import { BuildCache, BuildLoadPool } from "./build-cache.ts"
import { parseBuildCardPayload, parseBuildCardRequest } from "./build-card.ts"
import { ASSISTANT_CARD_LANGUAGES, AssistantCardLeases, type AssistantCardLanguage } from "./capability.ts"
import * as GitHub from "./github.ts"
import { parsePrCardPayload, resolvePrCard } from "./pr-card.ts"
import {
  parseRatchetBaseUrl,
  probeRatchetBuildRoute,
  RatchetBuildClient,
  RatchetError,
  RATCHET_UNAVAILABLE_MESSAGE,
} from "./ratchet.ts"
import { cardInstructionHook, RatchetAvailability } from "./ratchet-availability.ts"
import { GhPrs, parsePrAction, type PrRef } from "./rpc.ts"
import { RunCache } from "./run-cache.ts"
import { parseRunCardPayload, parseRunCardRequest } from "./run-card.ts"
import { GitHubLoadPool, RepositoryCache, SummaryCache } from "./summary-cache.ts"
import { createTracker } from "./tracker.ts"
import { trackerTools } from "./tracker-tools.ts"

const SUMMARY_TTL = 30_000
const SUMMARY_CAPACITY = 100
const SUMMARY_CONCURRENCY = 4
const REPOSITORY_CAPACITY = 20
const RUN_CAPACITY = 50
const BUILD_CAPACITY = 50
const BUILD_CONCURRENCY = 2
const RATCHET_TIMEOUT = 2_500
const RATCHET_PROBE_TIMEOUT = 500
const RATCHET_PROBE_TTL = 30_000
const CARD_LEASE_TTL = 45_000

export default Plugin.define({
  id: "ghprs",
  async setup(ctx) {
    // A desktop app started from the Dock gets a minimal PATH without Homebrew.
    const gh =
      typeof ctx.options.gh === "string"
        ? ctx.options.gh
        : (Bun.which("gh") ?? ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find((path) => existsSync(path)) ?? "gh")
    const ratchetBaseUrl = parseRatchetBaseUrl(ctx.options.ratchet)
    const ratchet = new RatchetBuildClient({ baseUrl: ratchetBaseUrl, timeout: RATCHET_TIMEOUT })
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
    const runs = new RunCache({
      ttl: SUMMARY_TTL,
      capacity: RUN_CAPACITY,
      pool: loadPool,
      now: Date.now,
      load: (ref, signal) => GitHub.workflowRun(ref, { gh, signal }),
    })
    const builds = new BuildCache({
      ttl: SUMMARY_TTL,
      capacity: BUILD_CAPACITY,
      pool: new BuildLoadPool(BUILD_CONCURRENCY),
      now: Date.now,
      load: (ref, signal) => ratchet.build(ref, signal),
    })
    const leases = new AssistantCardLeases({ ttl: CARD_LEASE_TTL, now: Date.now })
    const ratchetAvailability = new RatchetAvailability({
      ttl: RATCHET_PROBE_TTL,
      now: Date.now,
      probe: (signal) => probeRatchetBuildRoute({ baseUrl: ratchetBaseUrl, timeout: RATCHET_PROBE_TIMEOUT }, signal),
    })
    const tracker = createTracker(ctx.storage, Date.now)
    ratchetAvailability.refresh()

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "ghprs",
        description:
          "Track PRs created for this session and report work status, blockers, and actions needed from the user.",
      })
      for (const tool of Object.values(trackerTools(tracker))) editor.add(tool)
    })

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

    const leaseInput = (
      input: unknown,
    ): { sessionID: string; token: string; languages?: readonly AssistantCardLanguage[] } => {
      if (typeof input !== "object" || input === null)
        throw new GitHub.GhError("Invalid assistant-card capability lease")
      const sessionID = Reflect.get(input, "sessionID")
      const token = Reflect.get(input, "token")
      const rawLanguages = Reflect.get(input, "languages")
      if (typeof sessionID !== "string" || !sessionID || typeof token !== "string" || !token || token.length > 128) {
        throw new GitHub.GhError("Invalid assistant-card capability lease")
      }
      if (rawLanguages === undefined) return { sessionID, token }
      if (!Array.isArray(rawLanguages) || new Set(rawLanguages).size !== rawLanguages.length) {
        throw new GitHub.GhError("Invalid assistant-card capability lease")
      }
      const languages = rawLanguages.map((language) => {
        const parsed = ASSISTANT_CARD_LANGUAGES.find((candidate) => candidate === language)
        if (!parsed) throw new GitHub.GhError("Invalid assistant-card capability lease")
        return parsed
      })
      if (!languages.includes("gh-pr") || !languages.includes("gh-run")) {
        throw new GitHub.GhError("Invalid assistant-card capability lease")
      }
      return { sessionID, token, languages }
    }

    await ctx.session.hook(
      "context",
      cardInstructionHook({
        leased: (sessionID) => leases.enabled(sessionID),
        buildCapable: (sessionID) => leases.supports(sessionID, "bk-build"),
        availability: ratchetAvailability,
      }),
    )

    await ctx.rpc.register(GhPrs, {
      mentioned: async (input, call) => {
        const { sessionID, fresh } = input as { sessionID: string; fresh?: boolean }
        const tracked = await tracker.list(sessionID)
        try {
          const prs = await cache.getMany(tracked, fresh === true, call.signal)
          return json({ prs, tracked })
        } catch (error) {
          return { prs: [], tracked, error: message(error) }
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
      resolveRun: async (input, call) => {
        try {
          const request = parseRunCardRequest(input)
          const ref = parseRunCardPayload(request.reference)
          if (!ref) throw new GitHub.GhError("Invalid GitHub Actions run card reference")
          return json(await runs.get(ref, call.signal))
        } catch (error) {
          if (call.signal.aborted) throw error
          return call.error("gh", message(error), { message: message(error) })
        }
      },
      resolveBuild: async (input, call) => {
        try {
          const request = parseBuildCardRequest(input)
          const ref = parseBuildCardPayload(request.reference)
          if (!ref) throw new RatchetError("Invalid Buildkite build card reference")
          return json(await builds.get(ref, call.signal))
        } catch (error) {
          if (call.signal.aborted) throw error
          const safe =
            error instanceof RatchetError && error.message === "Invalid Buildkite build card reference"
              ? error.message
              : RATCHET_UNAVAILABLE_MESSAGE
          return call.error("ratchet", safe, { message: safe })
        }
      },
      cardLease: async (input) => {
        const request = leaseInput(input)
        return { expiresAt: leases.touch(request.sessionID, request.token, request.languages) }
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
        try {
          const ref = checked(input)
          const action = parsePrAction(
            typeof input === "object" && input !== null ? Reflect.get(input, "action") : null,
          )
          cache.invalidate(ref)
          return await GitHub.act(ref, action, { gh })
        } catch (error) {
          return call.error("gh", message(error), { message: message(error) })
        }
      },
    })
    return () => {
      ratchetAvailability.dispose()
      builds.dispose()
      repositories.dispose()
      runs.dispose()
      cache.dispose()
    }
  },
})
