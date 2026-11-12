import { expect, test, type Page } from "@playwright/test"

const SIDEBAR = { width: 360, height: 900 }

const item = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text })

test("lists only registered PRs, with CI failures separate from agent work status", async ({ page }) => {
  await page.setViewportSize(SIDEBAR)
  await page.goto("/")

  await expect(page.getByRole("listitem")).toHaveCount(5)
  const failing = item(page, "Fix collector rollout")
  await expect(failing).toContainText("lovablelabs/lovable#456OpenApproved")
  await expect(failing).toContainText("2 failing: lint-go, test-web · 3 still running")
  await expect(failing).not.toContainText("passed")
  await expect(failing).toContainText("Agent working")
  await expect(failing).toContainText("Fixing the failed lint checks")
  await expect(item(page, "Update alert routing")).toContainText("All green")
  await expect(item(page, "Update alert routing")).not.toContainText("skipped")
  await expect(item(page, "Roll the canary")).toContainText("5 running: bazel-test, e2e, deploy-preview, and 2 more")
  await expect(page.getByRole("list")).not.toContainText("Unrelated PR mentioned in chat")
  await page.screenshot({ path: test.info().outputPath("pr-list.png"), fullPage: true })

  await failing.getByRole("button", { name: "View CI checks for lovable#456" }).click()
  await expect(page.getByRole("status")).toHaveText("lovablelabs/lovable#456:checks")
})

test("keeps blockers and user actions visible when GitHub data is unavailable", async ({ page }) => {
  await page.goto("/")
  await expect(item(page, "Waiting for you")).toContainText("Approve the production change")
  const blocked = item(page, "Waiting for the base PR")
  await expect(blocked).toContainText("GitHub data unavailable")
  await blocked.getByRole("button", { name: "lovable#458", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("status")).toHaveText("lovablelabs/lovable#458:overview")
})

test("a merged dependency shows GitHub's merged state next to a stale blocked report, and no CI", async ({ page }) => {
  await page.goto("/")
  const dependency = item(page, "Teammate's base PR")
  await expect(dependency).toContainText("Merged")
  await expect(dependency).toContainText("Blocked")
  await expect(dependency).toContainText("Mikael owns this")
  await expect(dependency).not.toContainText("failing")
  await expect(dependency.getByRole("button", { name: /View CI checks/ })).toHaveCount(0)
})

test("a narrow sidebar wraps every line instead of scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 900 })
  await page.goto("/")

  const overflow = await page.locator(".ghp-scroll").evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(overflow).toBe(0)
})
