# Tilde Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Fish-native dotfiles manager that uses symlinks for instant sync.

**Architecture:** Single Fish function with component declarations at the top, subcommands (install/status/uninstall/list/diff) dispatch to helper functions. Bootstrap script in Zsh for fresh Mac setup.

**Tech Stack:** Fish shell, Zsh (bootstrap only)

---

### Task 1: Create tilde.fish with component registration

**Files:**
- Create: `fish/functions/tilde.fish`

**Step 1: Create the component function and declarations**

```fish
function component --description "Register a dotfiles component"
    set -ga __tilde_components $argv
end

# Component declarations: type source destination
component symlink  fish            ~/.config/fish
component symlink  git/.gitconfig  ~/.gitconfig
component symlink  vim/.vimrc      ~/.vimrc
component symlink  bat             ~/.config/bat
component bundle   brewfile
component script   macos.sh
component script   ruby.sh
```

**Step 2: Verify syntax is valid**

Run: `fish -n fish/functions/tilde.fish`
Expected: No output (valid syntax)

**Step 3: Commit**

```bash
git add fish/functions/tilde.fish
git commit -m "feat(tilde): add component registration"
```

---

### Task 2: Add main tilde function with subcommand dispatch

**Files:**
- Modify: `fish/functions/tilde.fish`

**Step 1: Add the main function with argument parsing**

After the component declarations, add:

```fish
function tilde --description "Dotfiles manager"
    # Get the dotfiles directory (where this script lives)
    set -l dotfiles_dir (dirname (status dirname))

    # Parse subcommand
    set -l cmd $argv[1]
    set -l args $argv[2..-1]

    switch $cmd
        case install
            __tilde_install $dotfiles_dir $args
        case status
            __tilde_status $dotfiles_dir
        case uninstall
            __tilde_uninstall $dotfiles_dir $args
        case list
            __tilde_list
        case diff
            __tilde_diff $dotfiles_dir
        case ''
            __tilde_help
        case '*'
            echo "Unknown command: $cmd"
            __tilde_help
            return 1
    end
end

function __tilde_help
    echo "Usage: tilde <command> [args]"
    echo ""
    echo "Commands:"
    echo "  install [component...]  Install all or specific components"
    echo "  status                  Show installation status"
    echo "  uninstall [component...] Remove symlinks"
    echo "  list                    List all components"
    echo "  diff                    Show differences for copied files"
end
```

**Step 2: Verify syntax**

Run: `fish -n fish/functions/tilde.fish`
Expected: No output (valid syntax)

**Step 3: Commit**

```bash
git add fish/functions/tilde.fish
git commit -m "feat(tilde): add main function with subcommand dispatch"
```

---

### Task 3: Implement __tilde_list

**Files:**
- Modify: `fish/functions/tilde.fish`

**Step 1: Add the list helper function**

Before the main `tilde` function, add:

```fish
function __tilde_list
    # Components are stored as: type source dest type source dest ...
    set -l i 1
    while test $i -le (count $__tilde_components)
        set -l type $__tilde_components[$i]
        set -l source $__tilde_components[(math $i + 1)]
        set -l dest $__tilde_components[(math $i + 2)]

        switch $type
            case symlink
                printf "%-10s %-20s → %s\n" $type $source $dest
            case bundle script
                printf "%-10s %s\n" $type $source
                set i (math $i - 1)  # These only have 2 fields
        end
        set i (math $i + 3)
    end
end
```

**Step 2: Test manually**

Run: `fish -c "source fish/functions/tilde.fish; tilde list"`
Expected: List of all components with types and paths

**Step 3: Commit**

```bash
git add fish/functions/tilde.fish
git commit -m "feat(tilde): implement list command"
```

---

### Task 4: Implement __tilde_status

**Files:**
- Modify: `fish/functions/tilde.fish`

**Step 1: Add the status helper function**

```fish
function __tilde_status
    set -l dotfiles_dir $argv[1]
    set -l i 1

    while test $i -le (count $__tilde_components)
        set -l type $__tilde_components[$i]
        set -l source $__tilde_components[(math $i + 1)]

        switch $type
            case symlink
                set -l dest (string replace "~" $HOME $__tilde_components[(math $i + 2)])
                set -l full_source "$dotfiles_dir/$source"

                if test -L $dest
                    set -l target (readlink $dest)
                    if test "$target" = "$full_source"
                        set_color green
                        printf "✓ "
                    else
                        set_color yellow
                        printf "⚠ "
                    end
                else if test -e $dest
                    set_color red
                    printf "✗ "
                else
                    set_color red
                    printf "✗ "
                end
                set_color normal
                printf "%-15s %s\n" $source $dest
                set i (math $i + 3)

            case bundle script
                set_color blue
                printf "○ %-15s (run manually)\n" $source
                set_color normal
                set i (math $i + 2)
        end
    end
end
```

