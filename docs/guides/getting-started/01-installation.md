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
nix profile install github:Aylur/ags
```

### Single run with `nix run`

or try it without installing

```bash
nix run github:Aylur/ags
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
sudo pacman -S typescript npm meson gjs gtk3 gtk-layer-shell gnome-bluetooth-3.0 upower networkmanager gobject-introspection libdbusmenu-gtk3 libsoup3
```

```bash
# Fedora
sudo dnf install typescript npm meson gjs-devel gtk3-devel gtk-layer-shell gnome-bluetooth upower NetworkManager pulseaudio-libs-devel libdbusmenu-gtk3 libsoup3
```

```bash
# Ubuntu
sudo apt install node-typescript npm meson libgjs-dev gjs libgtk-layer-shell-dev libgtk-3-dev libpulse-dev network-manager-dev libgnome-bluetooth-3.0-dev libdbusmenu-gtk3-dev libsoup-3.0-dev
```

```bash
# clone, build, install
git clone --recursive https://github.com/Aylur/ags.git
cd ags
npm install
meson setup build
meson install -C build
```

## Running

```bash
ags --help
```
