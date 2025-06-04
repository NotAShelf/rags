{
  description = "A customizable and extensible shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs?ref=nixos-unstable";

    # «https://github.com/nix-systems/nix-systems»
    systems.url = "github:nix-systems/default-linux";
  };

  outputs = {
    nixpkgs,
    self,
    systems,
  }: let
    version = builtins.replaceStrings ["\n"] [""] (builtins.readFile ./version);
    genSystems = nixpkgs.lib.genAttrs (import systems);
    pkgs = genSystems (system: import nixpkgs {inherit system;});
  in {
    packages = genSystems (system: let
      inherit (pkgs.${system}) callPackage;
    in {
      ags = callPackage ./nix/package.nix {inherit version;};
      agsNoTypes = callPackage ./nix {
        inherit version;
        buildTypes = false;
      };

      default = self.packages.${system}.ags;
    });

    devShells = genSystems (system: let
      inherit (pkgs.${system}) callPackage;
    in {
      default = callPackage ./nix/shell.nix {};
    });
  };
}
