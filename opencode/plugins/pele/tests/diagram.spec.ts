import { expect, test } from "@playwright/test"

test("clicking the dimmed area collapses the popup but clicking inside keeps it open", async ({ page }) => {
  await page.goto("/")
  const expand = page.getByRole("button", { name: "Expand diagram", exact: true })
  await expand.click()
  const popup = page.getByRole("dialog", { name: "Expanded diagram" })

  await popup.locator(".pele-diagram").click()
  await expect(popup).toBeVisible()
  await page.locator(".pele-overlay").click({ position: { x: 5, y: 5 } })

  await expect(popup).not.toBeVisible()
  await expect(page.locator(".pele-inline svg.pele")).toBeVisible()
  await expand.click()
  await expect(popup).toBeVisible()
})

test("tall graphs fit the capped popup without hiding controls or growing on zoom", async ({ page }) => {
  const code =
    "flowchart TB\n" +
    Array.from({ length: 25 }, (_, index) => `N${index}[Step ${index}] --> N${index + 1}[Step ${index + 1}]`).join("\n")
  await page.goto(`/?${new URLSearchParams({ code })}`)
  await page.getByRole("button", { name: "Expand diagram", exact: true }).click()
  const popup = page.getByRole("dialog", { name: "Expanded diagram" })
  await expect
    .poll(async () => {
      const box = await popup.boundingBox()
      const pane = await page.locator('[data-slot="session-chat-panel"]').boundingBox()
      const graph = await popup.locator("svg.pele").boundingBox()
      const canvas = await popup.locator(".pele-diagram").boundingBox()
      return (
        !!box &&
        !!pane &&
        !!graph &&
        !!canvas &&
        box.height <= pane.height * 0.8 + 1 &&
        graph.height <= canvas.height + 1
      )
    })
    .toBe(true)
  const before = await popup.boundingBox()
  await popup.getByRole("button", { name: "Zoom in", exact: true }).click()
  const after = await popup.boundingBox()
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 0)
  await popup.getByRole("button", { name: "Close expanded diagram" }).click()
  await expect(popup).not.toBeVisible()
})

test("popup height follows the graph instead of leaving a fixed-height empty area", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Expand diagram", exact: true }).click()
  const popup = page.getByRole("dialog", { name: "Expanded diagram" })
  const popupBounds = await popup.boundingBox()
  const graphBounds = await popup.locator("svg.pele").boundingBox()
  const paneBounds = await page.locator('[data-slot="session-chat-panel"]').boundingBox()
  if (!popupBounds || !graphBounds || !paneBounds) throw new Error("Missing diagram geometry")
  expect(popupBounds.height).toBeLessThan(graphBounds.height + 110)
  expect(popupBounds.y + popupBounds.height / 2).toBeCloseTo(paneBounds.y + paneBounds.height / 2, 0)
  const canvasBounds = await popup.locator(".pele-diagram").boundingBox()
  if (!canvasBounds) throw new Error("Missing diagram canvas")
  expect(graphBounds.x + graphBounds.width / 2).toBeCloseTo(canvasBounds.x + canvasBounds.width / 2, 0)
  expect(graphBounds.y + graphBounds.height / 2).toBeCloseTo(canvasBounds.y + canvasBounds.height / 2, 0)
})

test("inline graphs are centered horizontally and vertically inside their block", async ({ page }) => {
  await page.goto("/")

  await expect
    .poll(() =>
      page.locator(".pele-diagram").evaluate((container) => {
        const svg = container.querySelector("svg")
        if (!svg) return false
        const block = container.getBoundingClientRect()
        const graph = svg.getBoundingClientRect()
        return (
          Math.abs(graph.x + graph.width / 2 - block.x - block.width / 2) < 1 &&
          Math.abs(graph.y + graph.height / 2 - block.y - block.height / 2) < 1
        )
      }),
    )
    .toBe(true)
})

