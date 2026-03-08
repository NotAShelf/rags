<!--markdownlint-disable MD024-->

# RAGS Changelog

## 1.11.0

This release represents a comprehensive refactoring of the RAGS codebase,
focusing on memory management, type safety, error handling, and performance.
There is _a lot_ of new changes. Some of those are breaking, but user
configurations should not be affected. In certain edge-cases, i.e., custom
services the users may need to update. See below for a full list of changes.

### Added

- Error class hierarchy: `AgsError`, `AgsConfigError`, `AgsServiceError`,
  `AgsDBusError`, `AgsRuntimeError` with context support
- Global signal registry (`SignalRegistry`) for centralized connection tracking
  and cleanup
- `Disposable` interface and pattern for explicit resource cleanup
- Type-safe GObject helpers for safer property access
- Type-safe signal definitions with `SignalDefinition` and `SignalPayload` types

- Lazy window registration via `App.registerLazyWindow()`, for windows created
  on-demand
- Runtime theme switching with `App.registerTheme()`, `App.setTheme()`,
  `App.activeTheme`
- Window names automatically added as CSS classes for scoping

- `autoSuspend` option to defer polling until bound to visible widgets
- `dispose` signal emitted on cleanup

- `diffBind()` method for binding to differences between values
- Development warnings for unregistered signals
- Error recovery with exponential backoff (`retryWithBackoff`)
- `error` signal emitted on service failures

- Frame-synced animation primitives
- System info helpers
- Promisified `send_and_read_async` with `GLib.PRIORITY_DEFAULT`

### Changed

- Comprehensive JSDoc added to all public APIs
- Service lifecycle documentation (Construction → Initialization → Ready →
  Disposal)
- Dropped various deprecated features and cleanup
- Improved widget registration and initialization
- Widget `class_names` getter now cached (called hundreds of times per second)
- Battery icon name caching to reduce repeated string allocations
- Network access points caching infrastructure

- All signal handlers now have null-safe cleanup
- Widget `_onHandlerIds` initialized properly with destroy cleanup
- Improved signal handler lifecycle management

- Notifications: Added `_timeoutIds` Map to track and cancel timeouts properly
- Network: Added null check for `get_ssid()`; changed `.map` to `.forEach` where
  appropriate
- App: Fixed deprecation warnings (`cacheCoverArt` to `maxStreamVolume`)
- Fetch: Wrapped `GBytes` from `send_and_read_async` in `MemoryInputStream`

Some of the breaking changes:

- All services now implement `Disposable` interface
- Services require explicit `dispose()` calls for cleanup
- Signal connections must be tracked with `trackConnection()` and
  `globalSignalRegistry.register()`

- Variable class now throws errors instead of logging them in many cases
- Empty catch blocks replaced with proper error handling
- Errors include context for better debugging

- Widget base class uses native private fields (`#field`) instead of `__field`
  pattern
- Internal widget storage changed from direct properties to `#internalFields`
  Map

### Fixed

- Memory leaks in signal connection management across all services
- Non-null assertions, which got replaced with proper validation
- Type safety issues
- CSS error handling and reporting improved

## 1.10.0

Maintenance release to prepare the repository for future plans. Features
dependency updates, minor bug fixes, and a large number of tooling
consolidation. There should be no breaking changes between 1.9.0 and 1.10.0.

We've migrated to PNPM, and a more Nix-centric setup with proper CI/CD and
user-facing documentation.

### Added

- TypeDoc setup for generated type documentation
- Hand-written guides in documentation
- Comprehensive JSDoc annotations across all modules
- GitHub Pages deployment for documentation
- Project README updated with usage examples
- New prettier configuration

### Changed

- Streamlined ESLint flat config (ESLint 10 compatible)
- Bumped all dependencies to latest versions

### Fixed

- Linting issues across codebase
- Dependency hashes updated
- SystemTray now uses a `Widget` wrapper for `DbusmenuGtk3.Menu`, which fixes
  styling issues
