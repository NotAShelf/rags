/**
 * Timer utilities wrapping GLib's event loop.
 *
 * @module
 */
import Gtk from 'gi://Gtk?version=3.0';
import GLib from 'gi://GLib';

/**
 * Calls a callback immediately and then repeatedly at the given interval.
 *
 * @param interval - Interval in milliseconds between invocations
 * @param callback - The function to call
 * @param bind - Optional widget; the interval is removed when the widget is destroyed
 * @returns The GLib source ID (can be used with `GLib.source_remove`)
 *
 * @example
 * ```typescript
 * const id = interval(1000, () => console.log('tick'));
 * ```
 */
export function interval(interval: number, callback: () => void, bind?: Gtk.Widget) {
    callback();
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
        callback();
        return true;
    });
    if (bind) bind.connect('destroy', () => GLib.source_remove(id));

    return id;
}

/**
 * Calls a callback once after a delay.
 *
 * @param ms - Delay in milliseconds
 * @param callback - The function to call after the delay
 * @returns The GLib source ID
 *
 * @example
 * ```typescript
 * timeout(500, () => console.log('delayed'));
 * ```
 */
export function timeout(ms: number, callback: () => void) {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        callback();
        return GLib.SOURCE_REMOVE;
    });
}

/**
 * Schedules a callback to run when the main loop is idle.
 *
 * @param callback - The function to call
 * @param prio - GLib priority level (defaults to `GLib.PRIORITY_DEFAULT`)
 * @returns The GLib source ID
 */
export function idle(callback: () => void, prio = GLib.PRIORITY_DEFAULT) {
    return GLib.idle_add(prio, () => {
        callback();
        return GLib.SOURCE_REMOVE;
    });
}
