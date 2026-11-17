import { expect, test } from "@playwright/test"

const runUrl = "https://github.com/lovablelabs/lovable/actions/runs/12345"

test("mounted run card reserves loading height and content", async ({ page }) => {
  await page.goto("/?fixture=run-loading")
  const loading = page.getByLabel("Loading GitHub Actions run")

  await expect(loading).toContainText("Loading GitHub Actions run…")
  await expect(loading).toHaveCSS("min-height", "72px")
})

test("mounted run card shows every field and opens its URL through the system seam", async ({ page }) => {
  await page.goto("/?fixture=run-success")
  const card = page.getByRole("button", { name: /GitHub Actions workflow CI/ })

  await expect(card).toContainText("GitHub Actions #87 · Attempt 2")
  await expect(card).toContainText("CI")
  await expect(card).toContainText("lovablelabs/lovable")
  await expect(card).toContainText("feat/run-cards @ 0123456")
  await expect(card).toContainText("pull_request")
  await expect(card).toContainText("Success")
  await expect(card).toContainText("2m 5s")
  await card.click()
  await expect(page.getByRole("status")).toHaveText(runUrl)
})

test("mounted run card throws lookup errors so the host restores the original block", async ({ page }) => {
  await page.goto("/?fixture=run-error")
  const fallback = page.locator("[data-host-fallback=true]")

  await expect(fallback).toContainText(runUrl)
  await expect(fallback).toContainText("GitHub unavailable")
  await expect(page.locator(".ghp-card")).toHaveCount(0)
})
