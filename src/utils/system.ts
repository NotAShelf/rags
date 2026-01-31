/**
 * System information utilities for reading hardware stats from `/proc` and `/sys`.
 *
 * These are stateless (or lightly stateful) functions meant to be called
 * inside `Variable.poll()` callbacks.
 *
 * @module
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { readFile } from './file.js';

let prevCpuIdle = 0;
let prevCpuTotal = 0;

/**
 * Returns the CPU usage as a fraction between 0 and 1 since the last call.
 *
 * On the first call the result covers the interval since boot.
 *
 * @returns CPU usage ratio (0–1)
 */
export function cpuUsage(): number {
    const stat = readFile('/proc/stat');
    const line = stat.split('\n')[0]; // "cpu  user nice system idle ..."
    if (!line) return 0;

    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0); // idle + iowait
    const total = parts.reduce((sum, v) => sum + v, 0);

    const deltaIdle = idle - prevCpuIdle;
    const deltaTotal = total - prevCpuTotal;

    prevCpuIdle = idle;
    prevCpuTotal = total;

    if (deltaTotal === 0) return 0;
    return 1 - deltaIdle / deltaTotal;
}

/**
 * Returns the memory usage as a fraction between 0 and 1.
 *
 * @returns Memory usage ratio (0–1)
 */
export function memUsage(): number {
    const info = readFile('/proc/meminfo');
    const get = (key: string) => {
        const m = info.match(new RegExp(`${key}:\\s+(\\d+)`));
        return m ? Number(m[1]) : 0;
    };

    const total = get('MemTotal');
    const available = get('MemAvailable');
    if (total === 0) return 0;
    return (total - available) / total;
}

/**
 * Reads a thermal sensor temperature in degrees Celsius.
 *
 * @param sensor - Path to a `temp*_input` file under `/sys/class/hwmon/`.
 *   Defaults to the first `temp1_input` found.
 * @returns Temperature in °C, or -1 if unavailable
 */
export function temperature(sensor?: string): number {
    if (sensor) {
        const raw = readFile(sensor).trim();
        return raw ? Number(raw) / 1000 : -1;
    }

    // Auto-detect first hwmon sensor
    const hwmonDir = '/sys/class/hwmon';
    try {
        const dir = Gio.File.new_for_path(hwmonDir);
        const enumerator = dir.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NONE,
            null,
        );
        let fileInfo = enumerator.next_file(null);
        while (fileInfo) {
            const path = `${hwmonDir}/${fileInfo.get_name()}/temp1_input`;
            if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
                const raw = readFile(path).trim();
                if (raw) return Number(raw) / 1000;
            }
            fileInfo = enumerator.next_file(null);
        }
    } catch (_) {
        // ignore
    }
    return -1;
}

/**
 * Returns the system uptime in seconds.
 *
 * @returns Uptime in seconds
 */
export function uptime(): number {
    const raw = readFile('/proc/uptime').trim();
    if (!raw) return 0;
    return parseFloat(raw.split(' ')[0]);
}

let prevNetDown = 0;
let prevNetUp = 0;
let prevNetTime = 0;

/**
 * Returns network download/upload rates in bytes per second.
 *
 * Computes the delta since the last call. First call returns `{ down: 0, up: 0 }`.
 *
 * @returns Object with `down` and `up` rates in bytes/sec
 */
export function networkRates(): { down: number; up: number } {
    const content = readFile('/proc/net/dev');
    const lines = content.split('\n').slice(2); // skip headers

    let totalDown = 0;
    let totalUp = 0;

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) continue;
        const iface = parts[0].replace(':', '');
        if (iface === 'lo') continue;
        totalDown += Number(parts[1]);
        totalUp += Number(parts[9]);
    }

    const now = GLib.get_monotonic_time() / 1_000_000; // seconds
    const dt = prevNetTime > 0 ? now - prevNetTime : 0;

    const down = dt > 0 ? (totalDown - prevNetDown) / dt : 0;
    const up = dt > 0 ? (totalUp - prevNetUp) / dt : 0;

    prevNetDown = totalDown;
    prevNetUp = totalUp;
    prevNetTime = now;

    return { down: Math.max(0, down), up: Math.max(0, up) };
}

/**
 * Returns disk usage as a fraction between 0 and 1 for the given mount point.
 *
 * Uses GIO's `query_filesystem_info` for a portable implementation.
 *
 * @param mount - Mount point path (defaults to `'/'`)
 * @returns Disk usage ratio (0–1), or -1 if unavailable
 */
export function diskUsage(mount = '/'): number {
    try {
        const file = Gio.File.new_for_path(mount);
        const info = file.query_filesystem_info('filesystem::size,filesystem::free', null);
        const total = info.get_attribute_uint64('filesystem::size');
        const free = info.get_attribute_uint64('filesystem::free');
        if (total === 0) return 0;
        return (total - free) / total;
    } catch (_) {
        return -1;
    }
}
