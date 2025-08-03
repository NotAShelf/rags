{
  lib,
  stdenv,
  fetchFromGitLab,
  # Build Deps
  pnpm,
  nodejs,
  typescript,
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
    sha256 = "sha256-FosJwgTCp6/EI6WVbJhPisokRBA6oT0eo7d+Ya7fFX8=";
  };
in
  stdenv.mkDerivation (finalAttrs: {
    inherit pname version;

    src = let
      fs = lib.fileset;
      sp = ../.;
    in
      fs.toSource {
        root = sp;

        fileset = fs.intersection (fs.fromSource (lib.sources.cleanSource sp)) (
          fs.unions [
            ../src
            ../subprojects
            ../types
            ../package.json
            ../pnpm-lock.yaml
            ../post_install.sh
            ../meson_options.txt
            ../meson.build
            ../tsconfig.json
          ]
        );
      };

    pnpmDeps = pnpm.fetchDeps {
      inherit (finalAttrs) pname src;
      hash = "sha256-3aERy7lT7Hv8DhvwiNSujagVV19eUxEmbbOjzlQe/zo=";
    };

    nativeBuildInputs = [
      pkg-config
      meson
      ninja
      typescript
      wrapGAppsHook
      gobject-introspection

      nodejs
      pnpm.configHook
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

    preBuild = ''
      export NODE_PATH="$PWD/node_modules:$NODE_PATH"
    '';

    postInstall = (lib.optionalString buildTypes) ''
      cp -rvf ./types $lib
    '';

    outputs = ["out" "lib"];

    meta = {
      description = "Customizable and extensible shell";
      homepage = "https://github.com/NotAShelf/rags";
      changelog = "https://github.com/NotAShelf/rags/blob/${version}/CHANGELOG.md";
      platforms = ["x86_64-linux" "aarch64-linux"];
      license = lib.licenses.gpl3;
      mainProgram = "ags";
      maintainers = [lib.maintainers.NotAShelf];
    };
  })
