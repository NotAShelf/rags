{
  lib,
  stdenv,
  importNpmLock,
  buildNpmPackage,
  fetchFromGitLab,
  nodePackages,
  meson,
  pkg-config,
  ninja,
  gobject-introspection,
  gtk3,
  libpulseaudio,
  gjs,
  wrapGAppsHook,
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
  stdenv.mkDerivation {
    inherit pname version;

    src = buildNpmPackage {
      pname = "ags-deps";
      version = "#";

      src = lib.fileset.toSource {
        root = ../.;
        fileset = lib.fileset.unions [
          ../src
          ../subprojects
          ../types

          ../package-lock.json
          ../package.json

          ../meson.build
          ../meson_options.txt
          ../post_install.sh
          ../tsconfig.json
          ../version
        ];
      };

      dontNpmBuild = true;
      dontNpmPrune = true;

      npmWorkspace = "ags";
      npmPackFlags = ["--ignore-scripts"];
      npmDeps = importNpmLock {npmRoot = ../.;};
      npmConfigHook = importNpmLock.npmConfigHook;

      installPhase = ''
        runHook preInstall

        mkdir -p $out
        cp -rv * $out

        runHook postInstall
      '';
    };

    nativeBuildInputs = [
      pkg-config
      meson
      ninja
      nodePackages.typescript
      wrapGAppsHook
      gobject-introspection
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
      chmod +x post_install.sh
      patchShebangs post_install.sh
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
  }
