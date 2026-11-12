import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, Show, Switch } from "solid-js"
import { createLatest, usePanel, type MountedSession, type SessionScreen, type UiMenuEntry } from "@opencode/plugin/gui"
import { Browser } from "@opencode/plugin/gui/browser"
import type { Check, IssueComment, PrAction, PrDetail, PrFile, PrRef, PrSummary, Review, ReviewThread } from "../rpc.ts"
import {
  checkCounts,
  duration,
  languageOf,
  mergeStatusText,
  prKey,
  prUrl,
  relativeTime,
  reviewLabel,
  sortChecks,
  stateLabel,
} from "../shared.ts"
import { canReview, mergeChoices, type MergeChoice } from "../merge.ts"
import { errorText, type App, type Page } from "./state.ts"
import { prSections } from "./sections.ts"
import { PrList } from "./pr-list.tsx"
import { stackMermaid } from "../stack.ts"

const POLL_MS = 30_000

/** Opens a URL in the session's in-app browser pane when the desktop app has one, else the system browser. */
function openUrl(app: App, session: MountedSession, url: string) {
  const live = app.ctx.use(Browser)()
  if (live.status === "active" && live.value.canOpen(session, url)) live.value.open(session, url)
  else app.ctx.system.openExternal(url)
}

function StateLabel(props: { app: App; pr: Pick<PrSummary, "state" | "isDraft" | "isInMergeQueue"> }) {
  const ui = props.app.ctx.ui
  return (
    <span class="ghp-state" data-state={stateLabel(props.pr)}>
      <ui.Icon
        name={props.pr.state === "MERGED" ? "check" : props.pr.state === "CLOSED" ? "circle-x" : "branch"}
        size="small"
      />
      {stateLabel(props.pr)}
    </span>
  )
}

function Diffstat(props: { additions: number; deletions: number }) {
  return (
    <span class="ghp-row" style={{ gap: "4px" }}>
      <span class="ghp-add">+{props.additions}</span>
      <span class="ghp-del">−{props.deletions}</span>
    </span>
  )
}

function checkIcon(state: Check["state"] | PrSummary["checks"]) {
  if (state === "success") return "circle-check" as const
  if (state === "failure") return "circle-x" as const
  if (state === "pending") return "status-active" as const
  return "circle-ban-sign" as const
}

function checkStateLabel(state: Check["state"] | PrSummary["checks"]): string {
  if (state === "success") return "passing"
  if (state === "failure") return "failing"
  if (state === "pending") return "in progress"
  if (state === "skipped") return "skipped"
  if (state === "neutral") return "neutral"
  return "not reported"
}

/* ------------------------------------------------------------------------------------------------ */
/* List                                                                                              */
/* ------------------------------------------------------------------------------------------------ */

