import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Service, { Binding, Props } from './service.js';
import type { Disposable } from './service.js';
import { execAsync, interval, subprocess } from './utils.js';
import { AgsRuntimeError } from './utils/errors.js';

/**
 * Configuration for listening to a subprocess's stdout.
 *
 * Can be a command string, a command array, or a tuple of command + transform function.
 *
 * @typeParam T - The variable's value type
 */
type Listen<T> =
    | [string[] | string, (out: string, self: Variable<T>) => T]
    | [string[] | string]
    | string[]
    | string;

/**
 * Configuration for polling a command or function at an interval.
 *
 * Specified as a tuple of `[intervalMs, commandOrFn]` with an optional
 * transform function for command-based polling.
 *
 * @typeParam T - The variable's value type
 */
type Poll<T> =
    | [number, string[] | string | ((self: Variable<T>) => T) | ((self: Variable<T>) => Promise<T>)]
    | [number, string[] | string, (out: string, self: Variable<T>) => T];

/**
 * Options for creating a {@link Variable} with automatic polling or listening.
 *
 * @typeParam T - The variable's value type
 */
export interface Options<T> {
    /** Poll a command or function at a regular interval. */
    poll?: Poll<T>;
    /** Listen to a subprocess's stdout for continuous updates. */
    listen?: Listen<T>;
    /** When true, polling is suspended until at least one widget consumer exists. */
    autoSuspend?: boolean;
}

/**
 * A reactive variable that holds a value and emits signals on change.
 *
 * Variables are the primary reactive primitive in AGS. They can optionally
 * poll a command/function at intervals or listen to a subprocess for
 * continuous updates.
 *
 * @typeParam T - The type of value held by the variable
 *
 * @example
 * ```typescript
 * // Simple reactive variable
 * const count = Variable(0);
 * count.value = 5;
 *
 * // Poll a command every 5 seconds
 * const time = Variable('', {
 *     poll: [5000, 'date'],
 * });
 *
 * // Listen to a subprocess
 * const workspaces = Variable('', {
 *     listen: ['hyprctl activeworkspace -j', JSON.parse],
 * });
 * ```
 */
export class Variable<T> extends GObject.Object implements Disposable {
    static {
        Service.register(
            this,
            {
                changed: [],
                dispose: [],
            },
            {
                value: ['jsobject', 'rw'],
                'is-listening': ['boolean', 'r'],
                'is-polling': ['boolean', 'r'],
            },
        );
    }

    protected _value!: T;
    protected _poll?: Poll<T>;
    protected _listen?: Listen<T>;
    protected _interval?: number;
    protected _subprocess?: Gio.Subprocess | null;
    protected _autoSuspend = false;
    protected _visibleConsumers = 0;

    /**
     * @param value - The initial value
     * @param options - Optional polling or listening configuration
     */
    constructor(value: T, { poll, listen, autoSuspend }: Options<T> = {}) {
        super();
        this.value = value;

        if (autoSuspend) this._autoSuspend = true;

        if (poll) {
            this._poll = poll;
            if (!this._autoSuspend) this.startPoll();
        }

        if (listen) {
            this._listen = listen;
            this.startListen();
        }
    }

    /** Starts the poll loop if a poll configuration was provided. */
    startPoll() {
        if (!this._poll) {
            throw new AgsRuntimeError(`${this} has no poll defined`, {
                variable: this.toString(),
            });
        }

        if (this._interval) {
            throw new AgsRuntimeError(`${this} is already polling`, {
                variable: this.toString(),
            });
        }

        const [time, cmd, transform = (out: string) => out as T] = this._poll;
        if (Array.isArray(cmd) || typeof cmd === 'string') {
            this._interval = interval(time, () =>
                execAsync(cmd)
                    .then(out => (this.value = transform(out, this)))
                    .catch(console.error),
            );
        }
        if (typeof cmd === 'function') {
            this._interval = interval(time, () => {
                const value = cmd(this);
                if (value instanceof Promise)
                    value.then(v => (this.value = v)).catch(console.error);
                else this.value = value;
            });
        }
        this.notify('is-polling');
    }

    /** Stops the active poll loop. */
    stopPoll() {
        if (this._interval) {
            GLib.source_remove(this._interval);
            this._interval = 0;
        } else {
            throw new AgsRuntimeError(`${this} has no poll running`, {
                variable: this.toString(),
            });
        }
        this.notify('is-polling');
    }

