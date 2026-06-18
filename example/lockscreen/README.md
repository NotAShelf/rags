# Lockscreen Example

This config demonstrates only the `lockscreen` service.

Requirements:

- A Wayland compositor with `ext-session-lock-v1` support.
- RAGS built with the `gtk-session-lock` library available to GJS.
- A PAM service that accepts local password authentication. This example uses
  `login` so it can be tested without adding `/etc/pam.d/ags` first.

Run with:

```sh
ags --config example/lockscreen/config.js
```
