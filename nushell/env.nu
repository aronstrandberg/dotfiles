# env.nu
# Environment variables and PATH setup

# Add common paths
use std "path add"
path add ~/.local/bin
path add ~/.nix-profile/bin
path add /nix/var/nix/profiles/default/bin
path add /run/current-system/sw/bin
path add ~/.opencode/bin

# Editor
$env.EDITOR = "nvim"
$env.VISUAL = "nvim"

# Less/grep colors etc can go here
$env.LANG = "en_US.UTF-8"

