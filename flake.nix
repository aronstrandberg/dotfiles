{
  description = "Aron's portable dotfiles as a home-manager module";

  outputs = { self }: {
    homeManagerModules.default = ./nix/home.nix;
  };
}
