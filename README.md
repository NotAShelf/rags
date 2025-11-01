# RAGS (raf's AGS)

## Synopsis

[Aylur's GTK Shell]: https://github.com/aylur/ags

RAGS is a fork of [Aylur's GTK Shell] (AGS), based on the last available v1 tag.
This project exists primarily due to the fact that I _simply do not care about
the new features_, and remain inconvenienced by the prospect of migrating to v2.
I also find the new syntax wildly unintuitive, so migration is simply non-ideal.

The purpose of this fork is to keep AGS v1 usable. I will focus primarily on
performance and security, as well as packaging. The goal is to avoid bitrot with
as few feature additions as possible. That said, I _am_ open to feature requests
or even pull requests if you wish to stick to v1, but have certain (minor)
gripes that are annoying you.

### What is AGS?

[GJS]: https://gitlab.gnome.org/GNOME/gjs
[GNOME Shell]: https://gitlab.gnome.org/GNOME/gnome-shell

(R)AGS is a library built for [GJS] to allow defining GTK widgets in a
declarative way. It also provides services and other utilities to interact with
the system so that these widgets can have functionality. GJS is a JavaScript
runtime built on Firefox's SpiderMonkey JavaScript engine and the GNOME platform
libraries, the same runtime [GNOME Shell] runs on.

### Why Fork?

I simply do not wish to switch to AGS v2. The documentation is still subpar, and
the now scattered documentation for AGS and Astal started getting on my nerves
while trying to migrate. As such I want to continue using v1, but also ensure
that it remains usable for the duration I continue using it. Maybe you are in a
similar position, and could benefit from a public fork.

## Future Plans

My main plans for RAGS is to focus solely on performance and security. I will
add no new widgets, as I have no need for them. What I really want to do is to
make sure that the codebase ages well, and maybe even add a dash of Rust (likely
via WASM) wherever it may provide performance or maintainability benefits.

## Building

You'll probably want to package RAGS for your distribution if you're looking to
use it yourself. I only support Nix, but you may PR package manifests
(PKGBUILDs, RPMs, etc.) if you're interested in using RAGS. I will not reject
such PRs, and might make an effort to support legacy FHS distributions in the
future.

For now, here's a general guide you'll want to follow:

```bash
meson setup builddir
meson compile -C builddir
```

The main binary will be available at `builddir/src/com.github.Aylur.ags`. You
can rename it to whatever you want the binary to be called.

To install it system-wide:

```bash
meson install -C builddir
```

### Dependencies

Building RAGS requires the following dependencies to be available in your
system:

- meson, ninja
- typescript
- pkg-config
- gobject-introspection
- gjs
- gtk3
- libpulseaudio
- And various other GNOME libraries (see `nix/package.nix` for complete list)

If you're using Nix, the default dev shell can be used to build RAGS with Meson
without invoking `nix build`.

## Attributions

[Aylur]: https://github.com/aylur
[EWW]: https://github.com/elkowar/eww

First and foremost, I thank [Aylur] for creating such an extensive framework. It
has been serving me well for over a year, and it will continue to do so for the
foreseeable future. The original AGS was heavily inspired by [EWW], and as such
I extend my thanks to EWW as well.

## License

RAGS is released under [GPL v3](./LICENSE) following upstream license. Please
respect the original author if forking this repository.
