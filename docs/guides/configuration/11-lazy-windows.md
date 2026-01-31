---
title: Lazy Windows
description: Defer window construction until first use
category: Guides
group: Configuration
---

By default, all windows passed to `App.config({ windows })` are constructed
immediately at startup. For shells with many windows (launchers, dashboards,
settings panels) this adds to startup time even when those windows are never
opened.

> [!NOTE]
> The `lazyWindows` config field lets you register a **factory function**
> instead. The window is only constructed the first time it is opened via
> `App.openWindow()` or `App.toggleWindow()`.

## Basic usage

```js
App.config({
  windows: [
    Bar(), // constructed immediately
  ],

  lazyWindows: {
    // Only constructed when you run: App.openWindow('launcher')
    "launcher": () => Launcher(),
    "dashboard": () => Dashboard(),
  },
});
```

Each key is the window name (must match the `name` property of the window
returned by the factory). The value is a zero-argument function that returns a
`Gtk.Window`.

## How it works

<!--markdownlint-disable MD013-->

| Action                   | Unconstructed lazy window                 | Already constructed |
| ------------------------ | ----------------------------------------- | ------------------- |
| `App.openWindow(name)`   | Calls factory, registers window, shows it | Shows it            |
| `App.toggleWindow(name)` | Calls factory, registers window, shows it | Toggles visibility  |
| `App.closeWindow(name)`  | No-op (nothing to hide)                   | Hides it            |
| `App.getWindow(name)`    | Returns `undefined` (no error logged)     | Returns the window  |

<!--markdownlint-enable MD013-->

After the factory runs once, the window behaves identically to an
eagerly-constructed window. The factory is deleted after use and will not be
called again.

## Toggling from a keybind or DBus

Lazy windows work transparently with `ags --toggle-window`:

```bash
ags --toggle-window launcher
```

On first invocation this constructs the window and shows it. Subsequent
invocations toggle visibility normally.

## Duplicate name protection

If a name appears in both `windows` and `lazyWindows`, an error is logged and
the lazy entry is skipped. The eagerly-constructed window takes precedence.

```js
// BAD: 'bar' is registered twice
App.config({
    windows: [
        Widget.Window({ name: 'bar', ... }),
    ],
    lazyWindows: {
        'bar': () => Widget.Window({ name: 'bar', ... }),
        // ^ Will throw an error: a window with that name already exists
    },
})
```

## When to use lazy windows

Use `lazyWindows` for windows that:

- Are opened infrequently (settings panels, about dialogs)
- Contain heavy widget trees (app launchers with many entries)
- Depend on services that take time to initialise

Keep using `windows` for windows that must be visible at startup (bars,
notification popups).
