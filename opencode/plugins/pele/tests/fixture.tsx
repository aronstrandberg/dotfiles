import { render } from "solid-js/web"
import { Show } from "solid-js"
import { Diagram } from "../src/diagram"
import { css } from "../src/styles"

const app = document.getElementById("app")
if (!app) throw new Error("Missing app element")
document.documentElement.style.setProperty("--font-family-sans", '"Arial", sans-serif')
document.documentElement.style.setProperty("--font-size-base", "14px")
const panes = new URLSearchParams(location.search).get("layout") === "panes"

render(
  () => (
    <>
      <style>{css}</style>
      <div
        class="fixture-shell"
        style={{
          display: "grid",
          "grid-template-columns": panes ? "160px 1fr 200px" : "1fr",
          height: "calc(100vh - 16px)",
        }}
      >
        <Show when={panes}>
          <aside>
            <button onClick={(event) => (event.currentTarget.textContent = "Left clicked")}>Left sidebar</button>
          </aside>
        </Show>
        <main data-slot="session-chat-panel" style={{ "min-width": "0", overflow: "hidden", position: "relative" }}>
          <div data-slot="session-timeline-scroll" style={{ overflow: "auto", height: "100%" }}>
            <Diagram
              code={new URLSearchParams(location.search).get("code") ?? "flowchart LR\n A[Draft] --> B[Published]"}
            />
          </div>
        </main>
        <Show when={panes}>
          <aside>
            <button onClick={(event) => (event.currentTarget.textContent = "Right clicked")}>Right sidebar</button>
          </aside>
        </Show>
      </div>
    </>
  ),
  app,
)