**Step 2: Test manually**

Run: `fish -c "source fish/functions/tilde.fish; tilde status"`
Expected: Status output showing missing symlinks (✗) for each component

**Step 3: Commit**

```bash
git add fish/functions/tilde.fish
git commit -m "feat(tilde): implement status command"
```

---

### Task 5: Implement __tilde_install for symlinks

**Files:**
- Modify: `fish/functions/tilde.fish`

**Step 1: Add the install helper function**

```fish
function __tilde_install
    set -l dotfiles_dir $argv[1]
    set -l requested $argv[2..-1]
    set -l i 1

    while test $i -le (count $__tilde_components)
        set -l type $__tilde_components[$i]
        set -l source $__tilde_components[(math $i + 1)]

        # Determine component name (first part of source path)
        set -l name (string split / $source)[1]

        # Skip if specific components requested and this isn't one
        if test (count $requested) -gt 0
            if not contains $name $requested
                switch $type
                    case symlink
                        set i (math $i + 3)
                    case bundle script
                        set i (math $i + 2)
                end
                continue
            end
        end

        switch $type
            case symlink
                set -l dest (string replace "~" $HOME $__tilde_components[(math $i + 2)])
                set -l full_source "$dotfiles_dir/$source"

                # Create parent directory if needed
                set -l parent_dir (dirname $dest)
                if not test -d $parent_dir
                    mkdir -p $parent_dir
                end

                # Check if already correctly linked
                if test -L $dest
                    set -l target (readlink $dest)
                    if test "$target" = "$full_source"
                        set_color green
                        echo "✓ $source (already installed)"
                        set_color normal
                        set i (math $i + 3)
                        continue
                    end
                end

                # Check if target exists and is not a symlink
                if test -e $dest -a ! -L $dest
                    set_color yellow
                    echo "⚠ $dest exists and is not a symlink, skipping (use --force to override)"
                    set_color normal
                    set i (math $i + 3)
                    continue
                end

                # Remove existing symlink if present
                if test -L $dest
                    rm $dest
                end

                # Create symlink
                ln -s $full_source $dest
                set_color green
                echo "✓ $source → $dest"
                set_color normal
                set i (math $i + 3)

            case bundle
                set_color blue
                echo "→ Running brew bundle..."
                set_color normal
                brew bundle --file="$dotfiles_dir/$source"
                set i (math $i + 2)

            case script
                set_color blue
                echo "→ Running $source..."
                set_color normal
                sh "$dotfiles_dir/$source"
                set i (math $i + 2)
        end
    end
end
```

**Step 2: Test syntax**

Run: `fish -n fish/functions/tilde.fish`
Expected: No output (valid syntax)

**Step 3: Commit**

```bash
git add fish/functions/tilde.fish
git commit -m "feat(tilde): implement install command"
```

---

### Task 6: Implement __tilde_uninstall

**Files:**
- Modify: `fish/functions/tilde.fish`

**Step 1: Add the uninstall helper function**

```fish
function __tilde_uninstall
    set -l dotfiles_dir $argv[1]
    set -l requested $argv[2..-1]
    set -l i 1

    while test $i -le (count $__tilde_components)
        set -l type $__tilde_components[$i]
        set -l source $__tilde_components[(math $i + 1)]
        set -l name (string split / $source)[1]

        # Skip if specific components requested and this isn't one
        if test (count $requested) -gt 0
            if not contains $name $requested
                switch $type
                    case symlink
                        set i (math $i + 3)
                    case bundle script
                        set i (math $i + 2)
                end
                continue
            end
        end

        switch $type
            case symlink
                set -l dest (string replace "~" $HOME $__tilde_components[(math $i + 2)])

                if test -L $dest
                    rm $dest
                    set_color green
                    echo "✓ Removed $dest"
                    set_color normal
                else if test -e $dest
                    set_color yellow
                    echo "⚠ $dest is not a symlink, skipping"
                    set_color normal
                else
                    set_color dim
                    echo "· $dest not installed"
                    set_color normal
                end
                set i (math $i + 3)

            case bundle script
                set_color yellow
                echo "⚠ $source is a $type, cannot uninstall automatically"
                set_color normal
                set i (math $i + 2)
        end
    end
end
```

**Step 2: Test syntax**

Run: `fish -n fish/functions/tilde.fish`
Expected: No output (valid syntax)

**Step 3: Commit**

```bash
git add fish/functions/tilde.fish
git commit -m "feat(tilde): implement uninstall command"
```

---

### Task 7: Implement __tilde_diff

**Files:**
- Modify: `fish/functions/tilde.fish`

**Step 1: Add the diff helper function**

