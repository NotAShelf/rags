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

## API Documentation

This documentation site is auto-generated from JSDoc comments in the RAGS source
code using [TypeDoc](https://typedoc.org). Use the sidebar to navigate between
modules, or the search bar to find specific classes, functions, or types.

The API is organized into several areas:

- **Widgets** -- GTK widget wrappers with reactive property binding
  (`widgets/box`, `widgets/button`, `widgets/window`, etc.)
- **Services** -- Singleton GObject classes exposing system state
  (`service/audio`, `service/battery`, `service/network`, etc.)
- **Utils** -- Helper functions for shell commands, file I/O, timers, and more
  (`utils/exec`, `utils/file`, `utils/timeout`, etc.)
- **Core** -- The reactive primitives: `Variable`, `Binding`, `Service` base
  class, and the `App` singleton

## Quick Start

A minimal RAGS configuration file:

```javascript
const time = Variable('', {
    poll: [1000, function() {
        return Date().toString()
    }],
})

const Bar = (monitor) => Widget.Window({
    monitor,
    name: `bar${monitor}`,
    anchor: ['top', 'left', 'right'],
    exclusivity: 'exclusive',
    child: Widget.CenterBox({
        start_widget: Widget.Label({
            hpack: 'center',
            label: 'Welcome to AGS!',
        }),
        end_widget: Widget.Label({
            hpack: 'center',
            label: time.bind(),
        }),
    }),
})

App.config({
    windows: [Bar(0)],
})
```

## Usage Examples

### Widgets

Widgets are GTK 3 widget classes extended with reactive capabilities. Every
widget supports property binding, CSS styling, event hooks, and keyboard
shortcuts through the common `Widget` mixin.

All widgets accept a `setup` callback invoked after construction, and support
`.hook()`, `.bind()`, `.on()`, `.poll()`, and `.keybind()` methods for
reactive composition.

<details open>
<summary>Widget examples</summary>

```typescript
// Create widgets using factory functions
const myBox = Widget.Box({
    vertical: true,
    css: 'padding: 12px;',
    children: [
        Widget.Label({ label: 'Hello' }),
        Widget.Button({
            child: Widget.Label({ label: 'Click me' }),
            on_clicked: (self) => print('clicked!'),
        }),
    ],
})

// Bind reactive data to widget properties
const myLabel = Widget.Label({
    label: someVariable.bind(),
})

// Use CSS class toggling
const myButton = Widget.Button({
    setup: (self) => {
        self.toggleClassName('active', true)
    },
})
```

</details>

### Variables

`Variable` is the core reactive primitive. It holds a value and notifies
listeners when it changes.

<details open>
<summary>Variable examples</summary>

```typescript
// Simple variable
const count = Variable(0)
count.value++

// Poll a command every 5 seconds
const cpu = Variable('', {
    poll: [5000, 'top -bn1 | grep Cpu'],
})

// Listen to a subprocess output stream
const workspaces = Variable([], {
    listen: ['hyprctl workspaces -j', (out) => JSON.parse(out)],
})

// Bind to a widget property
Widget.Label({ label: count.bind().as(v => `Count: ${v}`) })
```

</details>

### Bindings

Bindings connect reactive sources (services, variables) to widget properties.
They transform values through a functional pipeline.

<details open>
<summary>Binding examples</summary>

```typescript
// Bind a service property
Widget.Label({
    label: Audio.speaker.bind('volume').as(
        (v) => `Volume: ${Math.round(v * 100)}%`
    ),
})

// Merge multiple bindings
const label = Utils.merge(
    [Battery.bind('percent'), Battery.bind('charging')],
    (percent, charging) => `${percent}%${charging ? ' (charging)' : ''}`
)
```

</details>

### Services

Services are singleton GObject subclasses that expose system state via D-Bus
or other backends. They emit signals and notify on property changes.

<details open>
<summary>Service examples</summary>

```typescript
// Audio service
const volume = Audio.speaker?.volume ?? 0
Audio.speaker?.connect('changed', () => {
    print(`Volume: ${Audio.speaker.volume}`)
})

// Battery service
Widget.Label({
    label: Battery.bind('percent').as(p => `${p}%`),
})

// Network service
const ssid = Network.wifi?.ssid
const strength = Network.wifi?.strength

// Hyprland IPC
Hyprland.active.workspace.bind('id')

// MPRIS media players
const player = Mpris.players[0]
player?.playPause()
```

</details>

### Utility Functions

<details open>
<summary>Utility examples</summary>

```typescript
// Run shell commands
const output = Utils.exec('whoami')
const asyncOutput = await Utils.execAsync('ls -la')

// Spawn a long-running subprocess
Utils.subprocess(
    ['tail', '-f', '/tmp/some.log'],
    (line) => print(line),
)

// File I/O
const content = Utils.readFile('/etc/hostname')
await Utils.writeFile('hello', '/tmp/test.txt')
Utils.monitorFile('/tmp/test.txt', (file, event) => {
    print(`File changed: ${event}`)
})

// Timers
Utils.timeout(1000, () => print('1 second later'))
Utils.interval(5000, () => print('every 5 seconds'))

// Desktop notifications
Utils.notify({
    summary: 'Hello',
    body: 'This is a notification',
    iconName: 'dialog-information',
})
```

</details>

### Windows and Layer Shell

Windows are positioned using the Wayland Layer Shell protocol.

<details open>
<summary>Window examples</summary>

```typescript
Widget.Window({
    name: 'my-bar',
    anchor: ['top', 'left', 'right'],
    exclusivity: 'exclusive',
    layer: 'top',
    monitor: 0,
    margins: [0, 0, 0, 0],
    keymode: 'on-demand',
    child: Widget.Box({ /* ... */ }),
})
```

</details>

### Application Lifecycle

The `App` singleton manages windows, CSS, and the application lifecycle.

<details open>
<summary>App examples</summary>

```typescript
App.config({
    style: './style.css',
    windows: [Bar(0), Notifications()],
})

// Dynamically manage windows
App.toggleWindow('my-popup')
App.openWindow('my-popup')
App.closeWindow('my-popup')

// Hot-reload CSS
App.resetCss()
App.applyCss('./style.css')
```

</details>

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
