# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal dotfiles for macOS with Fish shell and Git workflows. Install with `sh install.sh` or run individual scripts (`brew.sh`, `fish.sh`, `git.sh`, `vim.sh`).

## Patterns

**Local config overrides for secrets**: Machine-specific settings and secrets go in gitignored local files that are auto-sourced if present. Provide `.example` files documenting the pattern.
- `~/.config/fish/config.local.fish` (example: `fish/config.local.fish.example`)
- `~/.gitconfig.local` (example: `git/.gitconfig.local.example`)

**Stateless git operations**: Complex git workflows should use temporary worktrees to avoid touching the current working directory. This allows safe use while other processes operate on local git state. See `fish/functions/git-push-commit.fish`.

**Fish function conventions**:
- Use `--description` for discoverability (`functions <name>` and completions)
- Use `--wraps <cmd>` on wrapper functions to inherit completions
- Document complex functions with inline comments explaining fish syntax

**Component-based structure**: Each tool gets its own directory containing config files and optional install scripts. Installation uses rsync to copy configs to their destinations.

## Components

- `fish/` - Shell config, prompt, and functions. Functions in `functions/` are autoloaded by fish.
- `git/` - Git config with aliases, signing setup (1Password/SSH), and difftool config (difft). Uses hub as git wrapper.
- `vim/` - Minimal vimrc for basic editing.
- `bat/` - Config for bat (cat replacement with syntax highlighting).
- `opencode/` - OpenCode plugins. `opencode.sh` copies each one to `~/.config/opencode/plugins/`. `plugins/gh-prs` reviews the GitHub PRs a session mentions (desktop, web and TUI); its desktop bundle in `dist/` is committed, so rebuild it after changing `src/gui*`.
- `brewfile` - Declarative package list for Homebrew.
- `macos.sh` - System preferences and defaults for macOS.