test("the popup uses ninety-five percent of the session pane and leaves both sidebars usable", async ({
  page,
}, testInfo) => {
  await page.goto("/?layout=panes")
  await page.getByRole("button", { name: "Expand diagram", exact: true }).click()
  const popup = page.getByRole("dialog", { name: "Expanded diagram" })
  const pane = page.locator('[data-slot="session-chat-panel"]')
  const paneBounds = await pane.boundingBox()
  const popupBounds = await popup.boundingBox()
  if (!paneBounds || !popupBounds) throw new Error("Missing popup or session pane")
  expect(popupBounds.width).toBeCloseTo(paneBounds.width * 0.95, 0)
  expect(popupBounds.x).toBeCloseTo(paneBounds.x + paneBounds.width * 0.025, 0)
  const overlay = await page.locator(".pele-overlay").boundingBox()
  expect(overlay).toEqual(paneBounds)
  await page.screenshot({ path: testInfo.outputPath("session-popup.png") })
  await page.locator(".fixture-shell").evaluate((element) => (element.style.gridTemplateColumns = "220px 1fr 260px"))
  await expect
    .poll(async () => {
      const resizedPane = await pane.boundingBox()
      const resizedPopup = await popup.boundingBox()
      if (!resizedPane || !resizedPopup) return false
      return (
        Math.abs(resizedPopup.width - resizedPane.width * 0.95) < 1 &&
        resizedPopup.x >= resizedPane.x &&
        resizedPopup.x + resizedPopup.width <= resizedPane.x + resizedPane.width
      )
    })
    .toBe(true)
  await page.getByRole("button", { name: "Left sidebar", exact: true }).click()
  await expect(page.getByRole("button", { name: "Left clicked" })).toBeVisible()
  await expect(popup).not.toBeVisible()
  await page.getByRole("button", { name: "Expand diagram", exact: true }).click()
  await page.getByRole("button", { name: "Right sidebar", exact: true }).click()
  await expect(page.getByRole("button", { name: "Right clicked" })).toBeVisible()
  await expect(popup).not.toBeVisible()
})

test("a popup closes when its originating session content is hidden", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Expand diagram", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Expanded diagram" })).toBeVisible()

  await page.locator(".pele-inline").evaluate((element) => (element.style.display = "none"))

  await expect(page.getByRole("dialog", { name: "Expanded diagram" })).not.toBeVisible()
})

test("zoom, fit, and expand stay together as icon controls with tooltips", async ({ page }) => {
  await page.goto("/")
  const fit = page.getByRole("button", { name: "Reset zoom", exact: true })
  const expand = page.getByRole("button", { name: "Expand diagram", exact: true })
  const fitBounds = await fit.boundingBox()
  const expandBounds = await expand.boundingBox()
  if (!fitBounds || !expandBounds) throw new Error("Missing controls")
  expect(expandBounds.x - fitBounds.x - fitBounds.width).toBeLessThanOrEqual(8)
  await expect(fit.locator("svg")).toBeVisible()
  await expect(expand.locator("svg")).toBeVisible()
  await fit.hover()
  await expect(page.getByRole("tooltip", { name: "Fit diagram", exact: true })).toBeVisible()
  await expand.hover()
  await expect(page.getByRole("tooltip", { name: "Expand diagram", exact: true })).toBeVisible()
})

test("the host Copy button cannot cover diagram controls in a narrow column", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto("/")
  await page.evaluate(() => {
    const card = document.querySelector(".pele-card")
    if (!(card instanceof HTMLElement)) throw new Error("Missing diagram")
    card.style.position = "relative"
    const copy = document.createElement("button")
    copy.textContent = "Copy"
    copy.style.cssText = "position:absolute;top:4px;right:4px;width:30px;height:30px;z-index:1"
    card.append(copy)
  })

  for (const name of ["Zoom in", "Zoom out", "Reset zoom", "Expand diagram"]) {
    await page.getByRole("button", { name, exact: true }).click({ trial: true })
  }
})

