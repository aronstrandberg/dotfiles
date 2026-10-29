import { Plugin } from "@opencode/plugin/tui"
import type { Context, PanelInput } from "@opencode/plugin/tui/context"
import { MouseButton, SyntaxStyle, TextAttributes, type RGBA, type ScrollBoxRenderable } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, Show, Switch, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { mergeChoices, type MergeChoice } from "./merge.ts"
import { api, type Check, type PrAction, type PrDetail, type PrFile, type PrRef, type PrSummary } from "./rpc.ts"
import {
  checkCounts,
  duration,
  languageOf,
  mergeStatusText,
  prKey,
  relativeTime,
  reviewLabel,
  sortChecks,
  stateLabel,
} from "./shared.ts"

const PANEL = "ghprs"
const REFRESH_MS = 60_000
const POLL_MS = 30_000
const SIDEBAR_ROWS = 6

type Page = "overview" | "checks" | "comments" | "files"
const PAGES: Page[] = ["overview", "checks", "comments", "files"]
type View = { kind: "list" } | { kind: "pr"; ref: PrRef }

function errorText(error: unknown): string {
  if (!error) return ""
  const value = error as { message?: unknown; data?: { message?: unknown } }
  if (typeof value.data?.message === "string") return value.data.message
  if (typeof value.message === "string") return value.message
  return String(error)
}

/** The syntax style for markdown and diffs, following theme.ts' generateSyntax for the scopes this plugin draws. */
function syntaxStyle(context: Context) {
  const theme = context.theme
  const syntax = theme.syntax
  const markdown = theme.markdown
  const rule = (scope: string[], foreground: RGBA, style: Record<string, unknown> = {}) => ({ scope, style: { foreground, ...style } })
  return SyntaxStyle.fromTheme(
    [
      rule(["default"], theme.text.base),
      rule(["comment", "comment.documentation"], syntax.comment, { italic: true }),
      rule(["string", "symbol", "character"], syntax.string),
      rule(["number", "boolean", "constant", "float"], syntax.number),
      rule(["keyword", "keyword.return", "keyword.conditional", "keyword.import", "keyword.function"], syntax.keyword),
      rule(["operator", "punctuation.delimiter"], syntax.operator),
      rule(["variable", "property", "parameter", "field"], syntax.variable),
      rule(["function", "function.call", "function.method", "constructor"], syntax.function),
      rule(["type", "module", "class", "namespace"], syntax.type),
      rule(["punctuation", "punctuation.bracket"], syntax.punctuation),
      rule(["markup.heading", "markup.heading.1", "markup.heading.2", "markup.heading.3", "markup.heading.4"], markdown.heading, { bold: true }),
      rule(["markup.bold", "markup.strong"], markdown.strong, { bold: true }),
      rule(["markup.italic"], markdown.emphasis, { italic: true }),
      rule(["markup.list"], markdown.listItem),
      rule(["markup.quote"], markdown.blockQuote, { italic: true }),
      rule(["markup.raw", "markup.raw.block", "markup.raw.inline"], markdown.code),
      rule(["markup.link", "markup.link.url", "string.special.url"], markdown.link, { underline: true }),
      rule(["markup.link.label"], markdown.linkText, { underline: true }),
      rule(["markup.list.checked"], theme.text.feedback.success.base),
      rule(["markup.strikethrough", "markup.list.unchecked"], theme.text.muted),
      rule(["diff.plus"], theme.diff.text.added, { background: theme.diff.background.added }),
      rule(["diff.minus"], theme.diff.text.removed, { background: theme.diff.background.removed }),
    ],
    context.renderer.nativeScene,
  )
}

function openExternal(context: Context, url: string) {
  try {
    Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", url], { stdout: "ignore", stderr: "ignore" })
  } catch {}
  context.renderer.copyToClipboardOSC52(url)
  context.ui.toast.show({ message: `Opened ${url} (link copied)`, variant: "info" })
}

