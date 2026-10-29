import { onCleanup } from "solid-js"
import {
  Command,
  ComposerPill,
  createKeyed,
  LinkHandler,
  MenuItem,
  Panel,
  Plugin,
  Style,
  type PanelTab,
} from "@opencode/plugin/gui"
import { parsePrUrl, prKey } from "./shared.ts"
import { definition } from "./gui/definition.ts"
import { createApp, LIST_TAB, pageFromUrl, parsePrTab, type Ctx } from "./gui/state.ts"
import { css } from "./gui/styles.ts"
import { ListView, PrView } from "./gui/views.tsx"

const REFRESH_MS = 60_000

function setup(ctx: Ctx) {
  const app = createApp(ctx)
  ctx.add(Style, css)

  // Keep the routed session's PR list fresh: on open, every minute, and after each agent turn.
  createKeyed(
    () => ctx.sessions.current(),
    (session) => {
      void app.load(session)
      const timer = setInterval(() => void app.load(session), REFRESH_MS)
      onCleanup(() => clearInterval(timer))
      const data = ctx.servers.get(session.server.id)?.data
      if (data) {
        onCleanup(
          data.on("session.execution.succeeded", (event) => {
            if (event.data.sessionID === session.id) void app.load(session, true)
          }),
        )
      }
    },
    { equals: (previous, next) => previous.key === next.key },
  )

  const tabs = new Map<string, PanelTab>()
  const tabFor = (id: string): PanelTab => {
    const cached = tabs.get(id)
    if (cached) return cached
    const ref = parsePrTab(id)
    const tab: PanelTab = ref
      ? {
          id,
          get title() {
            const known = app.titles[prKey(ref)]
            return known ? `#${ref.number} ${known.title}` : `#${ref.number}`
          },
          label: () => (
            <span class="ghp-row" style={{ gap: "6px", "max-width": "180px" }}>
              <span class="ghp-dot" data-checks={app.titles[prKey(ref)]?.checks ?? "none"} />
              <span class="ghp-ellipsis">
                #{ref.number}
                {app.titles[prKey(ref)] ? ` ${app.titles[prKey(ref)]!.title}` : ""}
              </span>
            </span>
          ),
          closable: "hover",
        }
      : {
          id,
          get title() {
            return ctx.t("title")
          },
          closable: "hover",
          fallback: true,
        }
    tabs.set(id, tab)
    return tab
  }

  ctx.add(Panel, {
    id: "prs",
    region: "side",
    wide: true,
    mobile: {
      get title() {
        return ctx.t("title")
      },
      order: 60,
      kind: "menu",
      icon: "github",
      cached: true,
    },
    list: (input) => input.open.filter((id) => id === LIST_TAB || parsePrTab(id)).map(tabFor),
    render: (props) => {
      const ref = parsePrTab(props.tab.id)
      if (!ref) return <ListView app={app} session={props.session} />
      return <PrView app={app} session={props.session} screen={props.screen} target={ref} />
    },
  })

  ctx.add(Command, () => ({
    id: "open",
    title: ctx.t("command.open"),
    description: ctx.t("command.open.description"),
    keywords: "github pull request pr review merge ci checks",
    slash: { name: "prs" },
    enabled: !!ctx.sessions.current(),
    run: () => {
      const session = ctx.sessions.current()
      if (session) app.openList(session)
    },
  }))

  ctx.add(Command, () => ({
    id: "refresh",
    title: ctx.t("command.refresh"),
    keywords: "github pull request pr",
    enabled: !!ctx.sessions.current(),
    run: () => {
      const session = ctx.sessions.current()
      if (session) void app.load(session, true)
    },
  }))

  ctx.add(
    MenuItem,
    (): MenuItem => {
      const session = ctx.sessions.current()
      const count = session ? (app.mentions(session)?.prs.length ?? 0) : 0
      return {
        menu: "session.panel",
        id: "open",
        title: ctx.t("title"),
        icon: "github",
        keybind: `${ctx.id}.open`,
        description: count > 0 ? String(count) : undefined,
        opened: !!session && ctx.layout.state(`${ctx.id}:${LIST_TAB}`, session) !== "closed",
        run: () => {
          if (session) app.openList(session)
        },
      }
    },
  )

  ctx.add(ComposerPill, {
    id: "pulls",
    order: 20,
    show: (input) => {
      const prs = app.mentions(input.session)?.prs ?? []
      if (prs.length === 0) return undefined
      const failing = prs.some((pr) => pr.state === "OPEN" && pr.checks === "failure")
      const pending = prs.some((pr) => pr.state === "OPEN" && pr.checks === "pending")
      const single = prs.length === 1 ? prs[0] : undefined
      return {
        icon: "github",
        label: single ? `#${single.number}` : ctx.plural("pulls", prs.length),
        tone: failing ? "danger" : pending ? "warning" : prs.every((pr) => pr.checks === "success" || pr.state !== "OPEN") ? "success" : undefined,
        title: ctx.t("pill.title"),
        rows: [
          ...prs.map((pr) => ({
            id: prKey(pr),
            label: `#${pr.number} ${pr.title}`,
            icon:
              pr.state === "MERGED"
                ? ("check" as const)
                : pr.checks === "failure"
                  ? ("circle-x" as const)
                  : pr.checks === "pending"
                    ? ("status-active" as const)
                    : ("circle-check" as const),
            tone:
              pr.state !== "OPEN"
                ? undefined
                : pr.checks === "failure"
                  ? ("danger" as const)
                  : pr.checks === "pending"
                    ? ("warning" as const)
                    : pr.checks === "success"
                      ? ("success" as const)
                      : undefined,
            detail: pr.state === "OPEN" ? (pr.branch ? "this branch" : pr.repo) : pr.state.toLowerCase(),
            run: () => app.openPr(input.session, pr),
          })),
          { id: "all", label: ctx.t("pill.all"), icon: "bullet-list" as const, run: () => app.openList(input.session) },
        ],
      }
    },
  })

  // Clicking a PR link in the timeline opens it here instead of a browser.
  ctx.add(LinkHandler, {
    priority: 100,
    match: (link) => !!parsePrUrl(link.href),
    open: (link) => {
      const ref = parsePrUrl(link.href)
      const session = link.session ?? ctx.sessions.current()
      if (!ref || !session) return
      app.openPr(session, ref, pageFromUrl(ref.page))
    },
    exists: () => true,
  })
}

export default Plugin.define({ ...definition, setup })

