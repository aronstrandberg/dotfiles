/** The two .mplstyle themes ported from dmmulroy/.dotfiles, embedded so the bundled server entry needs no files beside it. They share keys, layout and cycle order (blue, mauve, green, peach, red, teal, yellow, pink): change both together. */
export const THEMES = {
  "catppuccin-macchiato": `
# catppuccin-macchiato: Catppuccin Macchiato palette (https://catppuccin.com/palette) on the pro-* layout
# Plain matplotlib rc keys: plt.style.use("path/to/catppuccin-macchiato.mplstyle") works in matplotlib too.
# Colours: base 24273a, surface0 363a4f, surface1 494d64, surface2 5b6078, subtext0 a5adcb, subtext1 b8c0e0, text cad3f5

figure.facecolor: 24273a
axes.facecolor: 24273a
savefig.facecolor: 24273a
axes.edgecolor: 494d64
grid.color: 363a4f
text.color: cad3f5
axes.titlecolor: cad3f5
axes.labelcolor: a5adcb
xtick.color: 5b6078
ytick.color: 5b6078
xtick.labelcolor: a5adcb
ytick.labelcolor: a5adcb
patch.edgecolor: 24273a
legend.labelcolor: b8c0e0
# blue, mauve, green, peach, red, teal, yellow, pink
axes.prop_cycle: cycler('color', ['8aadf4', 'c6a0f6', 'a6da95', 'f5a97f', 'ed8796', '8bd5ca', 'eed49f', 'f5bde6'])
# Inter, then DejaVu Sans for glyphs the bundled Inter subset lacks (Greek), per glyph as matplotlib's font fallback
font.family: Inter, DejaVu Sans
font.size: 9
figure.figsize: 7.2, 4.2
axes.spines.top: False
axes.spines.right: False
axes.spines.left: False
axes.grid: True
axes.grid.axis: y
axes.axisbelow: True
axes.linewidth: 0.8
axes.titlesize: 12
axes.titleweight: semibold
axes.titlelocation: left
axes.titlepad: 10
axes.labelsize: 9
axes.labelpad: 6
grid.linestyle: -
grid.linewidth: 0.6
lines.linewidth: 1.6
lines.solid_capstyle: round
lines.markersize: 5
patch.linewidth: 0
xtick.major.size: 3
xtick.major.width: 0.8
xtick.major.pad: 5
xtick.labelsize: 8.5
xtick.direction: out
ytick.major.size: 0
ytick.major.pad: 6
ytick.labelsize: 8.5
legend.frameon: False
legend.fontsize: 8.5
legend.handlelength: 1.4
legend.handletextpad: 0.6
legend.columnspacing: 1.4
# boxplot: matplotlib's defaults are black (invisible on dark themes); muted lines, red median
boxplot.boxprops.color: a5adcb
boxplot.whiskerprops.color: a5adcb
boxplot.capprops.color: a5adcb
boxplot.flierprops.color: a5adcb
boxplot.flierprops.markeredgecolor: a5adcb
boxplot.medianprops.color: ed8796
boxplot.medianprops.linewidth: 1.6
boxplot.meanprops.color: ed8796
boxplot.meanprops.markerfacecolor: ed8796
boxplot.meanprops.markeredgecolor: ed8796
`,
  "catppuccin-latte": `
# catppuccin-latte: Catppuccin Latte palette (https://catppuccin.com/palette) on the pro-* layout, the light twin of
# catppuccin-macchiato.mplstyle (same layout and cycle order, only colours differ; keep the two in sync).
# Plain matplotlib rc keys: plt.style.use("path/to/catppuccin-latte.mplstyle") works in matplotlib too.
# Colours: base eff1f5, surface0 ccd0da, surface1 bcc0cc, surface2 acb0be, subtext0 6c6f85, subtext1 5c5f77, text 4c4f69

figure.facecolor: eff1f5
axes.facecolor: eff1f5
savefig.facecolor: eff1f5
axes.edgecolor: bcc0cc
grid.color: ccd0da
text.color: 4c4f69
axes.titlecolor: 4c4f69
axes.labelcolor: 6c6f85
xtick.color: acb0be
ytick.color: acb0be
xtick.labelcolor: 6c6f85
ytick.labelcolor: 6c6f85
patch.edgecolor: eff1f5
legend.labelcolor: 5c5f77
# blue, mauve, green, peach, red, teal, yellow, pink
axes.prop_cycle: cycler('color', ['1e66f5', '8839ef', '40a02b', 'fe640b', 'd20f39', '179299', 'df8e1d', 'ea76cb'])
# Inter, then DejaVu Sans for glyphs the bundled Inter subset lacks (Greek), per glyph as matplotlib's font fallback
font.family: Inter, DejaVu Sans
font.size: 9
figure.figsize: 7.2, 4.2
axes.spines.top: False
axes.spines.right: False
axes.spines.left: False
axes.grid: True
axes.grid.axis: y
axes.axisbelow: True
axes.linewidth: 0.8
axes.titlesize: 12
axes.titleweight: semibold
axes.titlelocation: left
axes.titlepad: 10
axes.labelsize: 9
axes.labelpad: 6
grid.linestyle: -
grid.linewidth: 0.6
lines.linewidth: 1.6
lines.solid_capstyle: round
lines.markersize: 5
patch.linewidth: 0
xtick.major.size: 3
xtick.major.width: 0.8
xtick.major.pad: 5
xtick.labelsize: 8.5
xtick.direction: out
ytick.major.size: 0
ytick.major.pad: 6
ytick.labelsize: 8.5
legend.frameon: False
legend.fontsize: 8.5
legend.handlelength: 1.4
legend.handletextpad: 0.6
legend.columnspacing: 1.4
# boxplot: matplotlib's defaults are black (invisible on dark themes); muted lines, red median
boxplot.boxprops.color: 6c6f85
boxplot.whiskerprops.color: 6c6f85
boxplot.capprops.color: 6c6f85
boxplot.flierprops.color: 6c6f85
boxplot.flierprops.markeredgecolor: 6c6f85
boxplot.medianprops.color: d20f39
boxplot.medianprops.linewidth: 1.6
boxplot.meanprops.color: d20f39
boxplot.meanprops.markerfacecolor: d20f39
boxplot.meanprops.markeredgecolor: d20f39
`,
} as const satisfies Record<string, string>