export default Plugin.define({
  id: "ghprs.tui",
  setup(context) {
    const [mentions, setMentions] = createStore<Record<string, { prs: PrSummary[]; error?: string; loading: boolean }>>({})
    const [view, setView] = createSignal<View>({ kind: "list" })
    const [page, setPage] = createSignal<Page>("overview")
    const client = () => api(context.client)

    const directoryOf = (sessionID: string) => context.data.session.get(sessionID)?.location?.directory
    const load = (sessionID: string, fresh = false) => {
      setMentions(sessionID, (previous) => ({ prs: previous?.prs ?? [], error: previous?.error, loading: true }))
      return client()
        .mentioned({ sessionID, directory: directoryOf(sessionID), fresh })
        .then(
          (result) => setMentions(sessionID, { prs: result.prs, error: result.error, loading: false }),
          (error) => setMentions(sessionID, (previous) => ({ prs: previous?.prs ?? [], error: errorText(error), loading: false })),
        )
    }
    const loaded = new Set<string>()
    const ensure = (sessionID: string) => {
      if (loaded.has(sessionID)) return
      loaded.add(sessionID)
      void load(sessionID)
    }
    const timer = setInterval(() => loaded.forEach((sessionID) => void load(sessionID)), REFRESH_MS)
    const stopEvents = context.data.on("session.execution.succeeded", (event) => {
      if (loaded.has(event.data.sessionID)) void load(event.data.sessionID, true)
    })

    const [style, setStyle] = createSignal<SyntaxStyle>()
    createEffect(() => {
      const next = syntaxStyle(context)
      const previous = untrack(style)
      setStyle(next)
      if (previous) void context.renderer.idle().then(() => previous.destroy())
    })

    const openPanel = (next: View) => {
      if (next.kind === "pr") setPage("overview")
      setView(next)
      if (!context.ui.panel.open(PANEL)) context.ui.toast.show({ message: "Open a session first", variant: "warning" })
    }

    context.ui.slot({
      append: "sidebar.content",
      render: (input) => {
        createEffect(() => ensure(input.sessionID))
        return <Sidebar context={context} prs={mentions[input.sessionID]?.prs ?? []} onOpen={(ref) => openPanel({ kind: "pr", ref })} onList={() => openPanel({ kind: "list" })} />
      },
    })

    context.ui.slot({
      append: "session.panel",
      render: (panel) => (
        <Show when={panel.name === PANEL}>
          <PanelView
            context={context}
            panel={panel}
            view={view()}
            setView={(next) => {
              if (next.kind === "pr") setPage("overview")
              setView(next)
            }}
            page={page()}
            setPage={setPage}
            style={style()}
            mentions={mentions[panel.sessionID]}
            ensure={() => ensure(panel.sessionID)}
            reload={() => load(panel.sessionID, true)}
          />
        </Show>
      ),
    })

    context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "ghprs.open",
              title: "Show pull requests",
              description: "GitHub pull requests mentioned in this session",
              group: "GitHub",
              palette: true,
              slash: { name: "prs" },
              run: () => {
                const current = context.ui.panel.current()
                if (current?.name === PANEL && view().kind === "list") return context.ui.panel.close()
                openPanel({ kind: "list" })
              },
            },
          ],
        }))
        return null
      },
    })

    return () => {
      clearInterval(timer)
      stopEvents()
      const last = untrack(style)
      if (last) void context.renderer.idle().then(() => last.destroy())
    }
  },
})

function checksGlyph(state: PrSummary["checks"] | Check["state"]) {
  if (state === "success") return "✓"
  if (state === "failure") return "✗"
  if (state === "pending") return "●"
  return "○"
}

/** The glyph for a PR row: its checks while open, else how it ended. */
function prGlyph(pr: PrSummary) {
  if (pr.state === "MERGED") return "◆"
  if (pr.state === "CLOSED") return "⊘"
  return checksGlyph(pr.checks)
}

function checksColor(context: Context, state: PrSummary["checks"] | Check["state"]) {
  const feedback = context.theme.text.feedback
  if (state === "success") return feedback.success.base
  if (state === "failure") return feedback.error.base
  if (state === "pending") return feedback.warning.base
  return context.theme.text.muted
}

function Sidebar(props: { context: Context; prs: PrSummary[]; onOpen: (ref: PrRef) => void; onList: () => void }) {
  const theme = () => props.context.theme
  return (
    <Show when={props.prs.length > 0}>
      <box flexShrink={0}>
        <text fg={theme().text.base} attributes={TextAttributes.BOLD} onMouseUp={(event) => event.button === MouseButton.LEFT && props.onList()}>
          Pull requests <span style={{ fg: theme().text.muted }}>/prs</span>
        </text>
        <For each={props.prs.slice(0, SIDEBAR_ROWS)}>
          {(pr) => (
            <box flexDirection="row" gap={1} onMouseUp={(event) => event.button === MouseButton.LEFT && props.onOpen(pr)}>
              <text fg={pr.state === "OPEN" ? checksColor(props.context, pr.checks) : theme().text.muted} flexShrink={0}>
                {prGlyph(pr)}
              </text>
              <text fg={theme().text.muted} flexShrink={0}>
                #{pr.number}
              </text>
              <text fg={pr.state === "OPEN" ? theme().text.base : theme().text.muted} wrapMode="none" truncate flexGrow={1} minWidth={0}>
                {pr.title}
              </text>
            </box>
          )}
        </For>
        <Show when={props.prs.length > SIDEBAR_ROWS}>
          <text fg={theme().text.muted} onMouseUp={(event) => event.button === MouseButton.LEFT && props.onList()}>
            +{props.prs.length - SIDEBAR_ROWS} more
          </text>
        </Show>
      </box>
    </Show>
  )
}

