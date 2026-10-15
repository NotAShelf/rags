import Gdk from 'gi://Gdk?version=3.0';
import Gtk from 'gi://Gtk?version=3.0';
import type GObject from 'gi://GObject';
import Service from '../service.js';
import type { Disposable } from '../service.js';
import { AgsServiceError } from '../utils/errors.js';
import { authenticate, authenticateUser } from '../utils/pam.js';
import type { ChildScope, ScopeHandle } from '../internal/resource-scope.js';

interface NativeSessionLock extends GObject.Object {
    lock_lock(): void;
    new_surface(window: Gtk.Window, monitor: Gdk.Monitor): void;
    unlock_and_destroy(): void;
    destroy(): void;
}

interface SessionLockModule {
    is_supported(): boolean;
    get_protocol_version(): number;
    prepare_lock(): NativeSessionLock;
}

let GtkSessionLock: SessionLockModule | null = null;
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

    private _lock: NativeSessionLock | null = null;
    private _lockScope: ChildScope | null = null;
    private _nativeLockCleanup: ScopeHandle | null = null;
    private _available = false;
    private _locked = false;
    private _protocolVersion = 0;
    private _disposing = false;

    get available() {
        return this._available;
    }

    get locked() {
        return this._locked;
    }

    get protocol_version() {
        return this._protocolVersion;
    }

    private _isIdle() {
        return !this.isDisposed && this._lock === null;
    }

    private _ownsLock(lock: NativeSessionLock) {
        return !this.isDisposed && this._lock === lock;
    }

    constructor() {
        super();
        this.refresh();
    }

    /** Refreshes compositor support and protocol version. */
    readonly refresh = () => {
        if (this.isDisposed) return;
        this._available = Boolean(GtkSessionLock?.is_supported());
        this._protocolVersion = GtkSessionLock ? Number(GtkSessionLock.get_protocol_version()) : 0;
        this.notify('available');
        if (this.isDisposed) return;
        this.notify('protocol-version');
        if (this.isDisposed) return;
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
        if (this._disposing || !this._isIdle()) return;

        this.refresh();
        if (this._disposing || !this._isIdle()) return;
        if (!this._available || !GtkSessionLock) {
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
        const owner = this.resources.child();
        this._lockScope = owner;
        owner.scope.add(() => display.sync());
        this._nativeLockCleanup = owner.scope.add(() => lock.destroy());
        try {
            owner.scope.connect(lock, 'locked', () => {
                if (!this._ownsLock(lock)) return;
                this._locked = true;
                this.notify('locked');
                if (!this._ownsLock(lock)) return;
                this.emit('locked');
                if (!this._ownsLock(lock)) return;
                this.emit('changed');
            });
            owner.scope.connect(lock, 'finished', () => {
                if (!this._ownsLock(lock)) return;
                this._cleanupLock(lock);
                if (this._isIdle()) this.emit('finished');
            });

            lock.lock_lock();
            if (!this._ownsLock(lock)) return;

            this._createLockSurfaces(lock, owner, display, createSurface);
        } catch (error) {
            this._cleanupLock(lock, this._locked);
            throw error;
        }
    };

    private _createLockSurfaces(
        lock: NativeSessionLock,
        owner: ChildScope,
        display: Gdk.Display,
        createSurface: LockSurfaceFactory,
    ) {
        const nMonitors = display.get_n_monitors();
        if (nMonitors < 1) {
            throw new AgsServiceError('Cannot lock without monitors');
        }

        for (let i = 0; i < nMonitors; i++) {
            if (!this._ownsLock(lock)) return;
            const monitor = display.get_monitor(i);
            if (!monitor) continue;
            const window = createSurface(monitor, i);
            owner.scope.add(() => window.destroy());
            if (!this._ownsLock(lock)) return;
            lock.new_surface(window, monitor);
            if (!this._ownsLock(lock)) return;
            window.show_all();
        }
    }

    /** Unlocks an active lock after the caller has verified the user's identity. */
    readonly unlock = () => {
        const lock = this._lock;
        if (!lock) return;
        this._cleanupLock(lock, true, false);
        if (!this._isIdle()) return;
        this.notify('locked');
        if (!this._isIdle()) return;
        this.emit('unlocked');
        if (this._isIdle()) this.emit('changed');
    };

    /** Verifies a password with PAM and unlocks on success. */
    readonly unlockWithPassword = async (password: string, username?: string, service = 'ags') => {
        const lock = this._lock;
        if (username) await authenticateUser(username, password, service);
        else await authenticate(password, service);
        if (!this.isDisposed && this._lock === lock) this.unlock();
    };

    /** Cancels the current lock object if it has not become active yet. */
    readonly cancel = () => {
        if (!this._lock || this._locked) return;
        this._cleanupLock();
    };

    private _cleanupLock(lock = this._lock, unlock = false, notify = true) {
        if (!lock || this._lock !== lock) return;
        const owner = this._lockScope!;
        const nativeCleanup = this._nativeLockCleanup;
        this._lock = null;
        this._lockScope = null;
        this._nativeLockCleanup = null;
        this._locked = false;
        try {
            if (unlock) {
                nativeCleanup?.forget();
                lock.unlock_and_destroy();
            }
        } finally {
            owner.release();
        }
        if (notify && this._isIdle()) {
            this.notify('locked');
            if (this._isIdle()) this.emit('changed');
        }
    }

    dispose(): void {
        if (this.isDisposed || this._disposing) return;
        this._disposing = true;
        try {
            if (this._locked) this.unlock();
            else this.cancel();
        } finally {
            super.dispose();
        }
    }
}

export const lockscreen = new Lockscreen();
export default lockscreen;
