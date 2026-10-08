import { Theme } from "@earendil-works/pi-coding-agent";

export function createTheme() {
  return new Theme(
    {
      accent: "#a6c8ff",
      dim: "#888888",
      muted: "#999999",
      text: "#ffffff",
      success: "#b4dfb4",
      warning: "#f2dfa0",
      error: "#f2b5b5",
      thinkingXhigh: "#d9b8e6",
    },
    { selectedBg: "#333333" },
    "truecolor",
  );
}
