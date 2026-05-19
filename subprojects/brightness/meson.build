project('brightness', 'c',
  default_options: ['warning_level=2', 'werror=false'],
)

pkglibdir = get_option('pkglibdir')
pkgdatadir = get_option('pkgdatadir')

cc = meson.get_compiler('c')

libsources = ['brightness.c', 'brightness.h']

deps = [
  dependency('gobject-2.0'),
  dependency('gio-2.0'),
]

girlib = shared_library(
  'brightness',
  sources: libsources,
  dependencies: deps,
  install: true,
)

gnome = import('gnome')
gnome.generate_gir(
  girlib,
  sources: libsources,
  nsversion: '1.0',
  namespace: 'Brightness',
  symbol_prefix: 'brightness',
  identifier_prefix: 'Brightness',
  includes: ['GObject-2.0', 'Gio-2.0'],
  install_dir_gir: pkgdatadir,
  install_dir_typelib: pkglibdir,
  install: true,
)
