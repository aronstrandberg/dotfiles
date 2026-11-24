import { mplInstructions } from "./guide.ts"
import { MPL_DEFAULT_THEME, renderChart, type MplRenderInput } from "./render.ts"

type Content =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }

/** What a script gets back from `tools.mpl.render`: the files written, or the error to fix. */
export interface RenderOutput {
  readonly pngPath?: string
  readonly svgPath?: string
  readonly width?: number
  readonly height?: number
  readonly theme?: string
  readonly error?: string
}

export interface MplToolsOptions {
  /** Directory for this call's files; read on every call so a long-lived server moves to the new day's folder. */
  readonly outDir?: () => string
  /** Theme for a spec that names none. */
  readonly theme?: string
}

/**
 * Executors for the `mpl` Code Mode namespace, independent of the plugin API so tests call them directly.
 *
 * A PNG goes back as a `data:` file part: Code Mode attaches file parts from nested tool calls to the `execute`
 * result, so the model and the timeline see the chart without a separate image step.
 */
export function mplTools(options: MplToolsOptions = {}) {
  return {
    render: {
      async execute(
        input: MplRenderInput,
      ): Promise<{ readonly content: readonly Content[]; readonly output: RenderOutput }> {
        try {
          const out = renderChart(
            { ...input, theme: input.theme ?? options.theme ?? MPL_DEFAULT_THEME },
            options.outDir?.(),
          )
          const name = out.pngPath?.split("/").at(-1)
          const image: Content[] = out.png
            ? [
                {
                  type: "file",
                  uri: `data:image/png;base64,${Buffer.from(out.png).toString("base64")}`,
                  mime: "image/png",
                  ...(name ? { name } : {}),
                },
              ]
            : []
          const paths = [out.pngPath, out.svgPath].filter(Boolean).join("\n")
          return {
            content: [...image, { type: "text", text: paths }],
            output: {
              ...(out.pngPath ? { pngPath: out.pngPath } : {}),
              ...(out.svgPath ? { svgPath: out.svgPath } : {}),
              ...(out.width === undefined ? {} : { width: out.width, height: out.height }),
              theme: out.theme,
            },
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { content: [{ type: "text", text: `mpl.render failed: ${message}` }], output: { error: message } }
        }
      },
    },
    guide: {
      async execute(): Promise<{ readonly content: string }> {
        return { content: mplInstructions }
      },
    },
  }
}
