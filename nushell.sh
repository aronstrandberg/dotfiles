#!/bin/bash
NU_BIN="$(which nu)"
DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

# Try to add to /etc/shells if writable
if [ -w /etc/shells ] && ! grep -q "$NU_BIN" /etc/shells; then
  echo "$NU_BIN" >> /etc/shells
fi

mkdir -p ~/.config/nushell
rsync -avh "$DOTFILES_DIR/nushell/" ~/.config/nushell/ 2>/dev/null || cp -r "$DOTFILES_DIR/nushell/"* ~/.config/nushell/ 2>/dev/null

rsync -avh "$DOTFILES_DIR/starship/starship.toml" ~/.config/starship.toml

# Starship's nu init script is generated per machine, so it is not kept in the repo
if command -v starship >/dev/null 2>&1; then
  NU_VENDOR_AUTOLOAD="$(nu -c '$nu.data-dir | path join vendor autoload')"
  mkdir -p "$NU_VENDOR_AUTOLOAD"
  starship init nu > "$NU_VENDOR_AUTOLOAD/starship.nu"
fi

echo "Installed nushell config to ~/.config/nushell"
echo "Nu binary: $NU_BIN"