test("a diagram expands into a popup and Escape restores focus to its button", async ({ page }, testInfo) => {
  await page.goto("/")
  const expand = page.getByRole("button", { name: "Expand diagram", exact: true })

  await expand.click()

  const dialog = page.getByRole("dialog", { name: "Expanded diagram" })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator("svg.pele")).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds?.width).toBeGreaterThan(1000)
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click()
  await dialog.locator("svg.pele").focus()
  await page.screenshot({ path: testInfo.outputPath("expanded.png") })
  await page.keyboard.press("Escape")
  await expect(dialog).not.toBeVisible()
  await expect(expand).toBeFocused()
  await expand.click()
  await dialog.getByRole("button", { name: "Close expanded diagram" }).click()
  await expect(dialog).not.toBeVisible()
})

test("diagram labels match app typography and nodes have distinct accent colors", async ({ page }) => {
  await page.goto("/")

  const label = page.locator(".pele-node .pele-label").first()
  await expect(label).toHaveCSS("font-size", "14px")
  await expect(label).toHaveCSS("font-family", "Arial, sans-serif")
  const fills = await page
    .locator(".pele-node > rect")
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fill))
  expect(new Set(fills).size).toBeGreaterThan(1)
})

test("one zoom click enlarges the diagram by only ten percent", async ({ page }) => {
  await page.goto("/")
  const node = page.locator("svg.pele .pele-node").first()
  const before = await node.evaluate(async (element) => {
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    return element.getBoundingClientRect().width
  })

  await page.getByRole("button", { name: "Zoom in", exact: true }).click()

  await expect
    .poll(async () => (await node.evaluate((element) => element.getBoundingClientRect().width)) / before)
    .toBeCloseTo(1.1, 2)
})

test("a Mermaid flowchart is drawn instead of left as source", async ({ page }) => {
  await page.goto("/")

  await expect(page.locator("svg.pele-flowchart")).toBeVisible()
  await expect(page.locator("svg.pele")).toContainText("Draft")
  await expect(page.locator("svg.pele")).toContainText("Published")
})

test("diagrams follow app colors and fit narrow windows", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 })
  await page.goto("/")
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--v2-background-bg-layer-01", "rgb(24, 26, 32)")
    document.documentElement.style.setProperty("--v2-text-text-base", "rgb(224, 230, 240)")
  })

  await expect(page.locator(".pele-card")).toHaveCSS("background-color", "rgb(24, 26, 32)")
  await expect(page.locator(".pele-card")).toHaveCSS("color", "rgb(224, 230, 240)")
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})

test("the original Mermaid remains readable without replacing the diagram", async ({ page }) => {
  await page.goto("/")

  await page.getByText("Mermaid source", { exact: true }).click()

  await expect(page.locator("pre")).toContainText("A[Draft] --> B[Published]")
  await expect(page.locator("svg.pele")).toBeVisible()
})

for (const code of [
  "stateDiagram-v2\n [*] --> Draft\n Draft --> Published\n Published --> [*]",
  "sequenceDiagram\n participant Builder\n participant API\n Builder->>API: Publish\n API-->>Builder: Done",
  "classDiagram\n class Draft\n class Published\n Draft --> Published",
]) {
  test(`${code.split("\n")[0]} does not disappear when replacing the stock renderer`, async ({ page }) => {
    await page.goto(`/?${new URLSearchParams({ code })}`)

    await expect(page.locator("svg.pele")).toBeVisible()
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible()
  })
}

test("invalid diagram syntax leaves the original source available", async ({ page }) => {
  const code = "this is not a diagram <script>alert('unsafe')</script>"
  await page.goto(`/?${new URLSearchParams({ code })}`)

  await page.getByText("Mermaid source", { exact: true }).click()

  await expect(page.locator("pre")).toHaveText(code)
  await expect(page.locator(".pele-card script")).toHaveCount(0)
})

test("diagram labels cannot inject HTML and click directives cannot navigate", async ({ page }) => {
  const code = 'flowchart LR\n A["<img src=x onerror=alert(1)>"] --> B[Safe]\n click B "https://example.com/private"'
  await page.goto(`/?${new URLSearchParams({ code })}`)

  await expect(page.locator("svg.pele")).toBeVisible()
  await expect(page.locator(".pele-card img, .pele-card image, .pele-card script, .pele-card a")).toHaveCount(0)
  await expect(page.locator(".pele-card [onerror], .pele-card [onclick]")).toHaveCount(0)
})