function PanelView(props: {
  context: Context
  panel: PanelInput
  view: View
  setView: (view: View) => void
  page: Page
  setPage: (page: Page) => void
  style?: SyntaxStyle
  mentions?: { prs: PrSummary[]; error?: string; loading: boolean }
  ensure: () => void
  reload: () => Promise<void>
}) {
  createEffect(() => props.ensure())
  const theme = () => props.context.theme
  const surface = () => (props.panel.presentation === "panel" ? theme().background.raised.base : theme().background.base)
  return (
    <box width="100%" height="100%" backgroundColor={surface()} paddingTop={props.panel.presentation === "panel" ? 1 : 0}>
      <Switch>
        <Match when={props.view.kind === "pr" && props.view}>
          {(current: () => Extract<View, { kind: "pr" }>) => (
            <PrView
              context={props.context}
              panel={props.panel}
              target={current().ref}
              page={props.page}
              style={props.style}
              setPage={props.setPage}
              onBack={() => props.setView({ kind: "list" })}
              onChanged={() => void props.reload()}
            />
          )}
        </Match>
        <Match when={true}>
          <ListView context={props.context} panel={props.panel} mentions={props.mentions} reload={props.reload} onOpen={(ref) => props.setView({ kind: "pr", ref })} />
        </Match>
      </Switch>
    </box>
  )
}

function Footer(props: { context: Context; hints: [string, string][] }) {
  const theme = () => props.context.theme
  return (
    <box flexShrink={0} height={1} paddingLeft={2} paddingRight={1} flexDirection="row">
      <text fg={theme().text.muted} wrapMode="none" truncate>
        <For each={props.hints}>
          {([key, label], index) => (
            <>
              <span style={{ fg: theme().text.base }}>{key}</span> {label}
              {index() < props.hints.length - 1 ? "  " : ""}
            </>
          )}
        </For>
      </text>
    </box>
  )
}

function ListView(props: {
  context: Context
  panel: PanelInput
  mentions?: { prs: PrSummary[]; error?: string; loading: boolean }
  reload: () => Promise<void>
  onOpen: (ref: PrRef) => void
}) {
  const theme = () => props.context.theme
  const prs = () => props.mentions?.prs ?? []
  const [index, setIndex] = createSignal(0)
  const clamp = (value: number) => Math.max(0, Math.min(prs().length - 1, value))
  createEffect(on(() => prs().length, () => setIndex((value) => clamp(value))))

  props.context.keymap.layer(() => ({
    commands: [
      { title: "Next pull request", group: "GitHub", bind: "j,down", run: () => void setIndex((value) => clamp(value + 1)) },
      { title: "Previous pull request", group: "GitHub", bind: "k,up", run: () => void setIndex((value) => clamp(value - 1)) },
      {
        title: "Open pull request",
        group: "GitHub",
        bind: "return",
        run: () => {
          const pr = prs()[index()]
          if (pr) props.onOpen(pr)
        },
      },
      { title: "Refresh pull requests", group: "GitHub", bind: "r", run: () => void props.reload() },
      { title: "Toggle full screen", group: "GitHub", bind: "f", run: props.panel.toggleFullscreen },
      { title: "Close pull requests", group: "GitHub", bind: "escape,q", run: props.panel.close },
    ],
  }))

  return (
    <box flexGrow={1} minHeight={0}>
      <box flexShrink={0} paddingLeft={2} paddingRight={1} flexDirection="row" gap={1}>
        <text fg={theme().text.base} attributes={TextAttributes.BOLD} flexGrow={1}>
          Pull requests
        </text>
        <text fg={theme().text.muted}>{props.mentions?.loading ? "refreshing…" : `${prs().length}`}</text>
      </box>
      <Show when={props.mentions?.error}>
        {(error: () => string) => (
          <box paddingLeft={2} paddingRight={1}>
            <text fg={theme().text.feedback.error.base}>{error()}</text>
          </box>
        )}
      </Show>
      <scrollbox flexGrow={1} minHeight={0} paddingTop={1} verticalScrollbarOptions={{ visible: false }}>
        <Show
          when={prs().length > 0}
          fallback={
            <box paddingLeft={2} paddingRight={1}>
              <text fg={theme().text.muted}>
                {props.mentions?.loading ? "Loading…" : "No pull requests yet. GitHub PR links in this session show up here."}
              </text>
            </box>
          }
        >
          <For each={prs()}>
            {(pr, row) => {
              const selected = () => row() === index()
              return (
                <box
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={selected() ? theme().background.raised.high : undefined}
                  onMouseUp={(event) => {
                    if (event.button !== MouseButton.LEFT) return
                    setIndex(row())
                    props.onOpen(pr)
                  }}
                >
                  <box flexDirection="row" gap={1}>
                    <text fg={selected() ? theme().text.base : theme().background.raised.high} flexShrink={0}>
                      {selected() ? "›" : " "}
                    </text>
                    <text fg={pr.state === "OPEN" ? checksColor(props.context, pr.checks) : theme().text.muted} flexShrink={0}>
                      {prGlyph(pr)}
                    </text>
                    <text fg={theme().text.base} wrapMode="none" truncate flexGrow={1} minWidth={0} attributes={selected() ? TextAttributes.BOLD : 0}>
                      {pr.title}
                    </text>
                  </box>
                  <box flexDirection="row" gap={1} paddingLeft={4}>
                    <text fg={theme().text.muted} wrapMode="none" truncate>
                      {pr.repo}#{pr.number} · {stateLabel(pr)} · {pr.author}
                      <span style={{ fg: theme().diff.text.added }}> +{pr.additions}</span>
                      <span style={{ fg: theme().diff.text.removed }}> −{pr.deletions}</span>
                      {reviewLabel(pr.reviewDecision) ? ` · ${reviewLabel(pr.reviewDecision)}` : ""}
                      {pr.branch ? " · this branch" : ""}
                    </text>
                  </box>
                </box>
              )
            }}
          </For>
        </Show>
      </scrollbox>
      <Footer context={props.context} hints={[["↵", "open"], ["j/k", "move"], ["r", "refresh"], ["f", "full screen"], ["esc", "close"]]} />
    </box>
  )
}

