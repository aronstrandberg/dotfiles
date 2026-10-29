import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"

export const definition = Plugin.define({
  stores: {
    prefs: Store.global(Schema.Struct({ showBots: Schema.Boolean, showResolved: Schema.Boolean }), {
      showBots: true,
      showResolved: false,
    }),
  },
  i18n: {
    en: {
      title: "Pull requests",
      "command.open": "Show pull requests",
      "command.open.description": "GitHub pull requests mentioned in this session",
      "command.refresh": "Refresh pull requests",
      "pill.title": "Pull requests in this session",
      "pill.all": "All pull requests",
      "pulls.one": "{{count}} PR",
      "pulls.other": "{{count}} PRs",
    },
  },
})
