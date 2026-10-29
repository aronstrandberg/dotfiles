#!/bin/sh
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/opencode
plugins_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins"

# OpenCode loads every package directory in its global plugins directory, server, TUI and
# desktop parts alike, and reloads them when they change.
mkdir -p "$plugins_dir"
for plugin in "$source_dir"/plugins/*/; do
  name=$(basename "$plugin")
  rsync -a --delete --exclude node_modules "$plugin" "$plugins_dir/$name/"
  printf 'Installed OpenCode plugin %s to %s\n' "$name" "$plugins_dir/$name"
done
