import type { PrSummary } from "./rpc.ts"

const TITLE_LIMIT = 45

type Tone = "green" | "red" | "running" | "merged" | "closed" | "none"

function tone(pr: PrSummary): Tone {
  if (pr.state === "MERGED") return "merged"
  if (pr.state === "CLOSED") return "closed"
  switch (pr.ci?.kind) {
    case "green":
      return "green"
    case "red":
      return "red"
    case "running":
      return "running"
    default:
      return "none"
  }
}

function shorten(title: string) {
  if (title.length <= TITLE_LIMIT) return title
  const cut = title.slice(0, TITLE_LIMIT)
  const space = cut.lastIndexOf(" ")
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`
}

function label(text: string) {
  return `"${text.replaceAll("#", "#35;").replaceAll('"', "#quot;")}"`
}

/**
 * Mermaid source for the stacks the PRs form: each PR points from the PR whose head branch it targets, or from its base
 * branch when no listed PR owns that branch.
 *
 * Branches are matched within one repository. Returns `undefined` for an empty list.
 */
export function stackMermaid(prs: readonly PrSummary[]): string | undefined {
  if (prs.length === 0) return undefined
  const repositories = new Set(prs.map((pr) => `${pr.owner}/${pr.repo}`))
  const branchKey = (pr: PrSummary, branch: string) => `${pr.owner}/${pr.repo}:${branch}`
  const heads = new Map<string, string>()
  prs.forEach((pr, index) => {
    const key = branchKey(pr, pr.headRefName)
    if (!heads.has(key)) heads.set(key, `p${index}`)
  })

  const lines = ["flowchart BT"]
  const bases = new Map<string, string>()
  const edges: string[] = []
  prs.forEach((pr, index) => {
    const id = `p${index}`
    lines.push(`  ${id}[${label(`#${pr.number} ${shorten(pr.title)}`)}]`)
    const base = pr.baseRefName
    if (!base) return
    const parent = heads.get(branchKey(pr, base))
    if (parent && parent !== id) {
      edges.push(`  ${parent} --> ${id}`)
      return
    }
    const key = branchKey(pr, base)
    let node = bases.get(key)
    if (!node) {
      node = `b${bases.size}`
      bases.set(key, node)
      lines.push(`  ${node}[${label(repositories.size > 1 ? `${pr.repo}: ${base}` : base)}]`)
      lines.push(`  class ${node} base`)
    }
    edges.push(`  ${node} --> ${id}`)
  })
  lines.push(...edges)
  prs.forEach((pr, index) => {
    const value = tone(pr)
    if (value !== "none") lines.push(`  class p${index} ${value}`)
  })
  lines.push(
    "  classDef base stroke-dasharray:4 3",
    "  classDef green stroke:#2da44e,stroke-width:2px",
    "  classDef red stroke:#cf222e,stroke-width:2px",
    "  classDef running stroke:#bf8700,stroke-width:2px",
    "  classDef merged stroke:#8250df,stroke-width:2px",
    "  classDef closed stroke-dasharray:2 2",
  )
  return lines.join("\n")
}