export function ListView(props: { app: App; session: MountedSession }) {
  const ui = props.app.ctx.ui
  const mentions = () => props.app.mentions(props.session)
  const panel = usePanel()
  createEffect(
    on(
      () => props.session.key,
      () => void props.app.load(props.session),
    ),
  )
  const timer = setInterval(() => {
    if (panel.visible() && !mentions()?.loading) void props.app.load(props.session)
  }, POLL_MS)
  onCleanup(() => clearInterval(timer))
  const [view, setView] = createSignal<"list" | "stack">("list")
  const ordered = createMemo(() => {
    const byKey = new Map((mentions()?.prs ?? []).map((pr) => [prKey(pr), pr]))
    return (mentions()?.tracked ?? []).flatMap((tracked) => byKey.get(prKey(tracked)) ?? [])
  })
  const graph = createMemo(() => stackMermaid(ordered()))

  return (
    <div class="ghp" data-placement={panel.placement()}>
      <div class="ghp-list-head ghp-row">
        <div class="ghp-grow">
          <div style={{ "font-weight": 600 }}>Pull requests</div>
          <div class="ghp-muted" style={{ "font-size": "12px" }}>
            Registered by this session · CI from GitHub · work status reported by agents
          </div>
        </div>
        <div class="ghp-row" role="group" aria-label="View">
          <For
            each={
              [
                { id: "list", label: "List" },
                { id: "stack", label: "Stack" },
              ] as const
            }
          >
            {(option) => (
              <button
                type="button"
                class="ghp-section-button"
                aria-pressed={view() === option.id}
                data-active={view() === option.id ? "" : undefined}
                onClick={() => setView(option.id)}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
        <ui.Tooltip value="Refresh">
          <ui.IconButton
            icon="refresh"
            label="Refresh"
            variant="ghost"
            busy={mentions()?.loading}
            onClick={() => void props.app.load(props.session, true)}
          />
        </ui.Tooltip>
      </div>
      <Show when={mentions()?.error}>{(error) => <div class="ghp-error">{error()}</div>}</Show>
      <div class="ghp-scroll">
        <Show
          when={(mentions()?.tracked.length ?? 0) > 0}
          fallback={
            <div class="ghp-empty">
              <Show when={mentions()?.loading} fallback={<ui.Icon name="github" size="large" />}>
                <ui.Loader size="large" />
              </Show>
              <Show when={!mentions()?.loading}>
                <div>
                  No registered pull requests. Ask the agent to register a PR it created or one you want it to take
                  over.
                </div>
              </Show>
            </div>
          }
        >
          <Show
            when={view() === "stack"}
            fallback={
              <PrList
                tracked={mentions()?.tracked ?? []}
                prs={mentions()?.prs ?? []}
                onOpen={(ref) => props.app.openPr(props.session, ref)}
              />
            }
          >
            <div class="ghp-pad">
              <Show when={ordered().some((pr) => pr.baseRefName === undefined)}>
                <div class="ghp-note">
                  This session's server runs an older gh-prs plugin, so stacks can't be drawn. Update the plugin there.
                </div>
              </Show>
              <Show when={graph()} fallback={<div class="ghp-muted">GitHub data for these PRs is unavailable.</div>}>
                {(source) => <ui.Markdown text={`\`\`\`mermaid\n${source()}\n\`\`\``} />}
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* Pull request                                                                                      */
/* ------------------------------------------------------------------------------------------------ */

export function PrView(props: { app: App; session: MountedSession; screen: SessionScreen; target: PrRef }) {
  const ctx = props.app.ctx
  const ui = ctx.ui
  const panel = usePanel()
  const key = prKey(props.target)
  const client = () => props.app.client(props.session)

  const [page, setPage] = createSignal<Page>(props.app.requestedPage(props.target)?.page ?? "overview")
  createEffect(
    on(
      () => props.app.requestedPage(props.target),
      (request) => request && setPage(request.page),
      { defer: true },
    ),
  )

  const [version, setVersion] = createSignal(0)
  const detail = createLatest(
    () => `${key}@${version()}`,
    () => client().detail(props.target),
  )
  const pr = () => detail.latest
  createEffect(() => {
    const value = pr()
    if (value) props.app.setTitle(props.target, value.title, value.checks)
  })

  const [filesWanted, setFilesWanted] = createSignal(false)
  const [filesVersion, setFilesVersion] = createSignal(0)
  createEffect(() => page() === "files" && setFilesWanted(true))
  const files = createLatest(
    () => (filesWanted() ? `${key}@${filesVersion()}` : undefined),
    () => client().files(props.target),
  )

  const [busy, setBusy] = createSignal(false)
  const refresh = () => {
    setVersion((value) => value + 1)
    if (filesWanted()) setFilesVersion((value) => value + 1)
  }
  const timer = setInterval(() => {
    if (panel.visible() && !busy() && !detail.loading && pr()?.state === "OPEN") setVersion((value) => value + 1)
  }, POLL_MS)
  onCleanup(() => clearInterval(timer))

  async function perform(action: PrAction, pending: string) {
    setBusy(true)
    const toast = ctx.toast.show({ variant: "loading", title: pending, persistent: true })
    try {
      const result = await client().act(props.target, action)
      toast.dismiss()
      ctx.toast.show({ variant: "success", title: result.message.split("\n")[0] || "Done" })
      refresh()
      void props.app.load(props.session, true)
      return true
    } catch (error) {
      toast.dismiss()
      ctx.toast.show({
        variant: "error",
        title: "GitHub refused the request",
        description: errorText(error),
        duration: 10_000,
      })
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="ghp" data-placement={panel.placement()}>
      <Switch>
        <Match when={pr()}>
          {(value) => (
            <>
              <Header
                app={props.app}
                session={props.session}
                pr={value()}
                busy={busy()}
                loading={detail.loading}
                onRefresh={refresh}
                perform={perform}
                page={page()}
                setPage={setPage}
              />
              <Show when={detail.error}>{<div class="ghp-error">Refresh failed: {errorText(detail.error)}</div>}</Show>
              <Switch>
                <Match when={page() === "overview"}>
                  <Overview app={props.app} pr={value()} />
                </Match>
                <Match when={page() === "checks"}>
                  <Checks app={props.app} session={props.session} screen={props.screen} pr={value()} />
                </Match>
                <Match when={page() === "comments"}>
                  <Comments
                    app={props.app}
                    session={props.session}
                    screen={props.screen}
                    pr={value()}
                    busy={busy()}
                    perform={perform}
                  />
                </Match>
                <Match when={page() === "files"}>
                  <Files
                    app={props.app}
                    session={props.session}
                    pr={value()}
                    files={files.latest}
                    loading={files.loading}
                    error={files.error}
                  />
                </Match>
              </Switch>
            </>
          )}
        </Match>
        <Match when={detail.error}>
          <div class="ghp-error">{errorText(detail.error)}</div>
          <div class="ghp-empty">
            <ui.Button icon="refresh" onClick={refresh}>
              Retry
            </ui.Button>
          </div>
        </Match>
        <Match when={true}>
          <div class="ghp-empty">
            <ui.Loader size="large" />
            <div>Loading {key}…</div>
          </div>
        </Match>
      </Switch>
    </div>
  )
}

function Header(props: {
  app: App
  session: MountedSession
  pr: PrDetail
  busy: boolean
  loading: boolean
  page: Page
  setPage: (page: Page) => void
  onRefresh: () => void
  perform: (action: PrAction, pending: string) => Promise<boolean>
}) {
  const ctx = props.app.ctx
  const ui = ctx.ui
  const choices = createMemo(() => mergeChoices(props.pr))
  const sections = createMemo(() => prSections(props.pr))

  async function choose(choice: MergeChoice) {
    if (choice.confirm) {
      const ok = await ctx.dialogs.confirm({
        title: choice.confirm.title,
        description: mergeStatusText(props.pr),
        confirm: choice.confirm.confirm,
        danger: choice.confirm.danger,
      })
      if (!ok) return
    }
    await props.perform(choice.action, choice.pending)
  }

  async function approve() {
    const ok = await ctx.dialogs.confirm({
      title: `Approve #${props.pr.number}?`,
      description: props.pr.title,
      confirm: "Approve",
    })
    if (ok) await props.perform({ type: "approve" }, "Approving…")
  }

  async function requestChanges() {
    const body = await ctx.dialogs.prompt({
      title: `Request changes on #${props.pr.number}`,
      placeholder: "What needs to change?",
      submit: "Request changes",
    })
    if (body) await props.perform({ type: "request-changes", body }, "Requesting changes…")
  }

  const menuEntries = (): UiMenuEntry[] =>
    choices().menu.map((entry): UiMenuEntry => {
      if (entry === "separator") return { type: "separator" }
      if ("group" in entry)
        return {
          type: "group",
          label: entry.group,
          items: entry.items.map((item) => ({ label: item.label, icon: item.icon, onSelect: () => void choose(item) })),
        }
      return { label: entry.label, icon: entry.icon, onSelect: () => void choose(entry) }
    })

  const mergeTone = () => {
    const pr = props.pr
    if (pr.state === "MERGED") return "ghp-tone-success"
    if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") return "ghp-tone-failure"
    if (["CLEAN", "HAS_HOOKS"].includes(pr.mergeStateStatus) || pr.isInMergeQueue || pr.autoMerge)
      return "ghp-tone-success"
    return "ghp-tone-pending"
  }

  return (
    <div class="ghp-head">
      <h2 class="ghp-title">
        {props.pr.title} <span class="ghp-num">#{props.pr.number}</span>
      </h2>
      <div class="ghp-meta">
        <StateLabel app={props.app} pr={props.pr} />
        <span>{props.pr.author}</span>
        <span class="ghp-branches">
          <ui.Tooltip value={props.pr.headRefName}>
            <span class="ghp-branch">{props.pr.headRefName}</span>
          </ui.Tooltip>
          <ui.Icon name="arrow-right" size="small" />
          <ui.Tooltip value={props.pr.baseRefName}>
            <span class="ghp-branch">{props.pr.baseRefName}</span>
          </ui.Tooltip>
        </span>
        <Diffstat additions={props.pr.additions} deletions={props.pr.deletions} />
        <span class="ghp-hide-narrow">· {relativeTime(props.pr.updatedAt)}</span>
      </div>
      <div class={`ghp-merge-status ${mergeTone()}`}>
        <ui.Icon
          name={
            mergeTone() === "ghp-tone-failure"
              ? "circle-x"
              : mergeTone() === "ghp-tone-success"
                ? "circle-check"
                : "circle-exclamation"
          }
          size="small"
        />
        <span>{mergeStatusText(props.pr)}</span>
      </div>
      <div class="ghp-actions">
        <Show when={choices().primary}>
          {(primary) => (
            <ui.Button
              variant="contrast"
              size="small"
              icon={primary().icon}
              busy={props.busy}
              onClick={() => void choose(primary())}
            >
              {primary().label}
            </ui.Button>
          )}
        </Show>
        <Show when={choices().menu.length > 1}>
          <ui.Menu
            label="More merge options"
            icon="chevron-down"
            trigger="icon"
            placement="bottom-start"
            disabled={props.busy}
            items={menuEntries()}
          />
        </Show>
        <Show when={canReview(props.pr)}>
          <ui.Button
            size="small"
            variant="neutral"
            icon="check-small"
            disabled={props.busy}
            onClick={() => void approve()}
          >
            Approve
          </ui.Button>
        </Show>
        <span class="ghp-spacer" />
        <ui.Tooltip value="Refresh">
          <ui.IconButton
            icon="refresh"
            label="Refresh"
            size="small"
            variant="ghost"
            busy={props.loading}
            onClick={props.onRefresh}
          />
        </ui.Tooltip>
        <ui.Menu
          label="More"
          icon="outline-dots"
          trigger="icon"
          placement="bottom-end"
          items={[
            {
              label: "Open on GitHub",
              icon: "square-arrow-top-right",
              onSelect: () => openUrl(props.app, props.session, props.pr.url),
            },
            { label: "Open in system browser", icon: "globe", onSelect: () => ctx.system.openExternal(props.pr.url) },
            { label: "Copy link", icon: "link", onSelect: () => void ctx.system.copy(props.pr.url) },
            { label: "Copy branch name", icon: "branch", onSelect: () => void ctx.system.copy(props.pr.headRefName) },
            { type: "separator" },
            ...(canReview(props.pr)
              ? [{ label: "Request changes…", icon: "comment" as const, onSelect: () => void requestChanges() }]
              : []),
            {
              label: "Mention in prompt",
              icon: "prompt",
              onSelect: () => {
                const composer = ctx.screen.current()?.composer
                composer?.insert(`${props.pr.url} `)
                composer?.focus()
              },
            },
          ]}
        />
      </div>
      <nav class="ghp-sections" aria-label="Pull request sections">
        <For each={sections()}>
          {(section) => (
            <button
              type="button"
              class="ghp-section-button"
              data-active={props.page === section.id ? "" : undefined}
              aria-current={props.page === section.id ? "page" : undefined}
              onClick={() => props.setPage(section.id)}
            >
              {section.label}{" "}
              <Show when={section.detail}>
                <span class="ghp-section-count" data-tone={section.tone}>
                  {section.detail}
                </span>
              </Show>
            </button>
          )}
        </For>
      </nav>
    </div>
  )
}

function Overview(props: { app: App; pr: PrDetail }) {
  const ui = props.app.ctx.ui
  const reviewers = createMemo(() => {
    const byAuthor = new Map<string, string>()
    for (const review of props.pr.latestReviews) byAuthor.set(review.author, review.state)
    for (const name of props.pr.reviewRequests) if (!byAuthor.has(name)) byAuthor.set(name, "REQUESTED")
    return [...byAuthor.entries()]
  })
  return (
    <div class="ghp-scroll ghp-pad">
      <dl class="ghp-facts">
        <dt>Review</dt>
        <dd>{reviewLabel(props.pr.reviewDecision) || "No review required"}</dd>
        <Show when={reviewers().length > 0}>
          <dt>Reviewers</dt>
          <dd>
            <For each={reviewers()}>
              {([name, state]) => {
                const status = state === "REQUESTED" ? "Review requested" : state.toLowerCase().replaceAll("_", " ")
                return (
                  <ui.Tooltip value={status}>
                    <span class="ghp-chip">
                      <span class="ghp-review-state" data-state={state} aria-hidden="true">
                        <ui.Icon
                          name={
                            state === "APPROVED"
                              ? "check-small"
                              : state === "CHANGES_REQUESTED"
                                ? "circle-x"
                                : "status-active"
                          }
                          size="small"
                        />
                      </span>
                      {name}
                      <span class="ghp-sr-only">, {status}</span>
                    </span>
                  </ui.Tooltip>
                )
              }}
            </For>
          </dd>
        </Show>
        <Show when={props.pr.labels.length > 0}>
          <dt>Labels</dt>
          <dd>
            <For each={props.pr.labels}>{(label) => <span class="ghp-chip">{label.name}</span>}</For>
          </dd>
        </Show>
        <dt>Changes</dt>
        <dd>
          <Diffstat additions={props.pr.additions} deletions={props.pr.deletions} /> in {props.pr.changedFiles} files
        </dd>
        <dt>Opened</dt>
        <dd>
          {relativeTime(props.pr.createdAt)} by {props.pr.author}
        </dd>
        <dt>Repository</dt>
        <dd class="ghp-mono">
          {props.pr.owner}/{props.pr.repo}
        </dd>
      </dl>
      <div class="ghp-section-title">Description</div>
      <Show when={props.pr.body.trim()} fallback={<div class="ghp-muted">No description provided.</div>}>
        {(body) => (
          <div class="ghp-body">
            <ui.Markdown text={body()} />
          </div>
        )}
      </Show>
    </div>
  )
}

function Checks(props: { app: App; session: MountedSession; screen: SessionScreen; pr: PrDetail }) {
  const ctx = props.app.ctx
  const ui = ctx.ui
  const counts = createMemo(() => props.pr.checkCounts ?? { ...checkCounts(props.pr.checkList), unknown: 0 })
  const total = createMemo(() => Object.values(counts()).reduce((sum, count) => sum + count, 0))
  const groups = createMemo(() => {
    const sorted = sortChecks(props.pr.checkList)
    return [
      { id: "failure", title: "Failing", items: sorted.filter((check) => check.state === "failure"), open: true },
      { id: "pending", title: "In progress", items: sorted.filter((check) => check.state === "pending"), open: true },
      {
        id: "success",
        title: "Passed",
        items: sorted.filter((check) => check.state === "success"),
        open: counts().failure === 0,
      },
      {
        id: "skipped",
        title: "Skipped or neutral",
        items: sorted.filter((check) => check.state === "skipped" || check.state === "neutral"),
        open: false,
      },
    ].filter((group) => group.items.length > 0)
  })
  const [toggled, setToggled] = createSignal<Record<string, boolean>>({})
  const isOpen = (group: { id: string; open: boolean }) => toggled()[group.id] ?? group.open

  const askAgent = () => {
    const failing = props.pr.checkList.filter((check) => check.state === "failure")
    const composer = ctx.screen.current()?.composer
    if (!composer) return
    composer.insert(
      `CI is failing on ${props.pr.url}${failing.length ? ` (${failing.map((check) => check.name).join(", ")})` : ""}. Investigate the failing checks and fix them.`,
    )
    composer.focus()
  }

  const attachCheck = (check: Check) => {
    const composer = ctx.screen.current()?.composer
    composer?.attach({
      type: "note",
      origin: ctx.id,
      commentID: crypto.randomUUID(),
      label: check.name,
      icon: "status",
      subject: `CI check "${check.name}"${check.workflow ? ` (${check.workflow})` : ""} is ${check.state} on ${props.pr.url}${check.url ? `. Details: ${check.url}` : ""}`,
      comment: "",
      href: check.url,
    })
    composer?.focus()
  }

  return (
    <>
      <div class="ghp-toolbar">
        <span class="ghp-grow ghp-muted" style={{ "font-size": "12px" }}>
          <Show when={counts().failure}>
            <span class="ghp-tone-failure">{counts().failure} failing</span> ·{" "}
          </Show>
          <Show when={counts().pending}>
            <span class="ghp-tone-pending">{counts().pending} in progress</span> ·{" "}
          </Show>
          {counts().success} passed · {counts().skipped + counts().neutral} skipped
        </span>
        <Show when={counts().failure > 0}>
          <ui.Button size="small" variant="neutral" icon="prompt" onClick={askAgent}>
            Ask agent to fix
          </ui.Button>
        </Show>
        <ui.Tooltip value="Checks on GitHub">
          <ui.IconButton
            icon="square-arrow-top-right"
            label="Checks on GitHub"
            size="small"
            variant="ghost"
            onClick={() => openUrl(props.app, props.session, `${prUrl(props.pr)}/checks`)}
          />
        </ui.Tooltip>
      </div>
      <div class="ghp-scroll">
        <Show when={total() > props.pr.checkList.length}>
          <div class="ghp-note">
            Showing {props.pr.checkList.length} of {total()} checks. Counts include all checks; open GitHub to see the
            remaining details.
          </div>
        </Show>
        <Show
          when={props.pr.checkList.length > 0}
          fallback={<div class="ghp-empty">No checks reported for {props.pr.headRefOid.slice(0, 7)}.</div>}
        >
          <For each={groups()}>
            {(group) => {
              const controls = `ghp-checks-${props.pr.owner}-${props.pr.repo}-${props.pr.number}-${group.id}`
              return (
                <>
                  <div class="ghp-group-head">
                    <button
                      type="button"
                      class="ghp-group-button"
                      aria-expanded={isOpen(group)}
                      aria-controls={controls}
                      onClick={() => setToggled({ ...toggled(), [group.id]: !isOpen(group) })}
                    >
                      <ui.Icon name={isOpen(group) ? "chevron-down" : "chevron-right"} size="small" />
                      {group.title} <span class="ghp-section-count">{group.items.length}</span>
                    </button>
                  </div>
                  <div id={controls}>
                    <Show when={isOpen(group)}>
                      <For each={group.items}>
                        {(check) => (
                          <div class="ghp-check">
                            <span
                              class={`ghp-tone-${check.state}`}
                              style={{ display: "inline-flex" }}
                              aria-hidden="true"
                            >
                              <ui.Icon name={checkIcon(check.state)} size="small" />
                            </span>
                            <div class="ghp-check-name">
                              <span class="ghp-ellipsis">
                                {check.name}
                                <span class="ghp-sr-only">, {checkStateLabel(check.state)}</span>
                              </span>
                              <small class="ghp-ellipsis">
                                {[check.workflow, check.description, duration(check)].filter(Boolean).join(" · ")}
                              </small>
                            </div>
                            <div class="ghp-check-actions">
                              <Show when={check.state === "failure" || check.state === "pending"}>
                                <ui.Tooltip value="Add to prompt">
                                  <ui.IconButton
                                    icon="prompt"
                                    label="Add to prompt"
                                    size="small"
                                    variant="ghost"
                                    onClick={() => attachCheck(check)}
                                  />
                                </ui.Tooltip>
                              </Show>
                              <Show when={check.url}>
                                {(url) => (
                                  <ui.Tooltip value="Open details">
                                    <ui.IconButton
                                      icon="square-arrow-top-right"
                                      label="Open details"
                                      size="small"
                                      variant="ghost"
                                      onClick={() => openUrl(props.app, props.session, url())}
                                    />
                                  </ui.Tooltip>
                                )}
                              </Show>
                            </div>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </>
              )
            }}
          </For>
        </Show>
      </div>
    </>
  )
}

type Entry =
  | { kind: "comment"; at: string; comment: IssueComment }
  | { kind: "review"; at: string; review: Review }
  | { kind: "thread"; at: string; thread: ReviewThread }

function Comments(props: {
  app: App
  session: MountedSession
  screen: SessionScreen
  pr: PrDetail
  busy: boolean
  perform: (action: PrAction, pending: string) => Promise<boolean>
}) {
  const ctx = props.app.ctx
  const ui = ctx.ui
  const prefs = ctx.stores.prefs
  const [draft, setDraft] = createSignal("")
  const [expanded, setExpanded] = createSignal<Record<number, boolean>>({})

  const entries = createMemo(() => {
    const showBots = prefs.value.showBots
    const list: Entry[] = [
      ...props.pr.comments.map((comment): Entry => ({ kind: "comment", at: comment.createdAt, comment })),
      ...props.pr.reviews
        .filter((review) => review.body.trim() || review.state === "APPROVED" || review.state === "CHANGES_REQUESTED")
        .map((review): Entry => ({ kind: "review", at: review.submittedAt, review })),
      ...props.pr.threads
        .filter((thread) => thread.comments.length > 0)
        .map((thread): Entry => ({ kind: "thread", at: thread.comments[0]!.createdAt, thread })),
    ]
    return list
      .filter((entry) => {
        const author =
          entry.kind === "comment"
            ? entry.comment.author
            : entry.kind === "review"
              ? entry.review.author
              : entry.thread.comments[0]!.author
        return showBots || !author.bot
      })
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  })
  const unresolved = createMemo(() => props.pr.threads.filter((thread) => !thread.isResolved).length)

  const quote = (text: string, subject: string) => {
    const composer = ctx.screen.current()?.composer
    if (!composer?.quotable()) return
    const commentID = crypto.randomUUID()
    composer.attach({
      type: "quote",
      commentID,
      text,
      source: { label: `#${props.pr.number}`, icon: "github", subject },
    })
    composer.focus(commentID)
  }

  const submit = async () => {
    const body = draft().trim()
    if (!body) return
    if (await props.perform({ type: "comment", body }, "Posting comment…")) setDraft("")
  }

  const CommentBody = (p: { comment: IssueComment; where: string }) => (
    <>
      <div class="ghp-entry-head">
        <b>{p.comment.author.login}</b>
        <Show when={p.comment.author.bot}>
          <span class="ghp-chip">bot</span>
        </Show>
        <span class="ghp-muted ghp-grow">{relativeTime(p.comment.createdAt)}</span>
        <ui.Menu
          label="Comment actions"
          icon="outline-dots"
          trigger="icon"
          placement="bottom-end"
          items={[
            {
              label: "Quote in prompt",
              icon: "outline-quote",
              onSelect: () =>
                quote(p.comment.body, `a comment by ${p.comment.author.login} ${p.where} on ${props.pr.url}`),
            },
            { label: "Copy link", icon: "link", onSelect: () => void ctx.system.copy(p.comment.url) },
            {
              label: "Open on GitHub",
              icon: "square-arrow-top-right",
              onSelect: () => openUrl(props.app, props.session, p.comment.url),
            },
          ]}
        />
      </div>
      <div class="ghp-body">
        <ui.Markdown text={p.comment.body || "_No text._"} />
      </div>
    </>
  )

  return (
    <>
      <div class="ghp-toolbar">
        <span class="ghp-grow ghp-muted" style={{ "font-size": "12px" }}>
          {entries().length} items · {unresolved()} unresolved threads
        </span>
        <ui.Switch
          label="Bots"
          checked={prefs.value.showBots}
          onChange={(value) => prefs.update((draft) => void (draft.showBots = value))}
        />
        <ui.Switch
          label="Resolved"
          checked={prefs.value.showResolved}
          onChange={(value) => prefs.update((draft) => void (draft.showResolved = value))}
        />
      </div>
      <div class="ghp-scroll">
        <Show when={entries().length > 0} fallback={<div class="ghp-empty">No conversation yet.</div>}>
          <For each={entries()}>
            {(entry, index) => (
              <div class="ghp-entry" data-bot={entry.kind === "comment" && entry.comment.author.bot ? "" : undefined}>
                <Switch>
                  <Match when={entry.kind === "comment" && entry.comment}>
                    {(comment) => <CommentBody comment={comment()} where="" />}
                  </Match>
                  <Match when={entry.kind === "review" && entry.review}>
                    {(review) => (
                      <>
                        <div class="ghp-entry-head">
                          <b>{review().author.login}</b>
                          <span class="ghp-review-state" data-state={review().state}>
                            {review().state === "APPROVED"
                              ? "approved"
                              : review().state === "CHANGES_REQUESTED"
                                ? "requested changes"
                                : "reviewed"}
                          </span>
                          <span class="ghp-muted">{relativeTime(review().submittedAt)}</span>
                        </div>
                        <Show when={review().body.trim()}>
                          <div class="ghp-body">
                            <ui.Markdown text={review().body} />
                          </div>
                        </Show>
                      </>
                    )}
                  </Match>
                  <Match when={entry.kind === "thread" && entry.thread}>
                    {(thread) => {
                      const open = () => expanded()[index()] ?? (!thread().isResolved || prefs.value.showResolved)
                      return (
                        <div class="ghp-thread">
                          <div
                            class="ghp-thread-head"
                            style={{ cursor: "pointer" }}
                            onClick={() => setExpanded({ ...expanded(), [index()]: !open() })}
                          >
                            <span class="ghp-chevron" data-open={open() ? "" : undefined}>
                              <ui.Icon name="chevron-right" size="small" />
                            </span>
                            <span class="ghp-mono ghp-ellipsis ghp-grow">
                              {thread().path}
                              {thread().line ? `:${thread().line}` : ""}
                            </span>
                            <Show when={thread().isOutdated}>
                              <span class="ghp-chip">outdated</span>
                            </Show>
                            <Show when={thread().isResolved}>
                              <span class="ghp-chip">resolved</span>
                            </Show>
                            <span class="ghp-muted">{thread().comments.length}</span>
                          </div>
                          <Show when={open()}>
                            <Show when={thread().diffHunk}>
                              <div class="ghp-file-body">
                                <ui.Code content={lastLines(thread().diffHunk, 8)} language="diff" />
                              </div>
                            </Show>
                            <For each={thread().comments}>
                              {(comment) => (
                                <div class="ghp-thread-comment">
                                  <CommentBody
                                    comment={comment}
                                    where={`on ${thread().path}${thread().line ? `:${thread().line}` : ""}`}
                                  />
                                </div>
                              )}
                            </For>
                          </Show>
                        </div>
                      )
                    }}
                  </Match>
                </Switch>
              </div>
            )}
          </For>
        </Show>
      </div>
      <Show when={props.pr.state !== "MERGED"}>
        <div class="ghp-composer">
          <textarea
            placeholder="Leave a comment (Markdown). ⌘/Ctrl+Enter to post."
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <div class="ghp-row" style={{ "justify-content": "flex-end" }}>
            <ui.Button
              size="small"
              variant="contrast"
              icon="comment"
              busy={props.busy}
              disabled={!draft().trim()}
              onClick={() => void submit()}
            >
              Comment
            </ui.Button>
          </div>
        </div>
      </Show>
    </>
  )
}

function lastLines(text: string, count: number) {
  const lines = text.split("\n")
  return lines.slice(Math.max(0, lines.length - count)).join("\n")
}

const AUTO_EXPAND_FILES = 12
const AUTO_EXPAND_LINES = 400

function Files(props: {
  app: App
  session: MountedSession
  pr: PrDetail
  files?: { files: PrFile[]; truncated: boolean }
  loading: boolean
  error: unknown
}) {
  const ctx = props.app.ctx
  const ui = ctx.ui
  const [filter, setFilter] = createSignal("")
  const [open, setOpen] = createSignal<Record<string, boolean>>({})
  const list = createMemo(() => {
    const query = filter().trim().toLowerCase()
    const all = props.files?.files ?? []
    return query ? all.filter((file) => file.filename.toLowerCase().includes(query)) : all
  })
  const lines = (file: PrFile) => (file.patch ? file.patch.split("\n").length : 0)
  const autoOpen = createMemo(() => (props.files?.files.length ?? 0) <= AUTO_EXPAND_FILES)
  const isOpen = (file: PrFile) => open()[file.filename] ?? (autoOpen() && lines(file) <= AUTO_EXPAND_LINES)
  const setAll = (value: boolean) => setOpen(Object.fromEntries(list().map((file) => [file.filename, value])))

  const openLocal = async (file: PrFile) => {
    const link = { href: file.filename, session: props.session, exact: true }
    if (await ctx.links.exists(link)) ctx.links.open(link)
    else
      ctx.toast.show({
        title: "Not in this workspace",
        description: `${file.filename} does not exist in ${props.session.directory}`,
      })
  }

  return (
    <>
      <div class="ghp-toolbar">
        <div class="ghp-grow">
          <ui.TextInput
            label="Filter files"
            placeholder="Filter files"
            type="search"
            value={filter()}
            onInput={setFilter}
          />
        </div>
        <ui.Tooltip value="Expand all">
          <ui.IconButton icon="expand" label="Expand all" size="small" variant="ghost" onClick={() => setAll(true)} />
        </ui.Tooltip>
        <ui.Tooltip value="Collapse all">
          <ui.IconButton
            icon="collapse"
            label="Collapse all"
            size="small"
            variant="ghost"
            onClick={() => setAll(false)}
          />
        </ui.Tooltip>
        <ui.Tooltip value="Files on GitHub">
          <ui.IconButton
            icon="square-arrow-top-right"
            label="Files on GitHub"
            size="small"
            variant="ghost"
            onClick={() => openUrl(props.app, props.session, `${prUrl(props.pr)}/files`)}
          />
        </ui.Tooltip>
      </div>
      <div class="ghp-scroll">
        <Switch>
          <Match when={props.files}>
            <Show when={props.files?.truncated}>
              <div class="ghp-note">Some patches are too large to show here. Open them on GitHub.</div>
            </Show>
            <For each={list()}>
              {(file) => (
                <div class="ghp-file">
                  <div class="ghp-file-head" onClick={() => setOpen({ ...open(), [file.filename]: !isOpen(file) })}>
                    <span class="ghp-chevron" data-open={isOpen(file) ? "" : undefined}>
                      <ui.Icon name="chevron-right" size="small" />
                    </span>
                    <span class="ghp-file-status" data-status={file.status} title={file.status}>
                      {file.status === "added"
                        ? "A"
                        : file.status === "removed"
                          ? "D"
                          : file.status === "renamed"
                            ? "R"
                            : "M"}
                    </span>
                    <span
                      class="ghp-mono ghp-ellipsis ghp-grow ghp-file-path"
                      title={file.previousFilename ? `${file.previousFilename} → ${file.filename}` : file.filename}
                    >
                      {file.filename}
                    </span>
                    <Diffstat additions={file.additions} deletions={file.deletions} />
                    <span onClick={(event) => event.stopPropagation()}>
                      <ui.Tooltip value="Open in workspace">
                        <ui.IconButton
                          icon="open-file"
                          label="Open in workspace"
                          size="small"
                          variant="ghost"
                          onClick={() => void openLocal(file)}
                        />
                      </ui.Tooltip>
                    </span>
                  </div>
                  <Show when={isOpen(file)}>
                    <div class="ghp-file-body">
                      <Show
                        when={file.patch}
                        fallback={
                          <div class="ghp-note">
                            {file.status === "removed" ? "File deleted." : "No textual diff (binary or too large)."}
                          </div>
                        }
                      >
                        {(patch) => (
                          <ui.Code
                            content={patch()}
                            language="diff"
                            class={languageOf(file.filename) ? `language-${languageOf(file.filename)}` : undefined}
                          />
                        )}
                      </Show>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Match>
          <Match when={props.error}>
            <div class="ghp-error">{errorText(props.error)}</div>
          </Match>
          <Match when={true}>
            <div class="ghp-empty">
              <ui.Loader size="large" />
              <div>Loading {props.pr.changedFiles} files…</div>
            </div>
          </Match>
        </Switch>
      </div>
    </>
  )
}
