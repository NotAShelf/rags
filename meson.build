project('rags', 'c',
          version: run_command('cat', join_paths(meson.project_source_root(), 'version')).stdout().strip(),
    meson_version: '>= 0.62.0',
          license: ['GPL-3.0-or-later'],
  default_options: [ 'warning_level=2', 'werror=false', ],
)

subdir('ags')
