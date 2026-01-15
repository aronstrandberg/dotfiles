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
