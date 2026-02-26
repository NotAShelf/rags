import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=3.0';
import { pspec, registerGObject, PspecFlag, PspecType } from './utils/gobject.js';
import { globalSignalRegistry } from './utils/signal-registry.js';
import { AgsServiceError } from './utils/errors.js';

function shallowEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    for (const key of keysA) {
        if (aRecord[key] !== bRecord[key]) return false;
    }
    return true;
}

const kebabToCamelCache = new Map<string, string>();

function kebabToCamel(prop: string): string {
    let result = kebabToCamelCache.get(prop);
    if (result !== undefined) return result;
    result = prop
        .split('-')
        .map((w, i) => (i > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join('');
    kebabToCamelCache.set(prop, result);
    return result;
}

/**
 * An object that supports signal connections and disconnections.
 */
export type Connectable = {
    connect: (sig: string, callback: (...args: unknown[]) => unknown) => number;
    disconnect: (id: number) => void;
};

/**
 * Filters a type to only allow string keys.
 * @typeParam S - The type to filter
 */
export type OnlyString<S extends string | unknown> = S extends string ? S : never;

/**
 * Extracts non-method, non-internal property keys from a GObject type.
 *
 * Useful for constraining property bindings to valid GObject properties.
 *
 * @typeParam T - The GObject type to extract properties from
 */
export type Props<T> = Omit<
    Pick<
        T,
        {
            [K in keyof T]: T[K] extends (...args: any[]) => any ? never : OnlyString<K>;
        }[keyof T]
    >,
    'g_type_instance'
>;

/**
 * Maps each property of `T` to accept either its original type or a {@link Binding}.
 *
 * Used in widget constructors to allow properties to be set directly or bound to
 * a reactive source.
 *
 * @typeParam T - The props type to make bindable
 */
export type BindableProps<T> = {
    [K in keyof T]: Binding<any, any, NonNullable<T[K]>> | T[K];
};

/**
 * Type-safe signal definition
 */
export type SignalDefinition<TPayload = void> = {
    payload: TPayload;
};

/**
 * Extract signal names from signal definitions
 */
export type SignalNames<T> = T extends Record<string, SignalDefinition<unknown>> ? keyof T : never;

/**
 * Extract payload type from signal definition
 */
export type SignalPayload<T, K extends keyof T> =
    T[K] extends SignalDefinition<infer P> ? P : never;

/**
 * Represents a reactive binding between a GObject property and a consumer.
 *
 * Bindings track a source emitter and property, and can apply transform
 * functions to map the source value before it reaches the consumer.
 *
 * @typeParam Emitter - The GObject type that emits property changes
 * @typeParam Prop - The property key on the emitter
 * @typeParam Return - The transformed output type (defaults to the property type)
 *
 * @example
 * ```typescript
 * const label = Widget.Label({
 *     label: battery.bind('percent').as(p => `${p}%`),
 * });
 * ```
 */
export class Binding<
    Emitter extends GObject.Object,
    Prop extends keyof Props<Emitter>,
    Return = Emitter[Prop],
> {
    /** The source GObject that emits property change notifications. */
    emitter: Emitter;
    /** The property name on the emitter being observed. */
    prop: Prop;
    /** The transform function applied to the raw property value. */
    transformFn = (v: any) => v; // see #262
    constructor(emitter: Emitter, prop: Prop) {
        this.emitter = emitter;
        this.prop = prop;
    }

    /**
     * Alias for {@link transform}.
     *
     * @param fn - Transform function to apply to the bound value
     * @returns A new Binding with the transform applied
     */
    as<T>(fn: (v: Return) => T) {
        return this.transform(fn);
    }

    /**
     * Creates a new Binding with a transform function chained after any existing transforms.
     *
     * @param fn - Transform function to apply to the bound value
     * @returns A new Binding with the transform applied
     *
     * @example
     * ```typescript
     * const binding = service.bind('value')
     *     .transform(v => v * 2)
     *     .transform(v => `${v}px`);
     * ```
     */
    transform<T>(fn: (v: Return) => T) {
        const bind = new Binding<Emitter, Prop, T>(this.emitter, this.prop);
        const prev = this.transformFn;
        bind.transformFn = (v: Return) => fn(prev(v));
        return bind;
    }
}

interface Services {
    applications: typeof import('./service/applications.js').default;
    audio: typeof import('./service/audio.js').default;
    battery: typeof import('./service/battery.js').default;
    bluetooth: typeof import('./service/bluetooth.js').default;
    hyprland: typeof import('./service/hyprland.js').default;
    mpris: typeof import('./service/mpris.js').default;
    network: typeof import('./service/network.js').default;
    notifications: typeof import('./service/notifications.js').default;
    powerprofiles: typeof import('./service/powerprofiles.js').default;
    systemtray: typeof import('./service/systemtray.js').default;
    greetd: typeof import('./service/greetd.js').default;
}

/**
 * Base class for all AGS services.
 *
 * Services are singleton GObject instances that expose system state
 * (audio, battery, network, etc.) as observable properties with
 * change notifications.
 *
 * @example
 * ```typescript
 * // Import a built-in service
 * const Audio = await Service.import('audio');
 *
 * // Create a custom service
 * class MyService extends Service {
 *     static {
 *         Service.register(this, {}, {
 *             'my-prop': ['string', 'r'],
 *         });
 *     }
 * }
 * ```
 */

/**
 * Interface for objects that require explicit cleanup
 */
export interface Disposable {
    dispose(): void;
}

export default class Service extends GObject.Object {
    static {
        GObject.registerClass(
            {
                GTypeName: 'AgsService',
                Signals: {
                    changed: {},
                    error: { param_types: [GObject.TYPE_JSOBJECT] },
                },
            },
            this,
        );
        // Store registered signal names for dev-time validation
        (this as any)._registeredSignals = new Set(['changed', 'error']);
    }

    /**
     * Dynamically imports a built-in service by name.
     *
     * @param service - The service name to import
     * @returns The default export of the service module
     *
     * @example
     * ```typescript
     * const Audio = await Service.import('audio');
     * const Battery = await Service.import('battery');
     * ```
     */
    static async import<S extends keyof Services>(service: S): Promise<Services[S]> {
        return (await import(`./service/${service}.js`)).default;
    }

    /**
     * Creates a GObject property specification.
     *
     * @param name - The property name in kebab-case
     * @param type - The property type (defaults to `'jsobject'`)
     * @param handle - The access flag: `'r'`, `'w'`, or `'rw'` (defaults to `'r'`)
     * @returns A GObject.ParamSpec
     */
    static pspec(name: string, type: PspecType = 'jsobject', handle: PspecFlag = 'r') {
        return pspec(name, type, handle);
    }

    /**
     * Registers a GObject subclass with signals and properties.
     *
     * @param service - The class constructor to register
     * @param signals - Map of signal names to their parameter types
     * @param properties - Map of property names to `[type, accessFlag]` tuples
     */
    static register(
        service: new (...args: any[]) => GObject.Object,
        signals?: { [signal: string]: PspecType[] },
        properties?: { [prop: string]: [type?: PspecType, handle?: PspecFlag] },
    ) {
        registerGObject(service, { signals, properties });
    }

    /**
     * Connects a callback to a signal on this service.
     *
     * @param signal - The signal name (defaults to `'changed'`)
     * @param callback - The callback to invoke when the signal is emitted
     * @returns The signal connection ID
     */
    connect(signal = 'changed', callback: (_: this, ...args: any[]) => void): number {
        return super.connect(signal, callback);
    }

    /**
     * Emits a signal, warning if the signal was not registered via
     * {@link Service.register}.
     *
     * The warning is cheap (a Set lookup per emit) and helps catch typos
     * and missing signal declarations that silently break `.bind()`.
     */
    emit(signal: string, ...args: any[]) {
        // Walk prototype chain to check for registered signals
        let found = false;
        let proto: any = this.constructor;
        while (proto) {
            if (proto._registeredSignals?.has(signal)) {
                found = true;
                break;
            }
            proto = Object.getPrototypeOf(proto);
        }

        if (!found && signal !== 'destroy' && signal !== 'notify') {
            console.warn(
                `${this.constructor.name}.emit("${signal}"): ` +
                    `signal not registered via Service.register(). ` +
                    `Widgets cannot .bind() to unregistered signals.`,
            );
        }

        super.emit(signal, ...args);
    }

    /**
     * Updates a property value and emits a `notify` signal if the value changed.
     *
     * Performs a deep equality check via JSON serialization to avoid
     * unnecessary notifications.
     *
     * @param prop - The property name in kebab-case
     * @param value - The new value
     */
    updateProperty(prop: string, value: unknown) {
        if (shallowEqual(this[prop as keyof typeof this], value)) return;

        const privateProp = kebabToCamel(prop);

        // @ts-expect-error
        this[`_${privateProp}`] = value;
        this.notify(prop);
    }

    /**
     * Notifies listeners that a property changed and emits the `'changed'` signal.
     *
     * @param property - The property name that changed
     */
    changed(property: string) {
        this.notify(property);
        this.emit('changed');
    }

    /**
     * Creates a {@link Binding} for a property on this service.
     *
     * @param prop - The property to bind
     * @returns A Binding that can be used in widget constructors
     *
     * @example
     * ```typescript
     * const label = Widget.Label({
     *     label: audio.bind('volume').as(v => `${Math.round(v * 100)}%`),
     * });
     * ```
     */
    bind<Prop extends keyof Props<this>>(prop: Prop) {
        return new Binding(this, prop);
    }

    // Connection tracking fields
    private _connections: Array<{ emitter: GObject.Object; id: number }> = [];
    private _isDisposed = false;

    /**
     * Track a signal connection for automatic cleanup
     * @param emitter - The object the signal is connected to (defaults to this)
     * @param id - The signal connection ID
     */
    protected trackConnection(emitter: GObject.Object, id: number): void;
    protected trackConnection(id: number): void;
    protected trackConnection(emitterOrId: GObject.Object | number, id?: number): void {
        if (typeof emitterOrId === 'number') {
            // Called with just ID - assume signal is on 'this'
            this._connections.push({ emitter: this, id: emitterOrId });
        } else {
            // Called with emitter and ID
            this._connections.push({ emitter: emitterOrId, id: id! });
        }
    }

    /**
     * Clean up all tracked signal connections
     * Call this in service-specific dispose implementations
     */
    protected disconnectAll(): void {
        while (this._connections.length > 0) {
            const { emitter, id } = this._connections.pop()!;
            try {
                emitter.disconnect(id);
            } catch (error) {
                console.error(
                    `Failed to disconnect signal ${id} in ${this.constructor.name}:`,
                    error,
                );
            }
        }
    }

    /**
     * Dispose of service resources
     * Override in subclasses to add specific cleanup
     */
    dispose(): void {
        if (this._isDisposed) {
            console.warn(`${this.constructor.name} already disposed`);
            return;
        }

        this.disconnectAll();
        this._isDisposed = true;
    }

    /**
     * Check if service has been disposed
     */
    get isDisposed(): boolean {
        return this._isDisposed;
    }

    /**
     * Retry a DBus operation with exponential backoff
     */
    protected async retryWithBackoff<T>(
        operation: () => Promise<T>,
        maxRetries = 3,
        baseDelay = 100,
    ): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;

                if (attempt < maxRetries - 1) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(
                        `${this.constructor.name} operation failed (attempt ${attempt + 1}/${maxRetries}), ` +
                            `retrying in ${delay}ms...`,
                        error,
                    );
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        const error = new AgsServiceError(
            `${this.constructor.name} operation failed after ${maxRetries} attempts`,
            { originalError: lastError },
        );

        this.emit('error', error);
        throw error;
    }

    /**
     * Creates an incremental list binding that reuses existing widgets.
     *
     * Instead of recreating all widgets on every update, this method caches
     * widgets by a key function and only creates new widgets for new items,
     * destroying widgets for removed items.
     *
     * @param prop - The property containing the item array
     * @param opts - Key extractor, widget factory, and optional update callback
     * @returns A Binding that produces an array of widgets
     *
     * @example
     * ```typescript
     * const children = audio.diffBind('speakers', {
     *     key: (s) => s.name,
     *     create: (s) => Widget.Label({ label: s.description }),
     *     update: (w, s) => { w.label = s.description; },
     * });
     * ```
     */
    diffBind<Item, Prop extends keyof Props<this>>(
        prop: Prop,
        opts: {
            key: (item: Item) => string | number;
            create: (item: Item) => Gtk.Widget;
            update?: (widget: Gtk.Widget, item: Item) => void;
        },
    ) {
        const cache = new Map<string | number, Gtk.Widget>();

        // @ts-expect-error Item[] is not statically assignable from this[Prop]
        return this.bind(prop).as((items: Item[]) => {
            const newKeys = new Set(items.map(opts.key));

            for (const [k, widget] of cache) {
                if (!newKeys.has(k)) {
                    widget.destroy();
                    cache.delete(k);
                }
            }

            return items.map(item => {
                const k = opts.key(item);
                const existing = cache.get(k);
                if (existing) {
                    opts.update?.(existing, item);
                    return existing;
                }
                const widget = opts.create(item);
                cache.set(k, widget);
                return widget;
            });
        });
    }
}
