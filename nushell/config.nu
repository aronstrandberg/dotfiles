# config.nu
$env.config = {
  show_banner: false
  table: { mode: rounded }
  edit_mode: emacs

  history: {
    max_size: 100_000
    sync_on_enter: true
    file_format: "sqlite"
    isolation: false
  }

  use_ansi_coloring: true
}

# Aliases
alias ll = ls -la
alias l = ls
alias vim = nvim
alias cat = bat

# Useful functions
def .. [] { cd .. }
def ... [] { cd ../.. }
def .... [] { cd ../../.. }

# Machine-local settings and secrets: ~/.config/nushell/autoload/local.nu (loaded automatically, not committed)
