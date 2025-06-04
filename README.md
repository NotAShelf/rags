# RAGS

> [!NOTE]
> This is a fork of AGS, continuing the legacy of AGS v1 as I simply do not care
> about JSX syntax, and remain uninterested in the current state of Astal
> documentation. I will focus primarily on performance and security improvements
> wherever possible, and very little feature additions will be made. Though, I
> am open to requests from those who wish to stick to v1 with little changes.

[GJS]: https://gitlab.gnome.org/GNOME/gjs
[GNOME Shell]: https://gitlab.gnome.org/GNOME/gnome-shell

(R)AGS is a library built for [GJS] to allow defining GTK widgets in a
declarative way. It also provides services and other utilities to interact with
the system so that these widgets can have functionality. GJS is a JavaScript
runtime built on Firefox's SpiderMonkey JavaScript engine and the GNOME platform
libraries, the same runtime [GNOME Shell] runs on.

## Attributions

First and foremost, I thank Aylur for creating such an extensive framework. It
has been serving me well for over a year, and it will continue to do so for the
foreseeable future.

The original AGS was heavily inspired by [EWW](https://github.com/elkowar/eww),
and as such I extend my thanks to EWW as well.
