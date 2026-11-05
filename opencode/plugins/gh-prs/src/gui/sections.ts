import type { PrDetail } from "../rpc.ts"
import { checkCounts } from "../shared.ts"
import type { Page } from "./state.ts"

type SectionInput = Pick<PrDetail, "checkList" | "comments" | "threads" | "reviews" | "changedFiles">

type Section = {
  readonly id: Page
  readonly label: string
  readonly detail: string
  readonly tone: "muted" | "failure" | "pending"
}

/** Projects PR activity into the labels and counts shown by the section navigation. */
export function prSections(pr: SectionInput): readonly Section[] {
  const counts = checkCounts(pr.checkList)
  const checks: Section = counts.failure > 0
    ? { id: "checks", label: "Checks", detail: `${counts.failure} failing`, tone: "failure" }
    : counts.pending > 0
      ? { id: "checks", label: "Checks", detail: `${counts.pending} running`, tone: "pending" }
      : { id: "checks", label: "Checks", detail: String(pr.checkList.length), tone: "muted" }
  return [
    { id: "overview", label: "Overview", detail: "", tone: "muted" },
    checks,
    { id: "comments", label: "Comments", detail: String(pr.comments.length + pr.threads.length + pr.reviews.filter((review) => review.body.trim()).length), tone: "muted" },
    { id: "files", label: "Files", detail: String(pr.changedFiles), tone: "muted" },
  ]
}
