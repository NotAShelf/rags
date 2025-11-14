{
  lib,
  stdenv,
  fetchFromGitLab,
  # Build dependencies
  meson,
  typescript,
  pnpm,
  pkg-config,
  ninja,
  gobject-introspection,
  gtk3,
  libpulseaudio,
  gjs,
  wrapGAppsHook3,
  upower,
  gnome-bluetooth,
  gtk-layer-shell,
  glib-networking,
  networkmanager,
  libdbusmenu-gtk3,
  gvfs,
  libsoup_3,
  libnotify,
  pam,
  # Extra Options
  extraPackages ? [],
  version ? "git",
  buildTypes ? true,
}: let
  pname = "ags";

  gvc-src = fetchFromGitLab {
    domain = "gitlab.gnome.org";
    owner = "GNOME";
    repo = "libgnome-volume-control";
    rev = "8e7a5a4c3e51007ce6579292642517e3d3eb9c50";
    hash = "sha256-FosJwgTCp6/EI6WVbJhPisokRBA6oT0eo7d+Ya7fFX8=";
  };
in
  stdenv.mkDerivation (finalAttrs: {
    inherit pname version;

    src = lib.fileset.toSource {
      root = ../.;
      fileset = lib.fileset.unions [
        ../src
        ../subprojects
        ../types

        ../package-lock.json
        ../package.json
        ../pnpm-lock.yaml

        ../meson.build
        ../meson_options.txt
        ../post_install.sh
        ../tsconfig.json
        ../version
      ];
    };

    # XXX: The amount of dependencies required to build this project are a little absurd.
    # If we could build just one workspace, we could also just specify a workspace here
    # to fetch deps for and build. Alas, NodeJS.
    pnpmDeps = pnpm.fetchDeps {
      inherit (finalAttrs) pname src;
      hash = "sha256-g+eX/nZ3Ika4IDaGeClnHGK+HBd+hOEObjkFHjFgJ58=";
      fetcherVersion = 2; # https://nixos.org/manual/nixpkgs/stable/#javascript-pnpm-fetcherVersion
    };

    nativeBuildInputs = [
      pkg-config
      meson
      ninja
      typescript
      wrapGAppsHook3
      gobject-introspection

      pnpm.configHook # dependency resolution
    ];

    buildInputs =
      [
        gjs
        gtk3
        libpulseaudio
        upower
        gnome-bluetooth
        gtk-layer-shell
        glib-networking
        networkmanager
        libdbusmenu-gtk3
        gvfs
        libsoup_3
        libnotify
        pam
      ]
      ++ extraPackages;

    mesonFlags = [
      (lib.mesonBool "build_types" buildTypes)
    ];

    prePatch = ''
      mkdir -p ./subprojects/gvc
      cp -r ${gvc-src}/* ./subprojects/gvc
    '';

    postPatch = ''
      chmod u+x ./post_install.sh && patchShebangs ./post_install.sh
    '';

    outputs = ["out" "lib"];

    meta = {
      description = "Customizable and extensible shell";
      homepage = "https://github.com/notashelf/rags";
      changelog = "https://github.com/notashelf/rags/blob/${version}/CHANGELOG.md";
      platforms = ["x86_64-linux" "aarch64-linux"];
      license = lib.licenses.gpl3;
      mainProgram = "ags";
      maintainers = [lib.maintainers.NotAShelf];
    };
  })
