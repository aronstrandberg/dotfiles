/** Renders an mpl chart spec to PNG/SVG files. No OpenCode imports, so tests drive it directly. */
import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { availableStyles, composeStyles, registerColormapRgba, registerColormaps, registerFonts } from "mpl"
import { allColormaps } from "mpl/colormaps/all"
import { allColormapRgba } from "mpl/colormaps/all.rgba"
import { allFonts } from "mpl/fonts/all"
import { buildFigure, type MplCall, type MplGrid, type MplRcLookup } from "./replay.ts"
import { THEMES } from "./themes.ts"

registerFonts(...allFonts)
registerColormaps(...allColormaps)
registerColormapRgba(...allColormapRgba)

type LocalTheme = keyof typeof THEMES

/** The dark theme, used when a spec names none. */
export const MPL_DEFAULT_THEME: LocalTheme = "catppuccin-macchiato"
/** Macchiato's light twin, with the same layout and cycle order. */
export const MPL_LIGHT_THEME: LocalTheme = "catppuccin-latte"

/** Hi-dpi by default: 2x pixels, 1440x840 at the themes' 7.2x4.2 in figure size. */
export const MPL_DEFAULT_SCALE = 2
/** Every accepted theme name: local ones first, then mpl's bundled styles (pro-slate, pro-dark, ggplot, ...). */
export const MPL_THEMES: readonly string[] = [
  ...Object.keys(THEMES),
  ...availableStyles().filter((s) => s !== "default"),
  "default",
]

type MplStyleSpec = Parameters<typeof composeStyles>[0][number]

/** A theme as subplots() takes it (`style`) and as composeStyles() takes it (`layers`, for {"$rc": key} lookups). */
interface MplThemeStyle {
  readonly style: unknown
  readonly layers: readonly MplStyleSpec[]
}

function isLocalTheme(theme: string): theme is LocalTheme {
  return Object.hasOwn(THEMES, theme)
}

function themeStyle(theme: string): MplThemeStyle {
  if (isLocalTheme(theme)) return { style: THEMES[theme], layers: [{ kind: "text", text: THEMES[theme] }] }
  if (theme === "default") return { style: [], layers: [] }
  if (!MPL_THEMES.includes(theme)) throw new Error(`unknown theme "${theme}"; use one of ${MPL_THEMES.join(", ")}`)
  return { style: theme, layers: [{ kind: "bundled", name: theme }] }
}

/** {"$rc": key} lookup over the theme plus the spec's rc overrides, as matplotlib's rcParams after style.use + rcParams.update. */
function rcLookup(
  theme: string,
  { layers }: MplThemeStyle,
  rc: Readonly<Record<string, unknown>> | undefined,
): MplRcLookup {
  let merged: ReadonlyMap<string, unknown> | undefined
  return (key) => {
    if (rc && Object.hasOwn(rc, key)) return rc[key]
    if (!merged) {
      const result = composeStyles(layers)
      if (!result.ok) throw new Error(`theme "${theme}": cannot read its rc values`)
      merged = result.value
    }
    return merged.get(key)
  }
}

/** One chart request, as the agent's Code Mode script passes it to `mpl.render`. */
export interface MplRenderInput {
  readonly theme?: string
  readonly rc?: Readonly<Record<string, unknown>>
  readonly grid?: MplGrid
  readonly calls: readonly MplCall[]
  readonly format?: "png" | "svg" | "both"
  /** PNG pixel multiplier (hi-dpi). Default MPL_DEFAULT_SCALE. */
  readonly scale?: number
  /** File stem, such as "latency-by-region". */
  readonly name?: string
  /** Run fig.tight_layout() after the calls. Default true unless the calls already lay out the figure. */
  readonly tight_layout?: boolean
}

/** The files a render wrote, and the PNG bytes when it drew one. */
export interface MplRenderOutput {
  readonly png?: Uint8Array
  readonly pngPath?: string
  readonly svgPath?: string
  readonly width?: number
  readonly height?: number
  readonly theme: string
}

/** Default output directory: ~/.local/share/opencode/charts/<YYYY-MM-DD>. */
export function defaultChartDir(now = new Date()): string {
  return join(homedir(), ".local", "share", "opencode", "charts", now.toISOString().slice(0, 10))
}

function fileStem(name: string | undefined, now: Date): string {
  const slug =
    (name ?? "chart")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "chart"
  return `${slug}-${now.toISOString().slice(11, 19).replaceAll(":", "")}`
}

/** PNG width and height from the IHDR chunk. */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/**
 * Draws the spec and writes the requested files to `outDir`.
 *
 * @throws MplSpecError for a malformed call list, and mpl's own errors for unknown kwargs or rc keys.
 */
export function renderChart(input: MplRenderInput, outDir = defaultChartDir()): MplRenderOutput {
  const theme = input.theme ?? MPL_DEFAULT_THEME
  const scale = input.scale ?? MPL_DEFAULT_SCALE
  if (!(scale >= 0.25 && scale <= 4)) throw new Error(`scale must be between 0.25 and 4, got ${scale}`)
  const style = themeStyle(theme)
  const fig = buildFigure({
    style: style.style,
    rc: input.rc,
    grid: input.grid,
    calls: input.calls,
    rcParam: rcLookup(theme, style, input.rc),
  })
  const laidOut = input.calls.some((c) => c[0] === "fig.tight_layout" || c[0] === "fig.subplots_adjust")
  if (input.tight_layout ?? !laidOut) fig.tight_layout()

  const format = input.format ?? "png"
  const now = new Date()
  const stem = fileStem(input.name, now)
  mkdirSync(outDir, { recursive: true })

  let png: Uint8Array | undefined
  let pngPath: string | undefined
  let svgPath: string | undefined
  if (format !== "svg") {
    png = fig.toPNGSync({ scale })
    pngPath = join(outDir, `${stem}.png`)
    writeFileSync(pngPath, png)
  }
  if (format !== "png") {
    svgPath = join(outDir, `${stem}.svg`)
    writeFileSync(svgPath, fig.toSVG())
  }
  return { png, pngPath, svgPath, theme, ...(png ? pngSize(png) : {}) }
}
