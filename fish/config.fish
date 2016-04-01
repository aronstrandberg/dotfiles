# Path to your oh-my-fish.
set fish_path $HOME/.oh-my-fish

source ~/.config/fish/prompt.fish

# Theme
# set fish_theme robbyrussell
# set fish_theme toaster

# Remove annoying welcome message
set fish_greeting ""

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-fish/plugins/*)
# Custom plugins may be added to ~/.oh-my-fish/custom/plugins/
# Example format: set fish_plugins autojump bundler
# set fish_plugins autojump

# chruby
source /usr/local/share/chruby/chruby.fish

# Fix autojump
# if test -f /Users/aron/.autojump/share/autojump/autojump.fish;
#   . /Users/aron/.autojump/share/autojump/autojump.fish;
# end
# set AUTOJUMP_IGNORE_CASE = 1
# source /etc/profile.d/autojump.fish

# Path to your custom folder (default path is $FISH/custom)
set fish_custom $HOME/dotfiles/oh-my-fish

# Load oh-my-fish configuration
. $fish_path/oh-my-fish.fish

function print
  # f is file
  set f $argv[1]
  # l is printer location
  set l $argv[2]
  cat $f | ssh aronst@u-shell.csc.kth.se "lpr -P $l"
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

# moving around folders
function -
  cd -
end

function ...
  cd ../.. $argv;
end

function ....
  cd ../../.. $argv;
end

# saving my ass
alias cp='cp -i'
alias mv='mv -i'

# git stuff
alias g='git'
alias git='hub'

alias grep=‘grep --color=auto’
