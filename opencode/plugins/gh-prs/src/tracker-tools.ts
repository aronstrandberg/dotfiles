import type { createTracker } from "./tracker.ts"
import { parsePrRef, workStates } from "./work-status.ts"

type Context = { readonly sessionID: string }

const reference = {
  owner: { type: "string", description: "GitHub repository owner." },
  repo: { type: "string", description: "GitHub repository name." },
  number: { type: "integer", minimum: 1, description: "Pull request number." },
} as const
const input = {
  type: "object",
  properties: reference,
  required: ["owner", "repo", "number"],
  additionalProperties: false,
} as const
const options = { namespace: "ghprs", codemode: true } as const

/** Adapts agent tools to the tracker using the caller's session, never an input session ID. */
export function trackerTools(tracker: ReturnType<typeof createTracker>) {
  return {
    register: {
      name: "register",
      description:
        "Register a PR this session created, took over at the user's request, or waits on, such as another person's base PR that must merge first. Returns its saved work status. Preserves existing status on repeated calls. Does not register PRs merely read or discussed, and does not modify GitHub.",
      input,
      options,
      execute: async (value: unknown, context: Context) => ({
        content: JSON.stringify(await tracker.register(context.sessionID, parsePrRef(value))),
      }),
    },
    set_status: {
      name: "set_status",
      description:
        "Report a registered PR's current work status and next action or blocker. Returns the saved status with its update time. Report changes when starting work, waiting, or handing back to the user. This is session metadata, not a live agent heartbeat; it does not change CI or GitHub.",
      input: {
        type: "object",
        properties: {
          ...reference,
          state: { type: "string", enum: workStates },
          note: {
            type: "string",
            minLength: 1,
            maxLength: 1_000,
            description: "What is happening, what blocks progress, or the action needed from the user.",
          },
        },
        required: ["owner", "repo", "number", "state", "note"],
        additionalProperties: false,
      } as const,
      options,
      execute: async (value: unknown, context: Context) => ({
        content: JSON.stringify(await tracker.update(context.sessionID, value)),
      }),
    },
    list: {
      name: "list",
      description:
        "List this session's explicitly registered PRs and last reported work statuses. Does not scan chat links or fetch GitHub CI.",
      input: { type: "object", properties: {}, additionalProperties: false } as const,
      options,
      execute: async (_value: unknown, context: Context) => ({
        content: JSON.stringify(await tracker.list(context.sessionID)),
      }),
    },
    unregister: {
      name: "unregister",
      description:
        "Remove a PR and its work status from this session's tracker when it was registered by mistake or is no longer being tracked. Does not close or modify the PR on GitHub.",
      input,
      options,
      execute: async (value: unknown, context: Context) => {
        await tracker.unregister(context.sessionID, parsePrRef(value))
        return { content: "Removed from this session's PR tracker." }
      },
    },
  }
}
