import { MPL_DEFAULT_THEME, MPL_LIGHT_THEME } from "./render.ts"
import { MPL_FIGURE_METHODS } from "./replay.ts"

const PIE_GUIDE = `Pie: ["pie", [values], { labels, colors, autopct: "%1.0f%%", explode, startangle: 90, counterclock, shadow, radius, labeldistance, pctdistance, wedgeprops: { width: 0.4, edgecolor: {"$rc": "figure.facecolor"}, linewidth: 1.5 }, textprops: { fontsize, color, fontweight }, rotatelabels, normalize }]. wedgeprops.width makes a donut; an edgecolor matching the background separates wedges. autopct is a printf string only (no callables). normalize: false with sum <= 1 draws a partial pie. frame: true and hatch throw. pie sets equal aspect and hides the axes.
Pie text colours: pie's textprops styles names and autopct percentages alike, and the theme's text colour is hard to read on filled wedges. So draw the pie (call i) with labels and no autopct, then add the values with ["pie_label", [{"$ret": i}, "{frac:.0%}"], { distance: 0.6, textprops: { color: {"$rc": "figure.facecolor"}, fontweight: "bold" } }] (use distance: 0.8 for a 0.4-wide donut). pie_label's labels is a str.format template with {absval} and {frac} fields (e.g. "{absval:,d} ({frac:.0%})") or a list of strings, one per wedge; alignment "auto" | "outer" | "center", rotate. {absval:d} needs whole-number values; if any value has a fraction use {absval} or {absval:.1f}. Each pie_label call has its own textprops.`

/** The reference the model reads before its first chart, returned by `tools.mpl.guide()`. */
export const mplInstructions = `Reference for tools.mpl.render. mpl is a pixel-exact TypeScript port of matplotlib 3.11: calls follow matplotlib's object API (ax.<method>(*args, **kwargs)), kwargs and rc keys included.

Spec: { calls, theme?, rc?, grid?, format?, scale?, name?, tight_layout? }
- calls: [method, [positional args], {kwargs}], applied in order to the current Axes. ax.plot(x, y, 'o-', label='a') is ["plot", [x, y, "o-"], { label: "a" }].
- grid: { rows, cols, sharex?, sharey?, width_ratios?, height_ratios? }. Axes are numbered row-major from 0; ["sca", [i]] makes Axes i current; ["twinx", []] adds a twin and makes it current.
- Figure calls take a "fig." prefix: ${[...MPL_FIGURE_METHODS].map((m) => `fig.${m}`).join(", ")}. fig.colorbar maps the last imshow or colour-mapped scatter on the current Axes.
- Values: {"$float": "nan"} is NaN. Kwarg {"$transform": "axes"} is ax.transAxes. A positional {"$ret": i} is the value calls[i] returned (e.g. pie's container). {"$rc": key} anywhere in args or kwargs is the active theme's rcParams[key], e.g. {"$rc": "figure.facecolor"} for the background.
- theme: omit it for the default, "${MPL_DEFAULT_THEME}" (dark), unless the plugin options set another. "${MPL_LIGHT_THEME}" is its light twin. Name another only when asked: "pro-slate" (light), "pro-dark", or any matplotlib style name; it is used as given. rc overrides keys, e.g. { "figure.figsize": [9, 4] }.
- scale: PNG pixel multiplier from 0.25 to 4, default 2 (1440x840 at the default size); 3 for print.
- format: "png" (default), "svg", or "both". Files land in ~/.local/share/opencode/charts/<date>/ unless the plugin options set outDir; tight_layout runs unless the calls lay out the figure.

Dates:
- {"$dates": ["2026-01-01", ...]} is Date[], {"$date": "..."} one Date; naive ISO strings are UTC. plot, bar, text, axvline and fill_between take them.
- Ticks: ["$concise_x", []] for ConciseDateFormatter, or ["$date_x", ["MonthLocator", { interval: 1 }, "%b %d" | "concise"]].
- annotate takes epoch days (ms / 86400000) as coordinates.

Colours: the theme can be dark or light, so never hardcode hex. Both Catppuccin themes share the cycle C0..C7 = blue, mauve, green, peach, red, teal, yellow, pink; name those slots (C4 for red/bad, C2 for green/good). Background {"$rc": "figure.facecolor"}, text {"$rc": "text.color"}, muted text {"$rc": "axes.labelcolor"}, gridline grey {"$rc": "grid.color"}.

Chart types: line, step, scatter, bar/barh (bottom/left for stacks), hist, boxplot, errorbar, fill_between/fill_betweenx, imshow + fig.colorbar, pie, axhline/axvline/axhspan/axvspan, text, annotate. For shares of a whole with up to ~6 parts use pie (or a donut); with more parts, or to compare shares, use barh. For distributions use hist or boxplot; for legend placement use loc and ncols.

${PIE_GUIDE}

Gotchas:
- Unknown kwargs and rc keys throw, as in matplotlib; the error names the call index and the offending key.
- Scatter legend: label a proxy ["plot", [[], [], "o"], { color: "C0", label: "name" }] rather than the scatter.
- Text: Latin, Greek, arrows and math symbols; use ASCII for tree labels and ~ for approximations.
- Ticks with labels: ["set_xticks", [ticks, labels], { fontsize, color, fontweight, rotation, ha }]; there are no minor ticks.
- fill_between / fill_betweenx take where (bool mask), interpolate, and step: "pre" | "post" | "mid" (match the step() line's where) besides colour, alpha, edgecolor, linestyle and label.
- ["set_axis_off", []] (or ["axis", ["off"]]) hides ticks, spines and grid, e.g. for annotation-only panels.
- fig.suptitle: tight_layout leaves it no room (as in matplotlib), so end with ["fig.tight_layout", [], { rect: [0, 0, 1, 0.96] }].
- imshow: the themes draw a y grid above images (axes.axisbelow, as in matplotlib); add ["grid", [false]] on heatmap Axes.
- Keep each series under ~100k points.
- fig.colorbar inside a subplot grid works with tight_layout.

Result: { pngPath?, svgPath?, width?, height?, theme } or { error }. The PNG is attached to the execute result, so you see the chart once the script returns; return r.error or r.pngPath from the script. The user does not see that attachment: to show them the chart, put a Markdown image with the absolute path in your reply, such as ![p95 latency by region](/abs/path/chart.png).

Done when: the image has no overlapping or clipped labels, no legend covering data, and readable ticks; otherwise adjust (figsize, ticks, legend loc, ylim headroom) and re-render.`
