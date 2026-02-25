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
    genSystems = nixpkgs.lib.genAttrs (import systems);
    pkgsForEach = nixpkgs.legacyPackages;
  in {
    homeManagerModules = {
      ags = import ./nix/hm-module.nix self;
      default = self.homeManagerModules.ags;
    };

    packages = genSystems (system: let
      inherit (pkgsForEach.${system}) callPackage;

      # Version + short revision from the flake to identify exact revision
      # RAGS was built from.
      rev = self.shortRev or self.dirtyShortRev or "dirty";
      version = (builtins.replaceStrings ["\n"] [""] (builtins.readFile ./version)) + "-${rev}";
    in {
      ags = callPackage ./nix/package.nix {inherit version;};
      default = self.packages.${system}.ags;
      agsNoTypes = self.packages.${system}.ags.override {buildTypes = false;};
    });

    devShells = genSystems (system: let
      pkgs = pkgsForEach.${system};
    in {
      default = pkgs.mkShell {
        name = "ags";
        inputsFrom = [self.packages.${system}.agsNoTypes];
        packages = [pkgs.nodejs-slim];
      };
    });

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
