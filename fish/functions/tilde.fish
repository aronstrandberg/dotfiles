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
