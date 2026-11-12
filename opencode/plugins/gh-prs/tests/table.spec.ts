import { expect, test } from "@playwright/test"

test("shows only registered PRs, with CI failures separate from agent work status", async ({ page }) => {
  await page.goto("/")

  const table = page.getByRole("table")
  await expect(table.getByRole("columnheader")).toHaveText(["Pull request", "CI", "Review", "Work status"])
  await expect(table.getByRole("row")).toHaveCount(5)
  const failing = table.getByRole("row").filter({ hasText: "Fix collector rollout" })
  await expect(failing).toContainText("2 failing")
  await expect(failing).toContainText("3 running / queued")
  await expect(failing).toContainText("150 passed")
  await expect(failing).toContainText("Agent working")
  await expect(table).not.toContainText("Unrelated PR mentioned in chat")
  await page.screenshot({ path: test.info().outputPath("pr-table.png"), fullPage: true })

  await failing.getByRole("button", { name: "View CI checks for lovable#456" }).click()
  await expect(page.getByRole("status")).toHaveText("lovablelabs/lovable#456:checks")
})

test("keeps blockers and user actions visible when GitHub data is unavailable", async ({ page }) => {
  await page.goto("/")
  const waiting = page.getByRole("row").filter({ hasText: "Waiting for you" })
  await expect(waiting).toContainText("Approve the production change")
  const blocked = page.getByRole("row").filter({ hasText: "Waiting for the base PR" })
  await expect(blocked).toContainText("Unavailable")
  await expect(blocked).toContainText("Waiting for the base PR")
  await blocked.getByRole("button", { name: "lovable#458", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("status")).toHaveText("lovablelabs/lovable#458:overview")
})

test("a merged dependency shows GitHub's merged state next to a stale blocked report", async ({ page }) => {
  await page.goto("/")
  const dependency = page.getByRole("row").filter({ hasText: "Teammate's base PR" })
  await expect(dependency).toContainText("Merged")
  await expect(dependency).toContainText("Blocked")
  await expect(dependency).toContainText("Mikael owns this")
})

test("a narrow panel scrolls the table without making the page wider", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")

  const dimensions = await page.locator(".ghp-scroll").evaluate((element) => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    tableWidth: element.scrollWidth,
    panelWidth: element.clientWidth,
  }))
  expect(dimensions.pageWidth).toBe(dimensions.viewport)
  expect(dimensions.tableWidth).toBeGreaterThan(dimensions.panelWidth)
})
