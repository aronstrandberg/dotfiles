import { CodeBlock, Plugin, Style } from "@opencode/plugin/gui"
import { Diagram } from "./diagram"
import { css } from "./styles"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, css)
    ctx.add(CodeBlock, {
      languages: ["mermaid"],
      render: (props) => <Diagram code={props.code} />,
    })
  },
})
