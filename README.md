# RAGS - raf's (fork of) AGS

## Synopsis

[Aylur's GTK Shell]: https://github.com/aylur/ags
[issues tab]: https://github.com/NotAShelf/rags/issues

RAGS is a fork of [Aylur's GTK Shell] (AGS), based on the last available v1 tag.
This project exists primarily due to the fact that I _simply do not care about
the new features_, and remain inconvenienced by the prospect of migrating to v2.
I also find the new syntax wildly unintuitive, so migration is simply non-ideal.

The purpose of this fork is to keep AGS v1 usable. I will focus primarily on
performance and security, as well as packaging. The goal is to avoid bitrot with
as few feature additions as possible. That said, I _am_ open to feature requests
or even pull requests if you wish to stick to v1, but have certain (minor)
gripes that are annoying you.

> [!NOTE]
> If you intend to use this repository, or maybe even contribute, I encourage
> you to keep on reading. If you have questions or any points that you would
> like to discuss, please head to the [issues tab] and let us discuss.

### What is AGS?

[GJS]: https://gitlab.gnome.org/GNOME/gjs
[GNOME Shell]: https://gitlab.gnome.org/GNOME/gnome-shell

(R)AGS is a library built for [GJS] to allow defining GTK widgets in a
declarative way. It also provides services and other utilities to interact with
the system so that these widgets can have functionality. GJS is a JavaScript
runtime built on Firefox's SpiderMonkey JavaScript engine and the GNOME platform
libraries, the same runtime [GNOME Shell] runs on.

### Why Fork?

The most burning question of them all. The short answer is that I simply do not
wish to switch to AGS v2, due to a few reasons. The primary reason is that the
documentation is still subpar, and the return for my investment will simply not
be worth it. I have to migrate to Astal, and that means I have to rewrite most
of my configuration. The now scattered documentation of AGS and Astal got on my
nerves, and I imagine it has only gotten worse with v3.

As such I want to continue using v1, but also ensure that it remains usable for
the duration I continue using it. Maybe you are in a similar position, and could
benefit from a public fork. RAGS is that public fork. Packagers may be inclined,
but not particularly encouraged to update their packages.

## What has been done?

Most of the time was spent modernizing the codebase. The Nix packages were
simplified, and dependency resolution is now done with PNPM. While I was working
with PNPM, I have went ahead and updated some of the tooling (mainly ESLint and
Typescript) to their latest versions to maybe leave more room for better
linting, CI and automation in the future.

> [!TIP]
> Some types have changed, and the codebase has been updated to reflect this. If
> you relied on AGS GIR types, it is likely that you will need to update your
> setup.

### New Releases

RAGS 1.10.0 has been mostly a maintenance release, with the repository
re-adjusted for long-term maintenance and various dependencies updated to their
latest versions. 1.10.0+ brings new additions such as better null checks,
expanded widgets in the place of plain or bare-bones ones and exciting new
features such as lazy-loaded windows and dynamic theme switching.

The future of RAGS is bright, and you are invited to be a part of it.

## Documentation

API reference and usage guides are available at the generated documentation
site. Build it locally with `pnpm docs`, or see the `docs/` directory for source
files.

## Future Plans

My main plan for RAGS, from the point of forking, has been to focus _mostly_ but
not exclusively to focus on performance and security. This is rather a side
effect of keeping dependencies up to date, but I'll make a focucsed effort on
optimizing this program since it is a critical component of my desktop systems.

I quite frankly do not intend, nor care, to add any new widgets or services as I
do not have any need for them, however, I am ammendable to _critical_ additions
that make the RAGS experience better without degrading maintainability.

What I _really_ want to achieve with this repository is to have the codebse age
well, without bitrotting over time and avoiding conflicts due to changing
toolchain and dependencies. This usually has good security implications, and I
care deeply about the security of a program that can run arbitrary Javascript on
my system.

As a final note, I would like to add a dash of Rust or Zig to this codebase to
perhaps modernize the primary interface a little. Since we interact mainly with
GTK and use bindings, this could also make RAGS evolve into its own thing over
time and reduce some of the maintenance burden due to the removal of a layer of
abstraction.

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

RAGS is released under [GPL v3.0](./LICENSE), following upstream license. Please
respect the original author if forking this repository.
