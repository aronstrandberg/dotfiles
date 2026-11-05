import { expect, test } from "bun:test"
import type { Check, PrDetail } from "../rpc.ts"
import { prSections } from "./sections.ts"

test("empty pull requests still offer all four sections with explicit counts", () => {
  const pr = { checkList: [], comments: [], threads: [], reviews: [], changedFiles: 0 }

  const sections = prSections(pr)

  expect(sections).toEqual([
    { id: "overview", label: "Overview", detail: "", tone: "muted" },
    { id: "checks", label: "Checks", detail: "0", tone: "muted" },
    { id: "comments", label: "Comments", detail: "0", tone: "muted" },
    { id: "files", label: "Files", detail: "0", tone: "muted" },
  ])
})

test("failing checks take priority over running checks in the navigation", () => {
  const checkList: Check[] = [
    { name: "Build", state: "failure" },
    { name: "Lint", state: "failure" },
    { name: "Test", state: "pending" },
    { name: "Types", state: "success" },
  ]

  const sections = prSections({ checkList, comments: [], threads: [], reviews: [], changedFiles: 2 })

  expect(sections.find((section) => section.id === "checks")).toEqual({
    id: "checks", label: "Checks", detail: "2 failing", tone: "failure",
  })
  expect(sections.find((section) => section.id === "files")?.detail).toBe("2")
})

test("the check label follows running checks through completion", () => {
  const skipped: Check = { name: "Lint", state: "skipped" }
  const checkList: Check[] = [{ name: "Build", state: "pending" }, skipped]
  const pr = { checkList, comments: [], threads: [], reviews: [], changedFiles: 1 }

  const pending = prSections(pr).find((section) => section.id === "checks")
  const completed = prSections({ ...pr, checkList: [{ name: "Build", state: "success" }, skipped] }).find((section) => section.id === "checks")

  expect(pending).toEqual({ id: "checks", label: "Checks", detail: "1 running", tone: "pending" })
  expect(completed).toEqual({ id: "checks", label: "Checks", detail: "2", tone: "muted" })
})

test("conversation counts include text reviews but not empty approval events", () => {
  const author = { login: "reviewer", bot: false }
  const comment = { author, body: "A question", createdAt: "2026-10-29T12:00:00Z", url: "https://github.com/o/r/pull/1#issuecomment-1" }
  const reviews: PrDetail["reviews"] = [
    { author, body: "Approved with a note", state: "APPROVED", submittedAt: comment.createdAt, url: comment.url },
    { author, body: " \n ", state: "APPROVED", submittedAt: comment.createdAt, url: comment.url },
  ]
  const threads = [{ path: "src/index.ts", line: 1, isResolved: false, isOutdated: false, diffHunk: "", comments: [comment, comment] }]

  const sections = prSections({ checkList: [], comments: [comment], threads, reviews, changedFiles: 1 })

  expect(sections.find((section) => section.id === "comments")?.detail).toBe("3")
})
