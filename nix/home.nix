# Cross-platform shell, editor and OpenCode config. macOS-only setup (Homebrew,
# fish, defaults) stays in the shell scripts at the repo root.
{ config, lib, pkgs, ... }:
let
  cfg = config.dotfiles;
  repo = ../.;
  # Links into the git checkout, for files that are edited in place or that
  # their program writes to (lazy.nvim updates lazy-lock.json).
  live = path: config.lib.file.mkOutOfStoreSymlink "${cfg.checkout}/${path}";
  starshipNu = pkgs.runCommand "starship.nu" { } ''
    ${lib.getExe pkgs.starship} init nu > $out
  '';
in
{
  options.dotfiles.checkout = lib.mkOption {
    type = lib.types.str;
    default = "${config.home.homeDirectory}/dotfiles";
    description = "Path of the aronstrandberg/dotfiles checkout.";
  };

  config = {
    home.packages = with pkgs; [
      bat
      direnv
      neovim
      nushell
      starship
    ];

    xdg.configFile = {
      "nushell/config.nu".source = "${repo}/nushell/config.nu";
      "nushell/env.nu".source = "${repo}/nushell/env.nu";
      "nushell/prompt-eclm.nu".source = "${repo}/nushell/prompt-eclm.nu";
      "nushell/autoload/direnv.nu".source = "${repo}/nushell/autoload/direnv.nu";
      "starship.toml".source = "${repo}/starship/starship.toml";
      "bat/config".source = "${repo}/bat/config";
      "nvim".source = live "vim/.config/nvim";
      "opencode/plugins/gh-prs".source = "${repo}/opencode/plugins/gh-prs";
      "opencode/skills/go-coding-standards".source = "${repo}/opencode/skills/go-coding-standards";
    };

    xdg.dataFile."nushell/vendor/autoload/starship.nu".source = starshipNu;

    home.file.".vimrc".source = "${repo}/vim/.vimrc";
  };
}
