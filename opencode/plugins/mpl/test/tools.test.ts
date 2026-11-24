import assert from "node:assert/strict"
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { mplTools } from "../src/tools.ts"

const outDir = () => mkdtempSync(join(tmpdir(), "mpl-test-"))

test("a chart attaches its PNG as a data URI, which Code Mode forwards to the model, and returns the saved path", async () => {
  const dir = outDir()
  const tools = mplTools({ outDir: () => dir })

  const result = await tools.render.execute({
    name: "Latency by region",
    calls: [
      [
        "bar",
        [
          ["iad", "fra", "syd"],
          [42, 61, 180],
        ],
        { color: "C0" },
      ],
      ["set_title", ["p95 latency"]],
    ],
  })

  const file = result.content.find((part) => part.type === "file")
  assert.ok(file && file.type === "file")
  assert.equal(file.mime, "image/png")
  assert.match(file.uri, /^data:image\/png;base64,iVBORw0KGgo/)
  assert.ok(result.output.pngPath?.startsWith(join(dir, "latency-by-region-")))
  assert.ok(result.output.pngPath && existsSync(result.output.pngPath))
  assert.deepEqual([result.output.width, result.output.height], [1440, 840])
  assert.equal(result.output.theme, "catppuccin-macchiato")
})

test("a spec mistake returns the error to the script instead of failing the whole execute call", async () => {
  const tools = mplTools({ outDir })

  const result = await tools.render.execute({ calls: [["plot", [[1, 2]], { colour: "C0" }]] })

  assert.match(result.output.error ?? "", /calls\[0\] plot/)
  assert.equal(
    result.content.some((part) => part.type === "file"),
    false,
  )
})

test("svg-only output writes no PNG and attaches no image", async () => {
  const dir = outDir()
  const tools = mplTools({ outDir: () => dir })

  const result = await tools.render.execute({ format: "svg", calls: [["plot", [[1, 2, 3]]]] })

  assert.ok(result.output.svgPath && existsSync(result.output.svgPath))
  assert.equal(result.output.pngPath, undefined)
  assert.equal(
    result.content.some((part) => part.type === "file"),
    false,
  )
})

test("the configured default theme applies when a spec names none, and an explicit theme still wins", async () => {
  const tools = mplTools({ outDir, theme: "catppuccin-latte" })

  const implicit = await tools.render.execute({ calls: [["plot", [[1, 2]]]] })
  const explicit = await tools.render.execute({ theme: "pro-dark", calls: [["plot", [[1, 2]]]] })

  assert.equal(implicit.output.theme, "catppuccin-latte")
  assert.equal(explicit.output.theme, "pro-dark")
})

test("the guide names the render tool and every Figure method a spec may call", async () => {
  const tools = mplTools({ outDir })

  const guide = await tools.guide.execute()

  assert.match(guide.content, /tools\.mpl\.render/)
  assert.match(guide.content, /fig\.colorbar/)
  assert.doesNotMatch(guide.content, /\bpi\b|image\(/)
})
