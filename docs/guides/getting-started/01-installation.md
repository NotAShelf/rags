---
title: Installation
description: How to install RAGS
category: Guides
group: Getting Started
---

There are currently two particular way of installing RAGS. The first and
recommended approach is using Nix, as described below. If you are a packer and
would like to make your distro-specific installation instructions available
here, please create a pull request!

## Nix

Maintainer: [@NotAShelf](https://github.com/NotAShelf)

You are recommended to use the package exposed by the `flake.nix` provided by
the RAGS repository. This allows you to add the package to your Nix profile (on
non-NixOS) or your system/home packages (NixOS) to make the `ags` command
available in your PATH.

### Installing with `nix profile`

```bash
# Get RAGS from GitHub using `nix profile`. Unlike the NixOS module this does
# not provide the necessary integrations, e.g., PAM so you must handle those
# manually per your distribution.
$ nix profile install github:notashelf/rags
```

### Single run with `nix run`

You may also run RAGS without installing, and have it removed on the next
garbage collection. Simply run with `nix run`:

```bash
# Fetch, unpack and build RAGS. Then run it from the Nix storeç
$ nix run github:notashelf/rags
```

### Installing Permanently

[Home Manager chapter]: ../configuration/10-home-manager.md

For NixOS systems, it's best to add RAGS as a flake inputs, and add the `ags`
package exposed by the flake in your `environment.systemPackages` for NixOS,
`packages` for Hjem or `home.packages` on Home Manager setups.

Example:

```nix
{inputs, pkgs, ...}: let
  ragsPkg = inputs.rags.packages.${pkgs.hostPlatform.system}.ags;
in {
  environment.systemPackages = [ragsPkg];
}
```

An example installation for Home Manager is provided over at the
[Home Manager chapter].

## From source

```bash
# Arch
sudo pacman -S typescript npm meson gjs gtk3 gtk-layer-shell gtk-session-lock gnome-bluetooth-3.0 upower networkmanager gobject-introspection libdbusmenu-gtk3 libsoup3 polkit
```

```bash
# Fedora
sudo dnf install typescript npm meson gjs-devel gtk3-devel gtk-layer-shell-devel gtk-session-lock-devel gnome-bluetooth upower NetworkManager pulseaudio-libs-devel libdbusmenu-gtk3 libsoup3 polkit-devel
```

```bash
# Ubuntu
sudo apt install node-typescript npm meson libgjs-dev gjs libgtk-layer-shell-dev libgtk-session-lock-dev libgtk-3-dev libpulse-dev network-manager-dev libgnome-bluetooth-3.0-dev libdbusmenu-gtk3-dev libsoup-3.0-dev libpolkit-agent-1-dev libpolkit-gobject-1-dev
```

```bash
# Clone, build, and  install
$ git clone --recursive https://github.com/Aylur/ags.git && cd ags
$ pnpm install
$ meson setup build
$ meson install -C build
```

## Running

```bash
# RAGS provides `ags` as the main binary for compatibility. This may change
# in the future.
$ ags --help
```
