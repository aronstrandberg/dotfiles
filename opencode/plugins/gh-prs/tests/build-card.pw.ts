import { expect, test } from "@playwright/test"

const buildUrl = "https://buildkite.com/lovable/deploy-production/builds/42"

test("mounted build card reserves loading height", async ({ page }) => {
  await page.goto("/?fixture=build-loading")
  const loading = page.getByLabel("Loading Buildkite build")

  await expect(loading).toContainText("Loading Buildkite build…")
  await expect(loading).toHaveCSS("min-height", "72px")
})

test("mounted build card shows every field, textual state, capped failures, and opens its address", async ({
  page,
}) => {
  await page.goto("/?fixture=build-success")
  const card = page.getByRole("button", { name: /Buildkite pipeline deploy-production, build #42/ })

  await expect(card).toContainText("Buildkite · lovable")
  await expect(card).toContainText("deploy-production #42")
  await expect(card).toContainText("Deploy the API")
  await expect(card).not.toContainText("extra detail")
  await expect(card).toContainText("main @ 0123456")
  await expect(card).toContainText("Failing")
  await expect(card).toContainText("Failed: lint, test, deploy, +2 more")
  await card.click()
  await expect(page.getByRole("status")).toHaveText(buildUrl)
})

test("mounted build card throws lookup errors so the host restores the original block", async ({ page }) => {
  await page.goto("/?fixture=build-error")
  const fallback = page.locator("[data-host-fallback=true]")

  await expect(fallback).toContainText(`${buildUrl}#job-id`)
  await expect(fallback).toContainText("Ratchet unavailable")
  await expect(page.locator(".ghp-card")).toHaveCount(0)
})

test("mounted build card treats a null RPC payload as malformed and restores the original block", async ({ page }) => {
  await page.goto("/?fixture=build-null")
  const fallback = page.locator("[data-host-fallback=true]")

  await expect(fallback).toContainText(`${buildUrl}#job-id`)
  await expect(fallback).toContainText("Invalid Buildkite build summary RPC output")
  await expect(page.locator(".ghp-card")).toHaveCount(0)
})