```fish
function __tilde_diff
    set -l dotfiles_dir $argv[1]
    set -l i 1
    set -l found_diff 0

    while test $i -le (count $__tilde_components)
        set -l type $__tilde_components[$i]
        set -l source $__tilde_components[(math $i + 1)]

        switch $type
            case symlink
                set -l dest (string replace "~" $HOME $__tilde_components[(math $i + 2)])
                set -l full_source "$dotfiles_dir/$source"

                # Only check if dest exists and is NOT a symlink (i.e., a copy)
                if test -e $dest -a ! -L $dest
                    echo "=== $source vs $dest ==="
                    diff -u $full_source $dest
                    set found_diff 1
                    echo ""
                end
                set i (math $i + 3)

            case bundle script
                set i (math $i + 2)
        end
    end

    if test $found_diff -eq 0
        echo "No copied files found (all symlinks or missing)"
    end
end
```

**Step 2: Test syntax**

Run: `fish -n fish/functions/tilde.fish`
Expected: No output (valid syntax)

**Step 3: Commit**

```bash
git add fish/functions/tilde.fish
git commit -m "feat(tilde): implement diff command"
```

---

### Task 8: Create bootstrap.zsh

**Files:**
- Create: `bootstrap.zsh`

**Step 1: Create the bootstrap script**

```zsh
#!/bin/zsh
# bootstrap.zsh - Run on a fresh Mac to set up dotfiles
# Usage: curl -fsSL <raw-url> | zsh
#    or: zsh bootstrap.zsh

set -e

DOTFILES="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing dotfiles from $DOTFILES"

# Install Homebrew if not present
if ! command -v brew &>/dev/null; then
    echo "==> Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for this session
    if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -f /usr/local/bin/brew ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
else
    echo "==> Homebrew already installed"
fi

# Install Fish if not present
if ! command -v fish &>/dev/null; then
    echo "==> Installing Fish..."
    brew install fish
else
    echo "==> Fish already installed"
fi

# Bootstrap: manually symlink fish config (chicken-and-egg)
echo "==> Symlinking Fish config..."
mkdir -p ~/.config
if [[ -L ~/.config/fish ]]; then
    rm ~/.config/fish
elif [[ -d ~/.config/fish ]]; then
    echo "Warning: ~/.config/fish exists and is a directory"
    echo "Please back it up and remove it, then run this script again"
    exit 1
fi
ln -s "$DOTFILES/fish" ~/.config/fish

# Now tilde is available - run full install
echo "==> Running tilde install..."
fish -c "tilde install"

echo "==> Done! Open a new terminal to use Fish."
```

**Step 2: Make executable**

Run: `chmod +x bootstrap.zsh`

**Step 3: Test syntax**

Run: `zsh -n bootstrap.zsh`
Expected: No output (valid syntax)

**Step 4: Commit**

```bash
git add bootstrap.zsh
git commit -m "feat(tilde): add bootstrap script for fresh Mac"
```

---

### Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the documentation**

Add to the Overview section after the first paragraph:

```markdown
Install with `zsh bootstrap.zsh` on a fresh Mac, or use `tilde install` if Fish is already set up. Run `tilde status` to check if configs are in sync.
```

Update the Patterns section, replacing or adding:

```markdown
**Symlink-based config management**: The `tilde` command manages dotfiles via symlinks. Edit files in the repo; changes apply instantly. Use `tilde status` to verify all symlinks are correct.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with tilde usage"
```

---

### Task 10: Clean up old install scripts

**Files:**
- Delete: `install.sh`
- Delete: `fish.sh`
- Delete: `git.sh`
- Delete: `vim.sh`
- Delete: `bat/install.sh`

**Step 1: Remove old scripts**

```bash
git rm install.sh fish.sh git.sh vim.sh bat/install.sh
```

**Step 2: Commit**

```bash
git commit -m "chore: remove old install scripts replaced by tilde"
```

---

### Task 11: Test end-to-end

**Step 1: Verify tilde list works**

Run: `fish -c "source fish/functions/tilde.fish; tilde list"`
Expected: All components listed

**Step 2: Verify tilde status works**

Run: `fish -c "source fish/functions/tilde.fish; tilde status"`
Expected: Status of all components shown

**Step 3: Verify tilde help works**

Run: `fish -c "source fish/functions/tilde.fish; tilde"`
Expected: Help message displayed

**Step 4: Manual test install on a single component**

(Optional - only if you want to test actual symlink creation)

Run: `fish -c "source fish/functions/tilde.fish; tilde install vim"`
Expected: Creates symlink for .vimrc

---

## Notes

- The `sublime` component path has spaces; ensure proper quoting in the component declaration
- Scripts (`macos.sh`, `ruby.sh`) are run via `sh`, not fish
- The `--force` flag mentioned in install is not yet implemented; add if needed later
- Consider adding fish completions for `tilde` command in a future iteration
