# Port of fish/prompt.fish (eclm theme): cwd (branch) ✗

def prompt-cwd [] {
  let home = $nu.home-path
  let dir = if ($env.PWD | str starts-with $home) {
    $env.PWD | str replace $home "~"
  } else {
    $env.PWD
  }
  $"(ansi cyan_bold)($dir)"
}

def prompt-git [] {
  let head = (^git symbolic-ref --short HEAD | complete)
  if $head.exit_code != 0 { return "" }

  let branch = ($head.stdout | str trim)
  let color = if $branch in [main master] { ansi red_bold } else { ansi yellow_bold }
  let dirty = (^git status --porcelain --ignore-submodules=dirty | complete | get stdout | is-not-empty)
  let mark = if $dirty { $"(ansi yellow_bold) ✗" } else { "" }

  $"(ansi reset) \(($color)($branch)(ansi reset)\)($mark)"
}

$env.PROMPT_COMMAND = {|| $"(prompt-cwd)(prompt-git)(ansi reset) " }
$env.PROMPT_COMMAND_RIGHT = {|| "" }
$env.PROMPT_INDICATOR = ""
