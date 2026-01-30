---
title: RAGS Documentation
---

RAGS (raf's AGS) is a fork of [Aylur's GTK Shell](https://github.com/aylur/ags)
(AGS) v1, maintained to keep the v1 API stable while focusing on performance,
security, and packaging.

RAGS is a library built for [GJS](https://gitlab.gnome.org/GNOME/gjs) that lets
you define GTK 3 widgets declaratively with reactive property binding. It also
provides services and utilities for interacting with the system so your widgets
can respond to real-time state changes. GJS is the JavaScript runtime built on
SpiderMonkey and GNOME platform libraries --- the same runtime
[GNOME Shell](https://gitlab.gnome.org/GNOME/gnome-shell) uses.

## Navigating the Documentation

This site is split into two specific sections, with differing purposes:

### Guides

Hand-written documentation covering concepts, configuration, and usage. Start
here if you are new to RAGS.

- **Getting Started** - Installation, writing your first widget, JavaScript
  basics, and setting up type checking.
- **Configuration** - The config object, App singleton, Variables, reactivity
  model, widgets, services, utilities, theming, CLI usage, and Home Manager
  integration.
- **Advanced** - Writing custom services, subclassing GTK widgets, common
  issues, and example configurations.
- **Services** - Reference pages for each built-in service: Applications, Audio,
  Backlight, Battery, Bluetooth, Greetd, Hyprland, MPRIS, Network,
  Notifications, Power Profiles, and System Tray.

### API Reference

Auto-generated from JSDoc annotations in the source code, listed under
**Modules** in the sidebar. The main areas are:

- **Widgets** - GTK widget wrappers with reactive property binding (`Box`,
  `Button`, `Label`, `Window`, `Slider`, `Stack`, and 27 more).
- **Services** - Singleton GObject classes exposing system state (`Audio`,
  `Battery`, `Network`, `Hyprland`, `Mpris`, etc.).
- **Utils** - Helper functions for shell commands, file I/O, timers, HTTP
  requests, and desktop notifications.
- **Core** - The reactive primitives: `Variable`, `Binding`, `Service` base
  class, and the `App` singleton.

> [!TIP]
> Use the sidebar to navigate between sections, or the search bar to find
> specific classes, functions, or types.

## Quick Example

```javascript
const time = Variable("", {
  poll: [1000, function () {
    return Date().toString();
  }],
});

const Bar = (monitor) =>
  Widget.Window({
    monitor,
    name: `bar${monitor}`,
    anchor: ["top", "left", "right"],
    exclusivity: "exclusive",
    child: Widget.CenterBox({
      start_widget: Widget.Label({
        hpack: "center",
        label: "Welcome to RAGS!",
      }),
      end_widget: Widget.Label({
        hpack: "center",
        label: time.bind(),
      }),
    }),
  });

App.config({
  windows: [Bar(0)],
});
```

## Usage Examples

### Widgets

Widgets are GTK 3 widget classes extended with reactive capabilities. Every
widget supports property binding, CSS styling, event hooks, and keyboard
shortcuts through the common `Widget` mixin.

All widgets accept a `setup` callback invoked after construction, and support
`.hook()`, `.bind()`, `.on()`, `.poll()`, and `.keybind()` methods for reactive
composition.

```typescript
// Create widgets using factory functions
const myBox = Widget.Box({
  vertical: true,
  css: "padding: 12px;",
  children: [
    Widget.Label({ label: "Hello" }),
    Widget.Button({
      child: Widget.Label({ label: "Click me" }),
      on_clicked: (self) => print("clicked!"),
    }),
  ],
});

// Bind reactive data to widget properties
const myLabel = Widget.Label({
  label: someVariable.bind(),
});

// Use CSS class toggling
const myButton = Widget.Button({
  setup: (self) => {
    self.toggleClassName("active", true);
  },
});
```

### Variables

`Variable` is the core reactive primitive. It holds a value and notifies
listeners when it changes.

```typescript
// Simple variable
const count = Variable(0);
count.value++;

// Poll a command every 5 seconds
const cpu = Variable("", {
  poll: [5000, "top -bn1 | grep Cpu"],
});

// Listen to a subprocess output stream
const workspaces = Variable([], {
  listen: ["hyprctl workspaces -j", (out) => JSON.parse(out)],
});

// Bind to a widget property
Widget.Label({ label: count.bind().as((v) => `Count: ${v}`) });
```

### Bindings

Bindings connect reactive sources (services, variables) to widget properties.
They transform values through a functional pipeline.

```typescript
// Bind a service property
Widget.Label({
  label: Audio.speaker.bind("volume").as(
    (v) => `Volume: ${Math.round(v * 100)}%`,
  ),
});

// Merge multiple bindings
const label = Utils.merge(
  [Battery.bind("percent"), Battery.bind("charging")],
  (percent, charging) => `${percent}%${charging ? " (charging)" : ""}`,
);
```

### Services

Services are singleton GObject subclasses that expose system state via D-Bus or
other backends. They emit signals and notify on property changes.

```typescript
// Audio service
const volume = Audio.speaker?.volume ?? 0;
Audio.speaker?.connect("changed", () => {
  print(`Volume: ${Audio.speaker.volume}`);
});

// Battery service
Widget.Label({
  label: Battery.bind("percent").as((p) => `${p}%`),
});

// Network service
const ssid = Network.wifi?.ssid;
const strength = Network.wifi?.strength;

// Hyprland IPC
Hyprland.active.workspace.bind("id");

// MPRIS media players
const player = Mpris.players[0];
player?.playPause();
```

### Utility Functions

```typescript
// Run shell commands
const output = Utils.exec("whoami");
const asyncOutput = await Utils.execAsync("ls -la");

// Spawn a long-running subprocess
Utils.subprocess(
  ["tail", "-f", "/tmp/some.log"],
  (line) => print(line),
);

// File I/O
const content = Utils.readFile("/etc/hostname");
await Utils.writeFile("hello", "/tmp/test.txt");
Utils.monitorFile("/tmp/test.txt", (file, event) => {
  print(`File changed: ${event}`);
});

// Timers
Utils.timeout(1000, () => print("1 second later"));
Utils.interval(5000, () => print("every 5 seconds"));

// Desktop notifications
Utils.notify({
  summary: "Hello",
  body: "This is a notification",
  iconName: "dialog-information",
});
```

### Windows and Layer Shell

Windows are positioned using the Wayland Layer Shell protocol.

```typescript
Widget.Window({
  name: "my-bar",
  anchor: ["top", "left", "right"],
  exclusivity: "exclusive",
  layer: "top",
  monitor: 0,
  margins: [0, 0, 0, 0],
  keymode: "on-demand",
  child: Widget.Box({/* ... */}),
});
```

### Application Lifecycle

The `App` singleton manages windows, CSS, and the application lifecycle.

```typescript
App.config({
  style: "./style.css",
  windows: [Bar(0), Notifications()],
});

// Dynamically manage windows
App.toggleWindow("my-popup");
App.openWindow("my-popup");
App.closeWindow("my-popup");

// Hot-reload CSS
App.resetCss();
App.applyCss("./style.css");
```

## Links

- [Source code](https://github.com/NotAShelf/rags)
- [Original AGS](https://github.com/aylur/ags)
