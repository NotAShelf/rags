/**
 * Command execution utilities for running shell commands synchronously,
 * asynchronously, or as long-running subprocesses.
 *
 * @module
 */
import Gtk from 'gi://Gtk?version=3.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Arguments for command execution functions.
 *
 * @typeParam Out - The return type of the stdout handler
 * @typeParam Err - The return type of the stderr handler
 */
type Args<Out = void, Err = void> = {
    cmd: string | string[];
    out?: (stdout: string) => Out;
    err?: (stderr: string) => Err;
};

/** @internal */
function proc(arg: Args | string | string[]) {
    let cmd = Array.isArray(arg) || typeof arg === 'string' ? arg : arg.cmd;

    if (typeof cmd === 'string') {
        const [, argv] = GLib.shell_parse_argv(cmd);
        cmd = argv || [];
    }

    return Gio.Subprocess.new(
        cmd as string[],
        Gio.SubprocessFlags.STDIN_PIPE |
            Gio.SubprocessFlags.STDOUT_PIPE |
            Gio.SubprocessFlags.STDERR_PIPE,
    );
}

function readStream(stream: Gio.DataInputStream, callback: (out: string) => void) {
    stream.read_line_async(GLib.PRIORITY_DEFAULT, null, (_, res) => {
        const output = stream?.read_line_finish_utf8(res)[0];
        if (typeof output === 'string') {
            callback(output.trim());
            readStream(stream, callback);
        }
    });
}

/**
 * Launches a long-running subprocess and streams its stdout/stderr.
 *
 * Returns a `Gio.Subprocess` augmented with `write()` and `writeAsync()`
 * methods for sending data to the subprocess's stdin.
 *
 * @returns The subprocess instance
 *
 * @example
 * ```typescript
 * const proc = subprocess('tail -f /tmp/log', line => {
 *     console.log('new line:', line);
 * });
 * ```
 */
export function subprocess(
    args: Args & {
        bind?: Gtk.Widget;
    },
): Gio.Subprocess;

export function subprocess(
    cmd: string | string[],
    out?: (stdout: string) => void,
    err?: (stderr: string) => void,
    bind?: Gtk.Widget,
): Gio.Subprocess;

export function subprocess(
    argsOrCmd: (Args & { bind?: Gtk.Widget }) | string | string[],
    out: (stdout: string) => void = print,
    err: (stderr: string) => void = err => console.error(Error(err)),
    bind?: Gtk.Widget,
) {
    const p = proc(argsOrCmd);

    const stdin = new Gio.DataOutputStream({
        base_stream: p.get_stdin_pipe() || undefined,
        close_base_stream: true,
    });

    const stdout = new Gio.DataInputStream({
        base_stream: p.get_stdout_pipe() || undefined,
        close_base_stream: true,
    });

    const stderr = new Gio.DataInputStream({
        base_stream: p.get_stderr_pipe() || undefined,
        close_base_stream: true,
    });

    if (bind) bind.connect('destroy', () => p.force_exit());

    const onErr = Array.isArray(argsOrCmd) || typeof argsOrCmd === 'string' ? err : argsOrCmd.err;

    const onOut = Array.isArray(argsOrCmd) || typeof argsOrCmd === 'string' ? out : argsOrCmd.out;

    readStream(stdout, onOut ?? out);
    readStream(stderr, onErr ?? err);

    return Object.assign(p, {
        write(str: string): void {
            stdin.write_all(new TextEncoder().encode(str), null);
        },
        writeAsync(str: string): Promise<void> {
            return new Promise((resolve, reject) => {
                stdin.write_all_async(
                    new TextEncoder().encode(str),
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (stdin, res) => {
                        stdin?.write_all_finish(res)?.[0] ? resolve() : reject();
                    },
                );
            });
        },
    });
}

/**
 * Executes a command synchronously and returns the result.
 *
 * Blocks the main loop until the command completes. Use {@link execAsync}
 * for non-blocking execution.
 *
 * @returns The transformed stdout on success, or transformed stderr on failure
 *
 * @example
 * ```typescript
 * const user = exec('whoami');
 * const parsed = exec('cat config.json', JSON.parse);
 * ```
 */
export function exec<Out = string, Err = string>(args: Args<Out, Err>): Out | Err;
export function exec<Out = string, Err = string>(
    cmd: string | string[],
    out?: (stdout: string) => Out,
    err?: (stderr: string) => Err,
): Out | Err;

export function exec<Out = string, Err = string>(
    argsOrCmd: Args<Out, Err> | string | string[],
    out: (stdout: string) => Out = out => out as Out,
    err: (stderr: string) => Err = out => out as Err,
): Out | Err {
    const p = proc(argsOrCmd);

    const onErr = Array.isArray(argsOrCmd) || typeof argsOrCmd === 'string' ? err : argsOrCmd.err;

    const onOut = Array.isArray(argsOrCmd) || typeof argsOrCmd === 'string' ? out : argsOrCmd.out;

    const [, stdout, stderr] = p.communicate_utf8(null, null);

    return p.get_successful() ? (onOut ?? out)(stdout!.trim()) : (onErr ?? err)(stderr!.trim());
}

/**
 * Executes a command asynchronously and returns a Promise.
 *
 * @param cmd - Command string or string array
 * @returns A promise that resolves with trimmed stdout, or rejects with trimmed stderr
 *
 * @example
 * ```typescript
 * const result = await execAsync('ls -la');
 * const files = await execAsync(['find', '.', '-name', '*.ts']);
 * ```
 */
export function execAsync(cmd: string | string[]): Promise<string> {
    const p = proc(cmd);

    return new Promise((resolve, reject) => {
        p.communicate_utf8_async(null, null, (_, res) => {
            const [, stdout, stderr] = p.communicate_utf8_finish(res);
            p.get_successful() ? resolve(stdout!.trim()) : reject(stderr!.trim());
        });
    });
}
