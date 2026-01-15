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

function tilde --description "Dotfiles manager"
    # Get the dotfiles directory (where this script lives)
    # status dirname = fish/functions, so we need two dirname calls to reach dotfiles root
    set -l dotfiles_dir (dirname (dirname (status dirname)))

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