    /** @internal Registers a visible consumer. Starts polling if autoSuspend is enabled. */
    _addVisibleConsumer() {
        this._visibleConsumers++;
        if (this._autoSuspend && this._visibleConsumers === 1 && !this.is_polling) this.startPoll();
    }

    /** @internal Unregisters a visible consumer. Stops polling when none remain. */
    _removeVisibleConsumer() {
        this._visibleConsumers = Math.max(0, this._visibleConsumers - 1);
        if (this._autoSuspend && this._visibleConsumers === 0 && this.is_polling) this.stopPoll();
    }

    /** Starts listening to a subprocess if a listen configuration was provided. */
    startListen() {
        if (!this._listen) {
            throw new AgsRuntimeError(`${this} has no listen defined`, {
                variable: this.toString(),
            });
        }

        if (this._subprocess) {
            throw new AgsRuntimeError(`${this} is already listening`, {
                variable: this.toString(),
            });
        }

        let cmd: string | string[];
        const transform =
            typeof this._listen[1] === 'function' ? this._listen[1] : (out: string) => out as T;

        // string
        if (typeof this._listen === 'string') cmd = this._listen;
        // string[]
        else if (Array.isArray(this._listen) && this._listen.every(s => typeof s === 'string'))
            cmd = this._listen as string[];
        // [string, fn]
        else if (Array.isArray(this._listen) && typeof this._listen[0] === 'string')
            cmd = this._listen[0];
        // [string[], fn]
        else if (Array.isArray(this._listen) && Array.isArray(this._listen[0]))
            cmd = this._listen[0];
        else {
            throw new AgsRuntimeError(`${this._listen} is not a valid type for Variable.listen`, {
                variable: this.toString(),
                listenType: typeof this._listen,
            });
        }

        this._subprocess = subprocess(cmd, out => (this.value = transform(out, this)));
        this.notify('is-listening');
    }

    /** Stops the active listener subprocess. */
    stopListen() {
        if (this._subprocess) {
            this._subprocess.force_exit();
            this._subprocess = null;
        } else {
            throw new AgsRuntimeError(`${this} has no listen running`, {
                variable: this.toString(),
            });
        }
        this.notify('is-listening');
    }

    /** Whether a listener subprocess is currently active. */
    get is_listening() {
        return !!this._subprocess;
    }

    /** Whether a poll loop is currently active. */
    get is_polling() {
        return !!this._interval;
    }

    private _isDisposed = false;

    /** Stops all polling and listening, then disposes the GObject. */
    dispose() {
        if (this._isDisposed) return;

        if (this.is_polling) this.stopPoll();
        if (this.is_listening) this.stopListen();

        this._isDisposed = true;
    }

    /** Check if variable has been disposed */
    get isDisposed(): boolean {
        return this._isDisposed;
    }

    /** Returns the current value. */
    getValue() {
        return this._value;
    }

    /** Sets the value, emitting `notify::value` and `changed` signals. */
    setValue(value: T) {
        this._value = value;
        this.notify('value');
        this.emit('changed');
    }

    /** The current value. Setting it to the same value is a no-op. */
    get value() {
        return this._value;
    }

    set value(value: T) {
        if (value === this.value) return;

        this.setValue(value);
    }

    /**
     * Connects a callback to a signal on this variable.
     *
     * @param signal - The signal name (defaults to `'notify::value'`)
     * @param callback - The callback to invoke
     * @returns The connection ID
     */
    connect(signal = 'notify::value', callback: (self: this, ...args: any[]) => void): number {
        return super.connect(signal, callback);
    }

    /**
     * Creates a {@link Binding} for a property on this variable.
     *
     * When called without arguments, binds to `'value'` and preserves the
     * variable's type parameter `T` as the binding's return type.
     *
     * @returns A Binding that can be used in widget constructors
     */
    bind<P extends keyof Props<this>>(): Binding<this, P, T>;
    bind<P extends keyof Props<this>>(prop?: P): Binding<this, P, this[P]>;
    bind<P extends keyof Props<this>>(prop: P = 'value' as P) {
        return new Binding(this, prop);
    }
}

/**
 * Factory function that creates a new {@link Variable}.
 *
 * @param value - The initial value
 * @param options - Optional polling or listening configuration
 * @returns A new Variable instance
 *
 * @example
 * ```typescript
 * const myVar = Variable(0);
 * const polled = Variable('', { poll: [1000, 'date'] });
 * ```
 */
export default <T>(value: T, options?: Options<T>) => new Variable(value, options);
