# dotfiles

A set of highly opinionated dotfiles by and for [@aronstrandberg](https://github.com/aronstrandberg).

Feel free to use, copy or modify them as you please. Attribution is appreciated but not at all mandatory (I stole most of this stuff anyway).

## Nix

`flake.nix` exports `homeManagerModules.default` (`nix/home.nix`): Nushell,
Starship, neovim, vim, bat and the OpenCode plugin and skills, for Linux and
macOS. Import it from a home-manager configuration. neovim's config is linked
from the checkout (`dotfiles.checkout`, default `~/dotfiles`), because lazy.nvim
writes its lock file there. The macOS setup (Homebrew, fish, `macos.sh`) stays
in the shell scripts.

## Credits
Credit where credit is due – repos that I've to some degree used as inspiration and/or straight up taken stuff from.

**[mathiasbynens/dotfiles](https://github.com/mathiasbynens/dotfiles)**  
**[holman/dotfiles](https://github.com/holman/dotfiles)**  
**[janmoesen/tilde](https://github.com/janmoesen/tilde)**
