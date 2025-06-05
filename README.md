# RAGS

## Synopsis

RAGS is a fork of Aylur's GTK Shell (AGS), based on AGS v1 as I _simply do not
care about the new features_, and remain inconvenienced by the prospect of
migrating to v2.

For the purposes of this fork, I will focus primarily on performance and
security improvements, i.e., avoid bitrot with just a little focus on feature
additions.

That said, I _am_ open to feature requests or even pull requests if you wish to
stick to v1, but have certain (minor) gripes that are annoying you.

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
make sure that the codebase ages well, and maybe even add a dash of Rust
wherever it may provide performance or maintainability benefits.

See the partially up-to-date [TODO list](./TODO.md) for a list of things I plan
to add.

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
