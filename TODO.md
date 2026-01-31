# Planned features/improvements

## Services

- [x] Power profiles [#218](https://github.com/Aylur/ags/pull/218)
- [x] Greetd [#282](https://github.com/Aylur/ags/pull/282)
- [ ] Evolution data server - allows for to sync with calendars, TODOs and
      contact lists
- [ ] Improve Network service - its currently very barebones, and state changes
      are not properly signaled

## Utilities

- Utility GObject based library in c
  - [x] pam module [#273](https://github.com/Aylur/ags/pull/273)
  - [ ] ext-session-lock
- [x] fetch util function [#187](https://github.com/Aylur/ags/pull/187)
- [x] toJSON overridies [#203](https://github.com/Aylur/ags/pull/203)
- [ ] Circular slider widget
- Subclass more widget
  - [ ] Gtk.Fixed
  - [ ] Gtk.Grid

## Nix

- [ ] NixOS module
- [x] binary cache [#212](https://github.com/Aylur/ags/pull/212)

- package generated types and @gir types
  - [ ] ~~github action to package types~~
  - [x] install them at ~~/etc/ags~~ pkgdatadir/share with meson
  - [x] `--init` cli flag
