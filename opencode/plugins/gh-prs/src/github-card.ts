/** Transient guidance for assistant cards supported by the active Desktop session. */
export const GITHUB_CARD_INSTRUCTION = `OpenCode Desktop can render GitHub pull request and Actions run cards. When your assistant answer mentions a concrete GitHub pull request or GitHub Actions run: Keep the ordinary explanatory prose and add a separate closed fenced code block for that item. Put exactly one reference per fence and do not put prose inside a fence.

For a pull request, use the language gh-pr and one canonical reference: https://github.com/owner/repo/pull/123, owner/repo#123, or #123 only when it belongs to the session directory's GitHub repository. Example:

\`\`\`gh-pr
owner/repo#123
\`\`\`

For a GitHub Actions run, use the language gh-run and its full canonical URL. Example:

\`\`\`gh-run
https://github.com/owner/repo/actions/runs/1234567890
\`\`\`

Always close the fence.`

/** Adds transient guidance for GitHub assistant cards to a model call. */
export function addGitHubCardInstruction(system: Array<{ type: "text"; text: string }>): void {
  system.push({ type: "text", text: GITHUB_CARD_INSTRUCTION })
}
