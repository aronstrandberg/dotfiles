# Tilde: Dotfiles Management Tool

A simple, Fish-native tool for managing dotfiles with symlinks.

## Problem

- Changes made to live configs (e.g., `~/.config/fish/config.fish`) get forgotten and never synced back to the dotfiles repo
- Current rsync approach is one-way: repo → home
- Hard to know if deployed configs match the repo

## Solution

- Use symlinks instead of copies: edits to `~/.config/fish/` are edits to the repo
- Single `tilde` command to install, check status, and manage components
- Declarative component registration using Fish functions

## Architecture

### Files

| File | Purpose |
|------|---------|
| `bootstrap.zsh` | Fresh Mac setup (~30 lines Zsh) |
| `fish/functions/tilde.fish` | Main tool (Fish) |

### Component Types

| Type | Description |
|------|-------------|
| `symlink` | Creates symlink from destination → repo source |
| `bundle` | Runs `brew bundle --file=<source>` |
| `script` | Executes a shell script |

### Component Declarations

At the top of `tilde.fish`:

```fish
component symlink  fish            ~/.config/fish
component symlink  git/.gitconfig  ~/.gitconfig
component symlink  vim/.vimrc      ~/.vimrc
component symlink  bat             ~/.config/bat
component symlink  sublime         ~/Library/Application\ Support/Sublime\ Text/Packages/User
component bundle   brewfile
component script   macos.sh
component script   ruby.sh
```

The `component` function registers each component to a global list for processing.

## Commands

### `tilde install [component...]`

Install all components or specific ones.

```
$ tilde install           # Install all components
$ tilde install fish git  # Install specific components
```

- Runs in dependency order (brew first)
- Creates parent directories if needed
- Idempotent (skips already-installed)
- Shows progress: `✓ fish → ~/.config/fish`

### `tilde status`

Check installation state.

```
$ tilde status
✓ fish        ~/.config/fish → ~/dev/dotfiles/fish
✓ git         ~/.gitconfig → ~/dev/dotfiles/git/.gitconfig
✗ vim         ~/.vimrc missing
○ macos.sh    script (run manually)
```

### `tilde uninstall [component...]`

Remove symlinks (doesn't delete repo files).

### `tilde list`

List all registered components with type and paths.

### `tilde diff`

Show differences for any copied (non-symlinked) files. Useful during migration.

## Bootstrap Flow

The `bootstrap.zsh` script handles fresh Mac setup:

```zsh
#!/bin/zsh
DOTFILES="$(cd "$(dirname "$0")" && pwd)"

# Install Homebrew
if ! command -v brew &>/dev/null; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Install Fish
brew install fish

# Bootstrap: manually symlink fish config first (chicken-and-egg)
mkdir -p ~/.config
ln -sf "$DOTFILES/fish" ~/.config/fish

# Now tilde is available
fish -c "tilde install"
```

### Chicken-and-Egg Solution

1. `bootstrap.zsh` installs Homebrew + Fish
2. `bootstrap.zsh` manually symlinks `fish/` directory
3. Now `tilde` command is available (Fish finds `~/.config/fish/functions/tilde.fish`)
4. `tilde install` handles everything else

## Error Handling

| Situation | Behavior |
|-----------|----------|
| Target exists (not a symlink) | Warn, skip unless `--force` |
| Script fails | Stop, report error |
| Missing source file | Error with helpful message |
| Broken symlink | Report in `tilde status` |

## Migration from Current Setup

### One-Time Steps

1. Remove copied files that will become symlinks:
   ```bash
   rm -rf ~/.config/fish ~/.config/bat
   rm ~/.gitconfig ~/.vimrc
   ```

2. Run `tilde install`

3. Merge any local changes from the old copies

### Files to Delete After Migration

- `install.sh` → replaced by `bootstrap.zsh`
- `fish.sh`, `git.sh`, `vim.sh` → replaced by `tilde install`
- `bat/install.sh` → replaced by `tilde install`

### Files to Keep

- `macos.sh`, `ruby.sh` → called by `tilde install` as scripts
- `brewfile` → used by `tilde install` via `brew bundle`

## Local Config Pattern

The existing `.local` override pattern continues to work:

- `~/.config/fish/config.local.fish` (gitignored, sourced if present)
- `~/.gitconfig.local` (gitignored, included by .gitconfig)

Symlinked configs source these files just as before.
