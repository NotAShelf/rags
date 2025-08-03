{
  description = "RAGS - raf's (fork of) AGS ";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs?ref=nixos-unstable";

    # «https://github.com/nix-systems/nix-systems»
    systems.url = "github:nix-systems/default-linux";
  };

  outputs = {
    nixpkgs,
    systems,
    self,
  }: let
    version = builtins.replaceStrings ["\n"] [""] (builtins.readFile ./version);
    genSystems = nixpkgs.lib.genAttrs (import systems);
    pkgs = genSystems (system: import nixpkgs {inherit system;});
  in {
    packages = genSystems (system: let
      inherit (pkgs.${system}) callPackage;
    in {
      ags = callPackage ./nix/package.nix {inherit version;};
      default = self.packages.${system}.ags;
      agsNoTypes = self.packages.${system}.ags.override {buildTypes = false;};
    });

    homeManagerModules = {
      ags = import ./nix/hm-module.nix self;
      default = self.homeManagerModules.ags;
    };

    formatter = genSystems (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};
      in
        pkgs.writeShellApplication {
          name = "nix3-fmt-wrapper";

          runtimeInputs = [
            pkgs.alejandra
            pkgs.fd
          ];

          text = ''
            fd "$@" -t f -e nix -x alejandra -q '{}'
          '';
        }
    );
  };
}
