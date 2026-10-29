import { createStore } from "solid-js/store"
import type { MountedSession, Plugin, SessionRef } from "@opencode/plugin/gui"
import { api, type ChecksState, type PrRef, type PrSummary } from "../rpc.ts"
import { prKey } from "../shared.ts"
import type { definition } from "./definition.ts"

export type Ctx = Parameters<Plugin.Setup<typeof definition>>[0]
export type Page = "overview" | "checks" | "comments" | "files"

export const LIST_TAB = "list"

export function prTabId(ref: PrRef) {
  return `pr/${ref.owner}/${ref.repo}/${ref.number}`
}

export function parsePrTab(id: string): PrRef | undefined {
  const match = /^pr\/([\w.-]+)\/([\w.-]+)\/(\d+)$/.exec(id)
  return match ? { owner: match[1]!, repo: match[2]!, number: Number(match[3]) } : undefined
}

export function errorText(error: unknown): string {
  if (!error) return ""
  if (typeof error === "string") return error
  const value = error as { message?: unknown; data?: { message?: unknown } }
  if (typeof value.data?.message === "string") return value.data.message
  if (typeof value.message === "string") return value.message
  return String(error)
}

interface Mentions {
  readonly prs: PrSummary[]
  readonly error?: string
  readonly loading: boolean
}

/** Shared window state: each session's mentioned PRs, PR tab titles, and how tabs open. */
export function createApp(ctx: Ctx) {
  const [mentions, setMentions] = createStore<Record<string, Mentions>>({})
  const [titles, setTitles] = createStore<Record<string, { title: string; checks: ChecksState }>>({})
  const [pages, setPages] = createStore<Record<string, { page: Page; at: number }>>({})
  const inflight = new Map<string, Promise<void>>()

  const client = (session: SessionRef) => api(session.server?.client ?? ctx.client)

  function load(session: MountedSession, fresh = false) {
    const running = inflight.get(session.key)
    if (running && !fresh) return running
    setMentions(session.key, (previous) => ({ prs: previous?.prs ?? [], error: previous?.error, loading: true }))
    const task = client(session)
      .mentioned({ sessionID: session.id, directory: session.directory, fresh })
      .then(
        (result) => setMentions(session.key, { prs: result.prs, error: result.error, loading: false }),
        (error) =>
          setMentions(session.key, (previous) => ({ prs: previous?.prs ?? [], error: errorText(error), loading: false })),
      )
      .finally(() => inflight.delete(session.key))
    inflight.set(session.key, task)
    return task
  }

  function openList(session: SessionRef) {
    ctx.layout.open(`${ctx.id}:${LIST_TAB}`, session, { tab: "select" })
  }

  function openPr(session: SessionRef, ref: PrRef, page?: Page) {
    if (page) setPages(prKey(ref), { page, at: Date.now() })
    ctx.layout.open(`${ctx.id}:${prTabId(ref)}`, session, { tab: "select" })
  }

  return {
    ctx,
    mentions: (session: SessionRef) => mentions[session.key],
    load,
    client,
    openList,
    openPr,
    /** The latest sub-page a link asked a PR tab to show. */
    requestedPage: (ref: PrRef) => pages[prKey(ref)],
    titles,
    setTitle: (ref: PrRef, title: string, checks: ChecksState) => setTitles(prKey(ref), { title, checks }),
  }
}

export type App = ReturnType<typeof createApp>

export function pageFromUrl(page: string | undefined): Page | undefined {
  if (page === "files" || page === "changes") return "files"
  if (page === "checks") return "checks"
  return undefined
}
