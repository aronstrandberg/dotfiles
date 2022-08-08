# Load KRY-specific config
source ~/.config/fish/kry.fish

# add homebrew packages directory to path
fish_add_path /opt/homebrew/bin

# Remove annoying welcome message
set fish_greeting ""

# chruby
source /usr/local/share/chruby/chruby.fish
source /usr/local/share/chruby/auto.fish
chruby ruby-3

# print stuff at kth
function print
  # f is file
  set f $argv[1]
  # l is printer location
  set l $argv[2]
  cat $f | ssh aronst@u-shell.csc.kth.se "lpr -P $l"
end

# open files and folders from the terminal
function o
  if set -q argv[1]
    open $argv[1]
  else
    open .
  end
end

# nicer atom alias
function a
  atom $argv
end

# nicer sublime alias
function s
  sublime $argv
end

function sublime
  if set -q argv[1]
    subl $argv[1]
  else
    subl .
  end
end

# vim
function v
  vim $argv
end

function vim
  nvim $argv
end

# ssh and sftp to kth servers
function kth
  switch $argv[1]
  case ssh
    if set -q argv[2]
      ssh $argv[2]@u-shell.csc.kth.se
    else
      ssh 'aronst@u-shell.csc.kth.se'
    end
  case sftp
    if set -q argv[2]
      sftp $argv[2]@u-shell.csc.kth.se
    else
      sftp 'aronst@u-shell.csc.kth.se'
    end
  end
end

function ...
  cd ../.. $argv;
end

function ....
  cd ../../.. $argv;
end

# normal terminal commands
alias cp='cp -i'
alias mv='mv -i'

function l --wraps ls
  ls -l $argv
end

function cat --wraps cat
  bat $argv
end

# git stuff
alias git='hub'
function g
  hub $argv
end

# open config files
function config
  if set -q argv[1]
    switch $argv[1]
    case git
      sublime ~/dev/dotfiles/git
    case fish
      sublime ~/dev/dotfiles/fish
    case dotfiles
      sublime ~/dev/dotfiles
    end
  end
end

# serve static files
function serve
  if set -q argv[1]
    http-server -p $argv[1]
  else
    http-server -p 8888
  end
end

function strip_dots
  echo $argv[1] | replace "." " " | pbcopy
end

function set_calendar_days
  if set -q argv[1]
    defaults write com.apple.iCal n\ days\ of\ week $argv[1]
  else
    echo "No argument supplied"
  end
end
