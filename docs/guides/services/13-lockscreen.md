---
title: Lockscreen
description: Secure Wayland session-lock integration
category: Guides
group: Services
---

The `lockscreen` service wraps the Wayland `ext-session-lock-v1` protocol
through the `gtk-session-lock` library. RAGS owns the lock surfaces; it does not
launch a separate locker program.

## Setup

Build RAGS with the `gtk-session-lock` library available, and run it under a
compositor that supports `ext-session-lock-v1`. For password unlocks, the
service uses the existing PAM utility:

```nix
security.pam.services.ags = {};
```

Under NixOS `gtk-session-lock` is a part of the RAGS packaging. Other
distributions may need to install it manually.

## Example

```js
import Gtk from "gi://Gtk?version=3.0";

const lockscreen = await Service.import("lockscreen");

function Surface(monitor, index) {
  const entry = Widget.Entry({
    visibility: false,
    on_accept: async (self) => {
      try {
        await lockscreen.unlockWithPassword(self.text);
      } catch (error) {
        self.text = "";
        logError(error, "unlock failed");
      }
    },
  });

  return new Gtk.Window({
    name: `lock-${index}`,
    child: Widget.Box({
      vertical: true,
      vpack: "center",
      hpack: "center",
      children: [
        Widget.Label({ label: "Locked" }),
        entry,
      ],
    }),
  });
}

lockscreen.lock(Surface);
```

## API

### Properties

- `available`: `boolean` - whether session-lock is supported.
- `locked`: `boolean` - whether the current lock is active.
- `protocol_version`: `number` - compositor protocol version, or `0`.

### Methods

- `refresh()` updates `available` and `protocol_version`.
- `lock(factory)` locks the session and creates one surface per monitor.
- `unlock()` unlocks an active lock. Call this only after authentication.
- `unlockWithPassword(password, username?, service?)` authenticates with PAM and
  unlocks. The default PAM service is `ags`.
- `cancel()` cancels a lock that has not become active yet.

### Signals

- `locked` fires when the compositor confirms the lock.
- `unlocked` fires when `unlock()` is called.
- `finished` fires when the lock object is no longer active.
