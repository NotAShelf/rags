# Planned features/improvements

- **Services**
  - [x] power profiles [#218](https://github.com/Aylur/ags/pull/218)
  - [x] greetd [#282](https://github.com/Aylur/ags/pull/282)
  - [ ] Improve Network service - its currently very barebones, and state
        changes are not properly signaled

- **Utility gobject based library in C**
  - [x] pam module [#273](https://github.com/Aylur/ags/pull/273)
  - [ ] ext-session-lock

- [x] fetch util function [#187](https://github.com/Aylur/ags/pull/187)
- [x] toJSON overridies [#203](https://github.com/Aylur/ags/pull/203)

- **Nix**
  - [ ] NixOS module
  - [x] binary cache [#212](https://github.com/Aylur/ags/pull/212)

- **Package generated types and `@gir` types**
  - [ ] ~~github action to package types~~

- **Documentation**
  - [ ] Add JSDoc to most stuff
  - [ ] Build documentation from the source tree

- **Security & Performance Critical Issues**
  - [ ] Clear password memory after use in C PAM module. Passwords currently
        remain in memory until GC.
  - [ ] Input sanitization to exec/execAsync functions; current impl passes
        unsanitized user input to `GLib.shell_parse_argv`
  - [ ] URL validation and request size limits in fetch utility to prevent SSRF
        attacks
  - [ ] Fix incomplete switch statement in _CONNECTION_STATE function (in
        network.ts)
  - [ ] Add explicit cleanup for file monitors and GC optimization for
        long-running processes
  - [ ] Add input validation for DBus method calls to prevent malformed data
        injection
