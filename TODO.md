# Planned Features & Improvements

## Critical

The entire toolchain needs to be updated. We're outdated, we are _severely_
outdated.

## Medium Priority

- [ ] Re-organize repository, get CI going
- [ ] Build & publish documentation
- [ ] Strict lints; fix errors that arise
- [ ] Add JSDoc to remaining functions.
- [ ] NixOS module
- [ ] Publish packages
- [ ] Documentation for examples
  - [ ] Support examples for the init command

## Future Plans

I want to consider a WASM based extension system for small utilities. We might
see some performance benefits, especially from replacing the entrypoint. I will
NOT be using Go, however, unlike AGS v2. I also plan to keep the syntax
identical.

GTK4 support will be considered, but it is not a priority. A migration surely is
not easy, and I want to allocate my resources to having a maintainable project
first and foremost.
