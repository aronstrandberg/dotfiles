import { join } from "node:path"
import { Plugin } from "@opencode/plugin"
import { defaultChartDir, MPL_DEFAULT_THEME, MPL_LIGHT_THEME, type MplRenderInput } from "./render.ts"
import { mplTools } from "./tools.ts"

const options = { namespace: "mpl", codemode: true } as const

const renderInput = {
  type: "object",
  properties: {
    calls: {
      type: "array",
      description: '[method, [positional args], {kwargs}], e.g. ["bar", [names, values], { color: "C1" }]',
      items: { type: "array", minItems: 1, maxItems: 3 },
    },
    theme: {
      type: "string",
      description: `omit for the default (${MPL_DEFAULT_THEME}, dark; ${MPL_LIGHT_THEME} is light); any matplotlib style name is used as given`,
    },
    rc: { type: "object", description: 'rcParams overrides, e.g. { "figure.figsize": [9, 4] }' },
    grid: {
      type: "object",
      properties: {
        rows: { type: "integer", minimum: 1 },
        cols: { type: "integer", minimum: 1 },
        sharex: { type: ["boolean", "string"] },
        sharey: { type: ["boolean", "string"] },
        width_ratios: { type: "array", items: { type: "number" } },
        height_ratios: { type: "array", items: { type: "number" } },
      },
      required: ["rows", "cols"],
    },
    format: { type: "string", enum: ["png", "svg", "both"] },
    scale: { type: "number", minimum: 0.25, maximum: 4, description: "PNG pixel multiplier, default 2" },
    name: { type: "string", description: "file stem, such as latency-by-region" },
    tight_layout: { type: "boolean" },
  },
  required: ["calls"],
  additionalProperties: false,
} as const

const renderOutput = {
  type: "object",
  properties: {
    pngPath: { type: "string" },
    svgPath: { type: "string" },
    width: { type: "integer" },
    height: { type: "integer" },
    theme: { type: "string", description: "the theme the chart rendered in" },
    error: { type: "string", description: "the failing call index and what to fix" },
  },
  additionalProperties: false,
} as const

export default Plugin.define({
  id: "mpl",
  async setup(ctx) {
    const outDir = typeof ctx.options.outDir === "string" ? ctx.options.outDir : undefined
    const theme = typeof ctx.options.theme === "string" ? ctx.options.theme : undefined
    const tools = mplTools({
      outDir: () => (outDir ? join(outDir, new Date().toISOString().slice(0, 10)) : defaultChartDir()),
      ...(theme ? { theme } : {}),
    })

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "mpl",
        description:
          "Draw matplotlib charts (line, bar, scatter, hist, boxplot, pie, heatmap, dates, subplot grids) from data in a Code Mode script. Call tools.mpl.guide() once before the first chart.",
      })
      editor.add({
        name: "render",
        description:
          "Render a chart from a list of matplotlib Axes/Figure calls to PNG/SVG files. Read tools.mpl.guide() before the first chart. The PNG is attached to the execute result for you only; show it to the user with a Markdown image of pngPath in your reply. Returns { pngPath?, svgPath?, width?, height?, theme } or { error } naming the failing call; fix the spec and call again.",
        input: renderInput,
        output: renderOutput,
        options,
        // SAFETY: renderInput's JSON schema is validated by the host before execute, and replay.ts parses every call.
        execute: async (input) => tools.render.execute(input as MplRenderInput),
      })
      editor.add({
        name: "guide",
        description:
          "Return the mpl reference: spec shape, values ($dates, $rc, $ret), themes and colour slots, chart types and gotchas.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options,
        execute: async () => tools.guide.execute(),
      })
    })
  },
})
