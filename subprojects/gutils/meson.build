project('pam', 'c')

pkglibdir = get_option('pkglibdir')
pkgdatadir = get_option('pkgdatadir')

cc = meson.get_compiler('c')

# wayland-scanner for protocol code generation
wayland_scanner = find_program('wayland-scanner', required: true)

gen_client_header = generator(
  wayland_scanner,
  output: '@BASENAME@-client-protocol.h',
  arguments: ['client-header', '@INPUT@', '@OUTPUT@'],
)

gen_client_code = generator(
  wayland_scanner,
  output: '@BASENAME@-client-protocol.c',
  arguments: ['private-code', '@INPUT@', '@OUTPUT@'],
)

protocol_xml = files('ext-session-lock-v1.xml')
protocol_header = gen_client_header.process(protocol_xml)
protocol_code = gen_client_code.process(protocol_xml)

libsources = ['pam.c', 'pam.h', 'session-lock.c', 'session-lock.h', protocol_header, protocol_code]

deps = [
  dependency('gobject-2.0'),
  dependency('gio-2.0'),
  dependency('pam'),
  dependency('wayland-client'),
  dependency('cairo'),
  dependency('xkbcommon'),
]

girlib = shared_library(
  'gutils',
  sources: libsources,
  dependencies: deps,
  install: true
)

gnome = import('gnome')
gnome.generate_gir(
  girlib,
  sources: libsources,
  nsversion: '1.0',
  namespace: 'GUtils',
  symbol_prefix: 'gutils',
  identifier_prefix: 'GUtils',
  includes: ['GObject-2.0', 'Gio-2.0', 'cairo-1.0'],
  install_dir_gir: pkgdatadir,
  install_dir_typelib: pkglibdir,
  install: true
)

install_data(
  'ags',
  install_dir: get_option('sysconfdir') / 'pam.d'
)
