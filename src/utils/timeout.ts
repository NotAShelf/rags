/**
 * Timer utilities wrapping GLib's event loop.
 *
 * @module
 */
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib';
import { ensureWidgetScope, type ChildScope } from '../internal/resource-scope.js';

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
    const owner = bind ? ensureWidgetScope(bind) : undefined;
    callback();
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
        callback();
        return true;
    });
    owner?.source(id);

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

/**
 * Handle returned by {@link onFrame} to control the animation lifecycle.
 */
export interface CancelHandle {
    /** Cancels the frame callback. */
    cancel(): void;
    /** Whether the frame callback is still active. */
    readonly active: boolean;
}

/**
 * Calls a callback on every frame tick, synchronised to the widget's
 * GDK frame clock.
 *
 * The callback should return `true` to continue receiving frame updates,
 * or `false` to stop. The animation is automatically cancelled when the
 * widget is destroyed.
 *
 * @param widget - The widget whose frame clock should drive the animation
 * @param callback - Called on each frame. Return `false` to stop.
 * @returns A {@link CancelHandle} to cancel the animation externally
 *
 * @example
 * ```typescript
 * const handle = onFrame(myWidget, () => {
 *     opacity -= 0.02;
 *     myWidget.opacity = opacity;
 *     return opacity > 0;
 * });
 * ```
 */
export function onFrame(widget: Gtk.Widget, callback: () => boolean): CancelHandle {
    const owner = ensureWidgetScope(widget).child();
    let cancelled = false;
    let frame: ChildScope | undefined;

    owner.scope.add(() => {
        cancelled = true;
    });

    const handle: CancelHandle = {
        get active() {
            return !cancelled;
        },
        cancel() {
            owner.release();
        },
    };

    const start = () => {
        if (cancelled) return;
        const win = widget.get_window();
        if (!win) return;
        const clock: Gdk.FrameClock | null = win.get_frame_clock();
        if (!clock) return;

        frame?.release();
        frame = owner.scope.child();
        clock.begin_updating();
        frame.scope.add(() => clock.end_updating());
        frame.scope.connect(clock, 'update', () => {
            if (!cancelled && !callback()) handle.cancel();
        });
    };

    owner.scope.connect(widget, 'unrealize', () => {
        frame?.release();
        frame = undefined;
    });
    owner.scope.connect(widget, 'realize', start);
    if (widget.get_realized()) start();
    return handle;
}
