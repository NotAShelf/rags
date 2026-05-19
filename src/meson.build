# config.h for the C binary
configure_file(
  input:  'config.h.in',
  output: 'config.h',
  configuration: {
    'APP_ID':          app_id,
    'PACKAGE_VERSION': meson.project_version(),
    'PKGDATADIR':      pkgdatadir,
  },
)

install_data(
  'init/config.js',
  'init/tsconfig.json',
  'init/README.md.in',
  install_dir: pkgdatadir / 'init',
)

install_data(
  'ags.d.ts.in',
  install_dir: pkgdatadir,
)

executable('ags',
  sources: ['main.c'],
  dependencies: [
    dependency('glib-2.0'),
    dependency('gio-2.0'),
  ],
  install: true,
  install_dir: bindir,
)

# typescript
tsc = find_program('tsc', required: true)
tsc_out = meson.project_build_root() / 'tsc-out'
typescript = custom_target(
  'typescript-compile',
  input: files( 'main.ts' ),
  build_by_default: true,
  build_always_stale: true,
  command: [ tsc, '--outDir', tsc_out ],
  output: ['tsc-output'],
)

# GJS launcher, internal file in pkgdatadir, exec'd by the C binary
configure_file(
  input: app_id + '.js.in',
  output: app_id + '.gjs',
  configuration: {
    'GJS': find_program('gjs').full_path(),
    'APP_ID': app_id,
    'PACKAGE_VERSION': meson.project_version(),
    'PREFIX': prefix,
    'LIBDIR': libdir,
    'RESOURCE_PATH': '/com/github/Aylur/ags',
  },
  install: true,
  install_dir: pkgdatadir,
)

# gresource
import('gnome').compile_resources(
  app_id + '.src',
  app_id + '.src.gresource.xml',
  dependencies: typescript,
  source_dir: tsc_out,
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)