function PrView(props: {
  context: Context
  panel: PanelInput
  target: PrRef
  page: Page
  style?: SyntaxStyle
  setPage: (page: Page) => void
  onBack: () => void
  onChanged: () => void
}) {
  const context = props.context
  const theme = () => context.theme
  const client = () => api(context.client)
  const [detail, setDetail] = createSignal<PrDetail>()
  const [error, setError] = createSignal<string>()
  const [loading, setLoading] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [files, setFiles] = createSignal<{ files: PrFile[]; truncated: boolean }>()
  const [filesError, setFilesError] = createSignal<string>()
  const [fileIndex, setFileIndex] = createSignal(0)
  let scroll: ScrollBoxRenderable | undefined

  const refresh = async () => {
    setLoading(true)
    try {
      setDetail(await client().detail(props.target))
      setError(undefined)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }
  const loadFiles = async () => {
    try {
      setFiles(await client().files(props.target))
      setFilesError(undefined)
    } catch (cause) {
      setFilesError(errorText(cause))
    }
  }
  createEffect(on(() => prKey(props.target), () => {
    setDetail(undefined)
    setFiles(undefined)
    setFileIndex(0)
    void refresh()
  }))
  createEffect(() => {
    if (props.page === "files" && !untrack(files)) void loadFiles()
  })
  createEffect(on(() => [props.page, fileIndex()], () => scroll?.scrollTo(0)))
  const poll = setInterval(() => {
    if (!busy() && !loading() && detail()?.state === "OPEN") void refresh()
  }, POLL_MS)
  onCleanup(() => clearInterval(poll))

  async function perform(action: PrAction, pending: string) {
    setBusy(true)
    context.ui.toast.show({ message: pending, variant: "info", duration: 2000 })
    try {
      const result = await client().act(props.target, action)
      context.ui.toast.show({ message: result.message.split("\n")[0] || "Done", variant: "success" })
      void refresh()
      props.onChanged()
    } catch (cause) {
      context.ui.toast.show({ title: "GitHub refused the request", message: errorText(cause), variant: "error", duration: 10_000 })
    } finally {
      setBusy(false)
    }
  }

  async function choose(choice: MergeChoice) {
    const pr = detail()
    if (choice.confirm && pr) {
      const ok = await context.ui.dialog.confirm({
        title: choice.confirm.title,
        message: `${pr.title}\n\n${mergeStatusText(pr)}`,
        label: { confirm: choice.confirm.confirm, cancel: "Cancel" },
      })
      if (!ok) return
    }
    await perform(choice.action, choice.pending)
  }

  async function mergeMenu() {
    const pr = detail()
    if (!pr || busy()) return
    const { primary, menu } = mergeChoices(pr)
    const options: { title: string; value: MergeChoice; category?: string; description?: string }[] = []
    if (primary) options.push({ title: primary.label, value: primary, category: "Suggested", description: mergeStatusText(pr) })
    for (const entry of menu) {
      if (entry === "separator") continue
      if ("group" in entry) options.push(...entry.items.map((item) => ({ title: item.label, value: item, category: entry.group })))
      else if (entry.label !== primary?.label) options.push({ title: entry.label, value: entry, category: "Actions" })
    }
    if (options.length === 0) return context.ui.toast.show({ message: `#${pr.number} is ${pr.state.toLowerCase()}`, variant: "info" })
    const picked = await context.ui.dialog.select({ title: `Merge #${pr.number}`, options })
    if (picked) await choose(picked)
  }

  async function approve() {
    const pr = detail()
    if (!pr || pr.state !== "OPEN") return
    const ok = await context.ui.dialog.confirm({ title: `Approve #${pr.number}?`, message: pr.title, label: { confirm: "Approve" } })
    if (ok) await perform({ type: "approve" }, "Approving…")
  }

  async function comment() {
    const pr = detail()
    if (!pr) return
    const body = await context.ui.dialog.prompt({ title: `Comment on #${pr.number}`, placeholder: "Markdown comment" })
    if (body?.trim()) await perform({ type: "comment", body }, "Posting comment…")
  }

  async function requestChanges() {
    const pr = detail()
    if (!pr || pr.state !== "OPEN") return
    const body = await context.ui.dialog.prompt({ title: `Request changes on #${pr.number}`, placeholder: "What needs to change?" })
    if (body?.trim()) await perform({ type: "request-changes", body }, "Requesting changes…")
  }

  async function pickFile() {
    const list = files()?.files
    if (!list?.length) return
    const picked = await context.ui.dialog.select({
      title: "Changed files",
      current: fileIndex(),
      options: list.map((file, index) => ({ title: file.filename, value: index, description: `+${file.additions} −${file.deletions}` })),
    })
    if (picked !== undefined) setFileIndex(picked)
  }

  const cyclePage = (delta: number) => props.setPage(PAGES[(PAGES.indexOf(props.page) + delta + PAGES.length) % PAGES.length]!)
  const moveFile = (delta: number) => {
    const count = files()?.files.length ?? 0
    if (count > 0) setFileIndex((value) => Math.max(0, Math.min(count - 1, value + delta)))
  }
  const page = (amount: number) => scroll && scroll.scrollBy(Math.max(1, Math.floor(scroll.viewport.height * amount)))

  context.keymap.layer(() => ({
    commands: [
      { title: "Back to pull requests", group: "GitHub", bind: "escape,q", run: props.onBack },
      { title: "Overview", group: "GitHub", bind: "1", run: () => props.setPage("overview") },
      { title: "Checks", group: "GitHub", bind: "2", run: () => props.setPage("checks") },
      { title: "Comments", group: "GitHub", bind: "3", run: () => props.setPage("comments") },
      { title: "Files", group: "GitHub", bind: "4", run: () => props.setPage("files") },
      { title: "Next tab", group: "GitHub", bind: "tab,l", run: () => cyclePage(1) },
      { title: "Previous tab", group: "GitHub", bind: "shift+tab,h", run: () => cyclePage(-1) },
      { title: "Scroll down", group: "GitHub", bind: "j,down", run: () => void scroll?.scrollBy(1) },
      { title: "Scroll up", group: "GitHub", bind: "k,up", run: () => void scroll?.scrollBy(-1) },
      { title: "Page down", group: "GitHub", bind: "pagedown,ctrl+f,space", run: () => void page(1) },
      { title: "Page up", group: "GitHub", bind: "pageup,ctrl+b", run: () => void page(-1) },
      { title: "Half page down", group: "GitHub", bind: "ctrl+d", run: () => void page(0.5) },
      { title: "Half page up", group: "GitHub", bind: "ctrl+u", run: () => void page(-0.5) },
      { title: "Top", group: "GitHub", bind: "gg,home", run: () => void scroll?.scrollTo(0) },
      { title: "Bottom", group: "GitHub", bind: "shift+g,end", run: () => void (scroll && scroll.scrollTo(scroll.scrollHeight)) },
      { title: "Next file", group: "GitHub", bind: "n,]", enabled: () => props.page === "files", run: () => moveFile(1) },
      { title: "Previous file", group: "GitHub", bind: "p,[", enabled: () => props.page === "files", run: () => moveFile(-1) },
      { title: "Pick file", group: "GitHub", bind: "/", enabled: () => props.page === "files", run: () => void pickFile() },
      { title: "Merge…", group: "GitHub", bind: "m", run: () => void mergeMenu() },
      { title: "Approve", group: "GitHub", bind: "a", run: () => void approve() },
      { title: "Comment", group: "GitHub", bind: "c", run: () => void comment() },
      { title: "Request changes", group: "GitHub", bind: "shift+r", run: () => void requestChanges() },
      { title: "Open in browser", group: "GitHub", bind: "o", run: () => openExternal(context, detail()?.url ?? `https://github.com/${props.target.owner}/${props.target.repo}/pull/${props.target.number}`) },
      {
        title: "Copy link",
        group: "GitHub",
        bind: "y",
        run: () => {
          const url = detail()?.url
          if (url && context.renderer.copyToClipboardOSC52(url)) context.ui.toast.show({ message: "Link copied", variant: "success" })
        },
      },
      { title: "Refresh", group: "GitHub", bind: "r", run: () => void refresh() },
      { title: "Toggle full screen", group: "GitHub", bind: "f", run: props.panel.toggleFullscreen },
    ],
  }))

  const muted = () => theme().text.muted
  const counts = createMemo(() => checkCounts(detail()?.checkList ?? []))

  const Tabs = () => (
    <box flexDirection="row" gap={2} flexShrink={0} paddingLeft={2} paddingRight={1}>
      <For each={PAGES}>
        {(id, index) => {
          const active = () => props.page === id
          const count = () => {
            const pr = detail()
            if (!pr) return ""
            if (id === "checks") return counts().failure ? ` ${counts().failure}✗` : counts().pending ? ` ${counts().pending}●` : ` ${pr.checkList.length}`
            if (id === "comments") return ` ${pr.comments.length + pr.threads.length + pr.reviews.filter((review) => review.body.trim()).length}`
            if (id === "files") return ` ${pr.changedFiles}`
            return ""
          }
          return (
            <text
              fg={active() ? theme().text.base : muted()}
              attributes={active() ? TextAttributes.BOLD | TextAttributes.UNDERLINE : 0}
              onMouseUp={(event) => event.button === MouseButton.LEFT && props.setPage(id)}
              wrapMode="none"
            >
              <span style={{ fg: muted() }}>{index() + 1} </span>
              {id[0]!.toUpperCase() + id.slice(1)}
              <span style={{ fg: id === "checks" && counts().failure ? theme().text.feedback.error.base : muted() }}>{count()}</span>
            </text>
          )
        }}
      </For>
    </box>
  )

  return (
    <box flexGrow={1} minHeight={0}>
      <Show
        when={detail()}
        fallback={
          <box paddingLeft={2} paddingRight={1} flexGrow={1}>
            <text fg={error() ? theme().text.feedback.error.base : muted()}>{error() ?? `Loading ${prKey(props.target)}…`}</text>
          </box>
        }
      >
        {(pr: () => PrDetail) => (
          <>
            <box flexShrink={0} paddingLeft={2} paddingRight={1}>
              <text fg={theme().text.base} attributes={TextAttributes.BOLD}>
                {pr().title} <span style={{ fg: muted() }}>#{pr().number}</span>
              </text>
              <text fg={muted()} wrapMode="none" truncate>
                <span style={{ fg: pr().state === "MERGED" ? theme().text.feedback.info.base : pr().state === "CLOSED" ? theme().text.feedback.error.base : theme().text.feedback.success.base }}>
                  {stateLabel(pr())}
                </span>
                {` · ${pr().author} · ${pr().headRefName} → ${pr().baseRefName} · `}
                <span style={{ fg: theme().diff.text.added }}>+{pr().additions}</span>
                <span style={{ fg: theme().diff.text.removed }}> −{pr().deletions}</span>
                {loading() ? " · refreshing…" : ` · ${relativeTime(pr().updatedAt)}`}
              </text>
              <text fg={pr().mergeable === "CONFLICTING" ? theme().text.feedback.error.base : ["CLEAN", "HAS_HOOKS"].includes(pr().mergeStateStatus) || pr().autoMerge || pr().isInMergeQueue ? theme().text.feedback.success.base : theme().text.feedback.warning.base}>
                {mergeStatusText(pr())}
                <span style={{ fg: muted() }}>{mergeChoices(pr()).primary ? `  m: ${mergeChoices(pr()).primary!.label.toLowerCase()}…` : ""}</span>
              </text>
              <Show when={error()}>
                <text fg={theme().text.feedback.error.base}>Refresh failed: {error()}</text>
              </Show>
            </box>
            <box height={1} flexShrink={0} />
            <Tabs />
            <box height={1} flexShrink={0} />
            <scrollbox ref={(element: ScrollBoxRenderable) => (scroll = element)} flexGrow={1} minHeight={0} verticalScrollbarOptions={{ visible: false }} horizontalScrollbarOptions={{ visible: false }}>
              <Switch>
                <Match when={props.page === "overview"}>
                  <Overview context={context} pr={pr()} style={props.style} />
                </Match>
                <Match when={props.page === "checks"}>
                  <Checks context={context} pr={pr()} />
                </Match>
                <Match when={props.page === "comments"}>
                  <Comments context={context} pr={pr()} style={props.style} />
                </Match>
                <Match when={props.page === "files"}>
                  <Files context={context} files={files()} error={filesError()} index={fileIndex()} style={props.style} />
                </Match>
              </Switch>
            </scrollbox>
          </>
        )}
      </Show>
      <Footer
        context={context}
        hints={
          props.page === "files"
            ? [["n/p", "file"], ["/", "pick"], ["m", "merge"], ["a", "approve"], ["c", "comment"], ["o", "browser"], ["esc", "back"]]
            : [["1-4", "tabs"], ["m", "merge"], ["a", "approve"], ["c", "comment"], ["o", "browser"], ["r", "refresh"], ["esc", "back"]]
        }
      />
    </box>
  )
}

function Overview(props: { context: Context; pr: PrDetail; style?: SyntaxStyle }) {
  const theme = () => props.context.theme
  const reviewers = () => {
    const byAuthor = new Map<string, string>()
    for (const review of props.pr.latestReviews) byAuthor.set(review.author, review.state)
    for (const name of props.pr.reviewRequests) if (!byAuthor.has(name)) byAuthor.set(name, "REQUESTED")
    return [...byAuthor.entries()]
      .map(([name, state]) => `${state === "APPROVED" ? "✓" : state === "CHANGES_REQUESTED" ? "✗" : "○"} ${name}`)
      .join("  ")
  }
  const Fact = (fact: { label: string; value: string }) => (
    <box flexDirection="row" gap={1}>
      <text fg={theme().text.muted} width={11} flexShrink={0}>
        {fact.label}
      </text>
      <text fg={theme().text.base} flexGrow={1} minWidth={0}>
        {fact.value}
      </text>
    </box>
  )
  return (
    <box paddingLeft={2} paddingRight={1}>
      <Fact label="Review" value={reviewLabel(props.pr.reviewDecision) || "No review required"} />
      <Show when={reviewers()}>{(value: () => string) => <Fact label="Reviewers" value={value()} />}</Show>
      <Show when={props.pr.labels.length > 0}>
        <Fact label="Labels" value={props.pr.labels.map((label) => label.name).join(", ")} />
      </Show>
      <Fact label="Changes" value={`+${props.pr.additions} −${props.pr.deletions} in ${props.pr.changedFiles} files`} />
      <Fact label="Opened" value={`${relativeTime(props.pr.createdAt)} by ${props.pr.author}`} />
      <Fact label="Repository" value={`${props.pr.owner}/${props.pr.repo}`} />
      <box height={1} />
      <Show when={props.pr.body.trim()} fallback={<text fg={theme().text.muted}>No description provided.</text>}>
        {(body: () => string) => (
          <Show when={props.style} fallback={<text fg={theme().text.base}>{body()}</text>}>
            {(style: () => SyntaxStyle) => <markdown content={body()} syntaxStyle={style()} />}
          </Show>
        )}
      </Show>
    </box>
  )
}

function Checks(props: { context: Context; pr: PrDetail }) {
  const theme = () => props.context.theme
  const counts = createMemo(() => checkCounts(props.pr.checkList))
  const visible = createMemo(() => sortChecks(props.pr.checkList).filter((check) => check.state !== "skipped" && check.state !== "neutral"))
  return (
    <box paddingLeft={2} paddingRight={1}>
      <text fg={theme().text.muted}>
        <span style={{ fg: theme().text.feedback.error.base }}>{counts().failure} failing</span>
        {" · "}
        <span style={{ fg: theme().text.feedback.warning.base }}>{counts().pending} in progress</span>
        {` · ${counts().success} passed · ${counts().skipped + counts().neutral} skipped (hidden)`}
      </text>
      <box height={1} />
      <Show when={props.pr.checkList.length > 0} fallback={<text fg={theme().text.muted}>No checks reported.</text>}>
        <For each={visible()}>
          {(check) => (
            <box flexDirection="row" gap={1}>
              <text fg={checksColor(props.context, check.state)} flexShrink={0}>
                {checksGlyph(check.state)}
              </text>
              <text fg={check.state === "success" ? theme().text.muted : theme().text.base} wrapMode="none" truncate flexGrow={1} minWidth={0}>
                {check.name}
                <span style={{ fg: theme().text.muted }}>{[check.workflow, check.description, duration(check)].filter(Boolean).map((part) => ` · ${part}`).join("")}</span>
              </text>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}

function Comments(props: { context: Context; pr: PrDetail; style?: SyntaxStyle }) {
  const theme = () => props.context.theme
  type Entry = { at: string; author: string; bot: boolean; heading: string; body: string; hunk?: string }
  const entries = createMemo(() => {
    const list: Entry[] = [
      ...props.pr.comments.map((comment) => ({ at: comment.createdAt, author: comment.author.login, bot: comment.author.bot, heading: "commented", body: comment.body })),
      ...props.pr.reviews
        .filter((review) => review.body.trim() || review.state === "APPROVED" || review.state === "CHANGES_REQUESTED")
        .map((review) => ({
          at: review.submittedAt,
          author: review.author.login,
          bot: review.author.bot,
          heading: review.state === "APPROVED" ? "approved" : review.state === "CHANGES_REQUESTED" ? "requested changes" : "reviewed",
          body: review.body,
        })),
      ...props.pr.threads
        .filter((thread) => thread.comments.length > 0 && !thread.isResolved)
        .map((thread) => ({
          at: thread.comments[0]!.createdAt,
          author: thread.comments[0]!.author.login,
          bot: thread.comments[0]!.author.bot,
          heading: `on ${thread.path}${thread.line ? `:${thread.line}` : ""}${thread.isOutdated ? " (outdated)" : ""}`,
          body: thread.comments.map((comment, index) => (index === 0 ? comment.body : `**${comment.author.login}:** ${comment.body}`)).join("\n\n"),
          hunk: thread.diffHunk.split("\n").slice(-6).join("\n"),
        })),
    ]
    return list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  })
  const resolved = () => props.pr.threads.filter((thread) => thread.isResolved).length
  return (
    <box paddingLeft={2} paddingRight={1}>
      <Show when={entries().length > 0} fallback={<text fg={theme().text.muted}>No conversation yet. Press c to comment.</text>}>
        <For each={entries()}>
          {(entry) => (
            <box paddingBottom={1}>
              <text fg={theme().text.muted}>
                <span style={{ fg: theme().text.base }}>
                  <b>{entry.author}</b>
                </span>
                {entry.bot ? " [bot]" : ""} {entry.heading} · {relativeTime(entry.at)}
              </text>
              <Show when={entry.hunk && props.style}>
                <code content={entry.hunk!} filetype="diff" syntaxStyle={props.style!} />
              </Show>
              <Show when={entry.body.trim()}>
                <Show when={props.style} fallback={<text fg={theme().text.base}>{entry.body}</text>}>
                  {(style: () => SyntaxStyle) => <markdown content={entry.body} syntaxStyle={style()} />}
                </Show>
              </Show>
            </box>
          )}
        </For>
      </Show>
      <Show when={resolved() > 0}>
        <text fg={theme().text.muted}>{resolved()} resolved threads hidden</text>
      </Show>
    </box>
  )
}

function Files(props: { context: Context; files?: { files: PrFile[]; truncated: boolean }; error?: string; index: number; style?: SyntaxStyle }) {
  const theme = () => props.context.theme
  const file = () => props.files?.files[props.index]
  return (
    <box>
      <Switch>
        <Match when={props.error}>
          <box paddingLeft={2}>
            <text fg={theme().text.feedback.error.base}>{props.error}</text>
          </box>
        </Match>
        <Match when={!props.files}>
          <box paddingLeft={2}>
            <text fg={theme().text.muted}>Loading files…</text>
          </box>
        </Match>
        <Match when={file()}>
          {(current: () => PrFile) => (
            <>
              <box flexDirection="row" gap={1} paddingLeft={2} paddingRight={1} paddingBottom={1}>
                <text fg={theme().text.muted} flexShrink={0}>
                  {props.index + 1}/{props.files!.files.length}
                </text>
                <text fg={theme().text.base} wrapMode="none" truncate flexGrow={1} minWidth={0} attributes={TextAttributes.BOLD}>
                  {current().previousFilename ? `${current().previousFilename} → ` : ""}
                  {current().filename}
                </text>
                <text fg={theme().diff.text.added} flexShrink={0}>
                  +{current().additions}
                </text>
                <text fg={theme().diff.text.removed} flexShrink={0}>
                  −{current().deletions}
                </text>
              </box>
              <Show
                when={current().patch}
                fallback={
                  <box paddingLeft={2}>
                    <text fg={theme().text.muted}>{current().status === "removed" ? "File deleted." : "No textual diff (binary or too large)."}</text>
                  </box>
                }
              >
                {(patch: () => string) => (
                  <diff
                    diff={`--- a/${current().previousFilename ?? current().filename}\n+++ b/${current().filename}\n${patch()}`}
                    view="unified"
                    filetype={languageOf(current().filename)}
                    syntaxStyle={props.style}
                    showLineNumbers={true}
                    wrapMode="char"
                    width="100%"
                    fg={theme().text.base}
                    addedBg={theme().diff.background.added}
                    removedBg={theme().diff.background.removed}
                    contextBg={theme().diff.background.context}
                    addedSignColor={theme().diff.highlight.added}
                    removedSignColor={theme().diff.highlight.removed}
                    lineNumberFg={theme().diff.lineNumber.text}
                    lineNumberBg={theme().diff.background.context}
                    addedLineNumberBg={theme().diff.lineNumber.background.added}
                    removedLineNumberBg={theme().diff.lineNumber.background.removed}
                  />
                )}
              </Show>
              <Show when={props.files!.truncated}>
                <box paddingLeft={2} paddingTop={1}>
                  <text fg={theme().text.muted}>Some patches were too large to load; open them on GitHub (o).</text>
                </box>
              </Show>
            </>
          )}
        </Match>
        <Match when={true}>
          <box paddingLeft={2}>
            <text fg={theme().text.muted}>No files changed.</text>
          </box>
        </Match>
      </Switch>
    </box>
  )
}
