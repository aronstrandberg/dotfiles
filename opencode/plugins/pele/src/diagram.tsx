import { createEffect, createSignal, createUniqueId, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { mount } from "pele"
import DOMPurify from "dompurify"

/** Displays a Mermaid fence as a locally rendered diagram. */
export function Diagram(props: { readonly code: string }) {
  const [expanded, setExpanded] = createSignal(false)
  let origin: HTMLDivElement | undefined

  return (
    <>
      <div
        class="pele-inline"
        ref={(element) => {
          origin = element
        }}
      >
        <DiagramView
          code={props.code}
          action={{ label: "Expand diagram", icon: "expand", run: () => setExpanded(true) }}
        />
      </div>
      <Show when={expanded() && origin}>
        {(source) => <ExpandedDiagram code={props.code} source={source()} close={() => setExpanded(false)} />}
      </Show>
    </>
  )
}

function ExpandedDiagram(props: { readonly code: string; readonly source: HTMLElement; readonly close: () => void }) {
  let overlay: HTMLDivElement | undefined
  const close = () => overlay?.hidePopover()

  onMount(() => {
    const element = overlay
    if (!element) return
    const pane =
      props.source.closest(
        '[data-slot="session-chat-panel"], [data-slot="session-side-panel-content"], [data-slot="session-bottom-pane"]',
      ) ?? props.source
    let frame = 0
    let previous = ""
    const followPane = () => {
      const bounds = pane.getBoundingClientRect()
      if (
        !props.source.isConnected ||
        props.source.getClientRects().length === 0 ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) {
        close()
        return
      }
      const toolbarHeight = element.querySelector(".pele-toolbar")?.getBoundingClientRect().height ?? 0
      const sourceHeight = element.querySelector(".pele-source")?.getBoundingClientRect().height ?? 0
      const next = `${bounds.x},${bounds.y},${bounds.width},${bounds.height},${toolbarHeight},${sourceHeight}`
      if (next !== previous) {
        previous = next
        Object.assign(element.style, {
          left: `${bounds.x}px`,
          top: `${bounds.y}px`,
          width: `${bounds.width}px`,
          height: `${bounds.height}px`,
        })
        element.style.setProperty(
          "--pele-graph-max-height",
          `${Math.max(1, bounds.height * 0.8 - toolbarHeight - sourceHeight - 2)}px`,
        )
        element.style.setProperty("--pele-source-max-height", `${bounds.height * 0.24}px`)
      }
      frame = requestAnimationFrame(followPane)
    }
    followPane()
    element.showPopover()
    element.querySelector<HTMLButtonElement>("button")?.focus()
    onCleanup(() => {
      cancelAnimationFrame(frame)
      element.hidePopover()
    })
  })

  return (
    <Portal>
      <div
        class="pele-overlay"
        popover="auto"
        ref={(element) => {
          overlay = element
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
        on:toggle={(event) => {
          if (event.newState === "closed") props.close()
        }}
        on:keydown={(event) => {
          if (event.key !== "Escape") return
          event.preventDefault()
          event.stopPropagation()
          close()
        }}
      >
        <div class="pele-dialog" role="dialog" aria-label="Expanded diagram">
          <DiagramView code={props.code} action={{ label: "Close expanded diagram", icon: "close", run: close }} />
        </div>
      </div>
    </Portal>
  )
}

function DiagramView(props: {
  readonly code: string
  readonly action: { readonly label: string; readonly icon: "expand" | "close"; readonly run: () => void }
}) {
  let container: HTMLDivElement | undefined
  let diagram: ReturnType<typeof mount> | undefined

  onMount(() => {
    if (!container) return
    const fontSize = Number.parseFloat(getComputedStyle(container).fontSize)
    const mounted = mount(container, props.code, {
      links: false,
      images: false,
      padding: 28,
      fontSize: Number.isFinite(fontSize) ? fontSize : 14,
      zoom: { always: true, controls: false },
      onRender: () => {
        container?.querySelectorAll(".pele-node").forEach((node) => {
          const id = node.getAttribute("data-id") ?? ""
          const hash = Array.from(id).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0)
          node.setAttribute("data-pele-tone", String(hash % 4))
        })
      },
      sanitize: (svg) =>
        DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          RETURN_DOM_FRAGMENT: true,
        }),
    })
    diagram = mounted
    createEffect(() => mounted.update(props.code))
    onCleanup(() => mounted.destroy())
  })

  return (
    <section class="pele-card" aria-label="Mermaid diagram">
      <div class="pele-toolbar" role="group" aria-label="Diagram controls">
        <span class="pele-toolbar-spacer" />
        <Control label="Zoom out" icon="minus" run={() => diagram?.zoom?.zoomBy(1 / 1.1)} />
        <Control label="Zoom in" icon="plus" run={() => diagram?.zoom?.zoomBy(1.1)} />
        <Control label="Reset zoom" tooltip="Fit diagram" icon="fit" run={() => diagram?.zoom?.reset()} />
        <Control label={props.action.label} icon={props.action.icon} run={() => props.action.run()} />
      </div>
      <div
        class="pele-diagram"
        ref={(element) => {
          container = element
        }}
      />
      <details class="pele-source">
        <summary>Mermaid source</summary>
        <pre>
          <code>{props.code}</code>
        </pre>
      </details>
    </section>
  )
}

const iconPaths = {
  minus: "M5 12h14",
  plus: "M5 12h14M12 5v14",
  fit: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 8h8v8H8z",
  expand: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6",
  close: "M6 6l12 12M6 18L18 6",
}

function Control(props: {
  readonly label: string
  readonly tooltip?: string
  readonly icon: keyof typeof iconPaths
  readonly run: () => void
}) {
  const tooltipID = createUniqueId()
  return (
    <span class="pele-control">
      <button type="button" aria-label={props.label} aria-describedby={tooltipID} onClick={() => props.run()}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d={iconPaths[props.icon]} />
        </svg>
      </button>
      <span class="pele-tooltip" role="tooltip" id={tooltipID}>
        {props.tooltip ?? props.label}
      </span>
    </span>
  )
}
