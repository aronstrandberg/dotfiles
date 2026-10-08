#!/bin/sh
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/pi
agent_dir="$HOME/.pi/agent"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js is required to install Pi settings.' >&2
  exit 1
fi

mkdir -p "$agent_dir/extensions"
node --input-type=module - "$source_dir/settings.json" "$agent_dir/settings.json" <<'JS'
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [source, destination] = process.argv.slice(2);
const defaults = JSON.parse(readFileSync(source, "utf8"));
const local = existsSync(destination) ? JSON.parse(readFileSync(destination, "utf8")) : {};
writeFileSync(destination, JSON.stringify({ ...local, ...defaults }, null, 2) + "\n", { mode: 0o600 });
JS
rsync -a "$source_dir/extensions/" "$agent_dir/extensions/"
printf '%s\n' 'Pi settings and extensions installed. Run /reload in Pi to load extensions; model defaults apply to new sessions.'
