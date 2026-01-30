---
title: Home Manager
description: Home Manager Module
category: Guides
group: Configuration
---

Example content of a `flake.nix` file

```nix
# flake.nix
{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Add RAGS
    rags.url = "github:NotAShelf/rags";
  };

  outputs = { home-manager, nixpkgs, ... }@inputs:
  let
    system = "x86_64-linux";
  in
  {
    homeConfigurations."${username}" = home-manager.lib.homeManagerConfiguration {
      pkgs = import nixpkgs { inherit system; };

      # pass inputs as specialArgs
      extraSpecialArgs = { inherit inputs; };

      # import your home.nix
      modules = [ ./home-manager/home.nix ];
    };
  };
}
```

Example content of `home.nix` file

```nix
# home.nix
{ inputs, pkgs, ... }:
{
  # add the home manager module
  imports = [ inputs.rags.homeManagerModules.default ];

  programs.ags = {
    enable = true;

    # null or path, leave as null if you don't want HM to manage the config
    configDir = ../ags;

    # additional packages to add to gjs's runtime
    extraPackages = with pkgs; [
      gtksourceview
      webkitgtk
      accountsservice
    ];
  };
}
```
