import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { rollup } from 'rollup';

const [manifest, compiled, output, resource, compiler] = process.argv.slice(2);
const xml = await readFile(manifest, 'utf8');
const files = [...xml.matchAll(/<file>([^<]+)<\/file>/g)].map(match => match[1]);
const input = Object.fromEntries(
    files
        .filter(file => file.endsWith('.js'))
        .map(file => [file.slice(0, -3), join(compiled, file)]),
);
const bundle = await rollup({
    input,
    external: id => !id.startsWith('.') && !id.startsWith('/'),
    preserveEntrySignatures: 'strict',
    treeshake: false,
});
try {
    const generated = await bundle.write({
        dir: output,
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'internal/chunks/[name]-[hash].js',
        manualChunks: id => (id.includes('/service/') ? undefined : 'runtime'),
        onlyExplicitManualChunks: true,
    });
    for (const file of files.filter(file => !file.endsWith('.js'))) {
        await mkdir(dirname(join(output, file)), { recursive: true });
        await copyFile(join(dirname(manifest), file), join(output, file));
    }
    const resources = [
        ...generated.output.map(file => file.fileName),
        ...files.filter(file => !file.endsWith('.js')),
    ];
    await writeFile(
        join(output, 'runtime.gresource.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n<gresources>\n' +
            '  <gresource prefix="/com/github/Aylur/ags">\n' +
            resources.map(file => `    <file>${file}</file>\n`).join('') +
            '  </gresource>\n</gresources>\n',
    );
    execFileSync(
        compiler,
        ['--sourcedir', output, '--target', resource, join(output, 'runtime.gresource.xml')],
        { stdio: 'inherit' },
    );
} finally {
    await bundle.close();
}
