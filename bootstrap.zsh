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
