import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import { AgsServiceError } from '../utils/errors.js';
import { authenticate, authenticateUser } from '../utils/pam.js';

let GtkSessionLock: any = null;
try {
    // @ts-expect-error optional GIR dependency
    GtkSessionLock = (await import('gi://GtkSessionLock?version=0.1')).default;
} catch {
    GtkSessionLock = null;
}

export type LockSurfaceFactory = (monitor: Gdk.Monitor, index: number) => Gtk.Window;

/**
 * Secure Wayland session-lock service.
 *
 * This wraps the `ext-session-lock-v1` protocol through `gtk-session-lock`.
 * It intentionally has no fullscreen-window fallback: if the compositor or
 * library is unavailable, {@link lock} throws instead of creating an insecure
 * imitation of a lock screen.
 *
 * @property available        - Whether the compositor supports session-lock
 * @property locked           - Whether the current session lock is active
 * @property protocol_version - Supported ext-session-lock protocol version
 */
export class Lockscreen extends Service implements Disposable {
    static {
        Service.register(
            this,
            {
                locked: [],
                unlocked: [],
                finished: [],
            },
            {
                available: ['boolean', 'r'],
                locked: ['boolean', 'r'],
                'protocol-version': ['int', 'r'],
            },
        );
    }

    private _lock: any = null;
    private _windows: Gtk.Window[] = [];
    private _available = false;
    private _locked = false;
    private _protocolVersion = 0;
    private _lockSignalIds: number[] = [];

    get available() {
        return this._available;
    }

    get locked() {
        return this._locked;
    }

    get protocol_version() {
        return this._protocolVersion;
    }

    constructor() {
        super();
        this.refresh();
    }

    /** Refreshes compositor support and protocol version. */
    readonly refresh = () => {
        this._available = Boolean(GtkSessionLock?.is_supported());
        this._protocolVersion = GtkSessionLock ? Number(GtkSessionLock.get_protocol_version()) : 0;
        this.notify('available');
        this.notify('protocol-version');
        this.emit('changed');
    };

    /**
     * Locks the current Wayland session and creates one lock surface per monitor.
     *
     * The factory must return a new `Gtk.Window` for each monitor. Use normal AGS
     * widgets as that window's child, but do not reuse an existing bar/popup
     * window.
     */
    readonly lock = (createSurface: LockSurfaceFactory) => {
        if (this._lock) return;

        this.refresh();
        if (!this._available) {
            throw new AgsServiceError('Wayland session-lock is not available', {
                protocolVersion: this._protocolVersion,
            });
        }

        const display = Gdk.Display.get_default();
        if (!display) {
            throw new AgsServiceError('Cannot lock without a GDK display');
        }

        const lock = GtkSessionLock.prepare_lock();
        this._lock = lock;
        this._windows = [];
        this._lockSignalIds = [
            lock.connect('locked', () => {
                this._locked = true;
                this.notify('locked');
                this.emit('locked');
                this.emit('changed');
            }),
            lock.connect('finished', () => {
                this._cleanupLock();
                this.emit('finished');
            }),
        ];

        try {
            lock.lock_lock();

            const nMonitors = display.get_n_monitors();
            if (nMonitors < 1) {
                throw new AgsServiceError('Cannot lock without monitors');
            }

            for (let i = 0; i < nMonitors; i++) {
                const monitor = display.get_monitor(i);
                if (!monitor) continue;
                const window = createSurface(monitor, i);
                this._windows.push(window);
                lock.new_surface(window, monitor);
                window.show_all();
            }
        } catch (error) {
            if (this._locked) lock.unlock_and_destroy();
            else lock.destroy();
            this._cleanupLock();
            throw error;
        }
    };

    /** Unlocks an active lock after the caller has verified the user's identity. */
    readonly unlock = () => {
        if (!this._lock) return;
        this._lock.unlock_and_destroy();
        this._locked = false;
        this.notify('locked');
        this.emit('unlocked');
        this.emit('changed');
    };

    /** Verifies a password with PAM and unlocks on success. */
    readonly unlockWithPassword = async (password: string, username?: string, service = 'ags') => {
        if (username) await authenticateUser(username, password, service);
        else await authenticate(password, service);
        this.unlock();
    };

    /** Cancels the current lock object if it has not become active yet. */
    readonly cancel = () => {
        if (!this._lock || this._locked) return;
        this._lock.destroy();
        this._cleanupLock();
    };

    private _cleanupLock() {
        const lock = this._lock;
        const display = Gdk.Display.get_default();
        if (lock) {
            for (const id of this._lockSignalIds) {
                try {
                    lock.disconnect(id);
                } catch {
                    // The lock may already be disposed by gtk-session-lock.
                }
            }
        }

        for (const window of this._windows) {
            try {
                window.destroy();
            } catch {
                window.destroy();
            }
        }

        display?.sync();

        this._lock = null;
        this._windows = [];
        this._lockSignalIds = [];
        this._locked = false;
        this.notify('locked');
        this.emit('changed');
    }

    dispose(): void {
        if (this._lock) {
            if (this._locked) this.unlock();
            else this.cancel();
        }
        this._cleanupLock();
        super.dispose();
    }
}

export const lockscreen = new Lockscreen();
export default lockscreen;
