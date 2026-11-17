import { expect, test, type Page } from "@playwright/test"

const SIDEBAR = { width: 360, height: 900 }

const group = (page: Page, name: RegExp) => page.getByRole("region", { name })
const row = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text })

test("groups registered PRs by what they need, one line each, most urgent first", async ({ page }) => {
  await page.setViewportSize(SIDEBAR)
  await page.goto("/")

  await expect(page.getByRole("heading")).toHaveText([
    "Needs you1",
    "Blocked1",
    "Agent working1",
    "Waiting for CI1",
    "Done1",
  ])
  await expect(group(page, /Needs you/).getByRole("listitem")).toHaveText(/#457Update alert routing/)
  await expect(page.getByText("Unrelated PR mentioned in chat")).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath("pr-list.png"), fullPage: true })
})

test("the detail line shows CI when it needs attention, and the agent's note otherwise", async ({ page }) => {
  await page.goto("/")

  await expect(row(page, "Fix collector rollout")).toContainText("2 failing: lint-go, test-web · 3 still running")
  await expect(row(page, "Fix collector rollout")).toContainText("CI failing")
  await expect(row(page, "Roll the canary")).toContainText("5 running: bazel-test, e2e, deploy-preview, and 2 more")
  await expect(row(page, "Update alert routing")).toContainText("CI all green")
  await expect(row(page, "Update alert routing")).toContainText("Approve the production change")
  await expect(row(page, "#458")).toContainText("GitHub data unavailable")
  await expect(row(page, "#458")).toContainText("Waiting for the base PR")
})

test("merged PRs sit in a collapsed Done group whatever their last reported status", async ({ page }) => {
  await page.goto("/")
  const done = page.getByRole("button", { name: /Done/ })

  await expect(done).toHaveAttribute("aria-expanded", "false")
  await expect(page.getByText("Teammate's base PR")).toHaveCount(0)
  await done.click()
  await expect(row(page, "Teammate's base PR")).toContainText("Merged")
  await expect(row(page, "Teammate's base PR")).not.toContainText("failing")
})

test("a row opens its PR from the keyboard", async ({ page }) => {
  await page.goto("/")
  await row(page, "#458").getByRole("button").focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("status")).toHaveText("lovablelabs/lovable#458:overview")
})

test("rows use the app's base text size and never scroll sideways in a narrow sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 900 })
  await page.goto("/")

  const sizes = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector(".ghp-row-title") as Element).fontSize,
    detail: getComputedStyle(document.querySelector(".ghp-row-detail") as Element).fontSize,
  }))
  expect(sizes).toEqual({ title: "14px", detail: "13px" })
  const overflow = await page.locator(".ghp-scroll").evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(overflow).toBe(0)
})
