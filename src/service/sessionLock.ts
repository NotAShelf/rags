import Service, { type Disposable } from '../service.js';
import Gtk from 'gi://Gtk?version=3.0';
import cairo from 'gi://cairo';

// @ts-expect-error missing types - custom GIR from gutils
import GUtils from 'gi://GUtils';

/**
 * A lock surface for a specific display output, backed by a Cairo image
 * surface for direct pixel rendering via the ext-session-lock-v1 protocol.
 *
 * Each surface wraps a native `GUtilsSessionLockSurface` GObject and provides
 * access to the Cairo surface for drawing, plus input signal forwarding.
 */
export class LockSurface {
    /** @internal */
    _native: any;
    private _signalIds: number[] = [];

    constructor(native: any) {
        this._native = native;
    }

    /** The Cairo surface for rendering content. */
    get cairo_surface(): cairo.Surface | null {
        return this._native.cairo_surface;
    }

    /** The Cairo context for rendering content (convenience). */
    get cairo(): cairo.Context | null {
        const cs = this._native.cairo_surface;
        return cs ? new (cairo.Context as any)(cs) : null;
    }

    /** Current width of the lock surface in pixels. */
    get width() {
        return this._native.width;
    }

    /** Current height of the lock surface in pixels. */
    get height() {
        return this._native.height;
    }

    /** The compositor-reported output name (e.g., "DP-1", "eDP-1"). */
    get output_name() {
        return this._native.output_name;
    }

    /**
     * Renders a GTK widget to this lock surface's Cairo context.
     *
     * The widget is drawn directly into the Cairo surface. The caller is
     * responsible for size-allocating the widget to match the surface
     * dimensions before calling this method.
     *
     * @param widget - The GTK widget to render
     * @param x - X offset in the surface (default 0)
     * @param y - Y offset in the surface (default 0)
     */
    renderWidget(widget: Gtk.Widget, x = 0, y = 0) {
        const cr = this._native.cairo;
        if (!cr) return;

        cr.save();
        cr.translate(x, y);
        widget.draw(cr);
        cr.restore();

        this.render();
    }

    /**
     * Commits the current Cairo surface content to the Wayland surface
     * and requests a new frame callback.
     */
    render() {
        this._native.render();
    }

    /**
     * Connects a callback to a signal on the underlying native surface.
     *
     * Available signals:
     * - `'key-pressed'` — (keyval: number, keycode: number, state: number)
     * - `'pointer-motion'` — (x: number, y: number)
     * - `'pointer-button'` — (button: number, state: number, serial: number)
     * - `'frame-ready'` — emitted when the compositor is ready for a new frame
     *
     * @param signal - The signal name
     * @param callback - The callback to invoke
     * @returns The signal connection ID
     */
    connect(signal: string, callback: (...args: any[]) => void): number {
        const id = this._native.connect(signal, (...args: unknown[]) => {
            callback(this, ...args.slice(1));
        });
        this._signalIds.push(id);
        return id;
    }

    /** Disconnects a previously connected signal handler. */
    disconnect(id: number) {
        this._native.disconnect(id);
        this._signalIds = this._signalIds.filter(i => i !== id);
    }

    /** Disconnects all signal handlers on this surface. */
    disconnectAll() {
        for (const id of this._signalIds) {
            this._native.disconnect(id);
        }
        this._signalIds = [];
    }
}

/**
 * Session Lock Service
 *
 * Provides screen locking via the `ext-session-lock-v1` Wayland protocol.
 * Requires a compositor that supports ext-session-lock-v1 (wlroots-based
 * compositors: Hyprland, Sway, etc.).
 *
 * Use {@link Utils.authenticate} for password verification.
 *
 * @fires locked - Emitted when the compositor confirms the session is locked
 * @fires finished - Emitted when the lock is destroyed and the session unlocks
 * @fires surface-created - Emitted with a {@link LockSurface} for each output
 *
 * @example
 * ```typescript
 * const sessionLock = await Service.import('sessionLock');
 *
 * sessionLock.lock();
 *
 * sessionLock.connect('locked', () => {
 *     for (const surface of sessionLock.surfaces) {
 *         const cr = new cairo.Context(surface.cairo_surface);
 *         cr.setSourceRgb(0, 0, 0);
 *         cr.paint();
 *         surface.render();
 *     }
 * });
 *
 * sessionLock.connect('surface-created', (surf) => {
 *     const entry = Widget.Entry({ placeholder_text: 'Password' });
 *     entry.set_size_request(surf.width, 32);
 *     surf.renderWidget(entry, 0, Math.floor(surf.height / 2));
 * });
 *
 * // To unlock:
 * Utils.authenticate(password)
 *     .then(() => sessionLock.unlock())
 *     .catch(() => console.error('Authentication failed'));
 * ```
 */
export class SessionLock extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                locked: [],
                finished: [],
                'surface-created': ['jsobject'],
            },
            {
                locked: ['boolean', 'r'],
            },
        );
    }

    private _lock: any = null;
    private _surfaces: LockSurface[] = [];
    private _signalIds: number[] = [];

    get locked() {
        return this._lock ? this._lock.locked : false;
    }

    /**
     * All lock surfaces, one per output. Populated after the `locked`
     * signal fires and surfaces are created for each output.
     */
    get surfaces() {
        return [...this._surfaces];
    }

    /**
     * Initiates the ext-session-lock-v1 protocol. On success, the compositor
     * will lock the session and emit `locked`, followed by
     * `surface-created` for each display output.
     *
     * @returns `true` if the lock request was submitted successfully
     */
    lock(): boolean {
        if (this._lock) return true;

        const lock = new GUtils.SessionLock();

        this._signalIds.push(
            lock.connect('locked', () => {
                this.updateProperty('locked', true);
                this.emit('locked');
            }),
        );

        this._signalIds.push(
            lock.connect('finished', () => {
                this.emit('finished');
                this._cleanup();
            }),
        );

        this._signalIds.push(
            lock.connect('surface-created', (_lock: any, nativeSurface: any) => {
                const surface = new LockSurface(nativeSurface);
                this._surfaces.push(surface);
                this.emit('surface-created', surface);
            }),
        );

        const result = GUtils.session_lock_lock(lock, null);
        if (!result) {
            this._cleanup();
            return false;
        }

        this._lock = lock;
        return true;
    }

    /**
     * Unlocks the session and destroys the lock object. The `finished`
     * signal is emitted once the compositor confirms the unlock.
     */
    unlock() {
        if (!this._lock) return;
        GUtils.session_lock_unlock_and_destroy(this._lock);
    }

    private _cleanup() {
        for (const surface of this._surfaces) {
            surface.disconnectAll();
        }
        for (const id of this._signalIds) {
            if (this._lock) this._lock.disconnect(id);
        }
        this._signalIds = [];
        this._lock = null;
        this._surfaces = [];
        this.updateProperty('locked', false);
    }

    dispose() {
        this._cleanup();
        super.dispose();
    }
}

export const sessionLock = new SessionLock();
export default sessionLock;
