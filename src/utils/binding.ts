/**
 * Reactive binding combinators for merging, deriving, and watching
 * multiple reactive sources.
 *
 * @module
 */
import { Binding, Connectable } from '../service.js';
import { Variable } from '../variable.js';
import { kebabify } from './gobject.js';

type Dep<T> = Binding<any, any, T>;

/**
 * Combines multiple {@link Binding}s into a single derived binding.
 *
 * Whenever any dependency emits a property change, the function is
 * re-evaluated with all current values and the result binding updates.
 *
 * @param deps - Array of bindings to observe
 * @param fn - Function that receives all current values and returns the derived value
 * @returns A binding of the derived value
 *
 * @example
 * ```typescript
 * const label = Widget.Label({
 *     label: Utils.merge(
 *         [battery.bind('percent'), audio.bind('volume')],
 *         (bat, vol) => `Battery: ${bat}%, Volume: ${Math.round(vol * 100)}%`,
 *     ),
 * });
 * ```
 */
export function merge<
    V,
    const Deps extends Dep<unknown>[],
    Args extends { [K in keyof Deps]: Deps[K] extends Dep<infer T> ? T : never },
>(deps: Deps, fn: (...args: Args) => V) {
    const update = () => fn(...(deps.map(d => d.transformFn(d.emitter[d.prop])) as Args));
    const watcher = new Variable(update());
    const connectionIds: Array<{ emitter: Connectable; id: number }> = [];

    for (const dep of deps) {
        const id = dep.emitter.connect(
            `notify::${kebabify(dep.prop)}`,
            () => (watcher.value = update()),
        );
        connectionIds.push({ emitter: dep.emitter, id });
    }

    watcher.connect('dispose', () => {
        for (const { emitter, id } of connectionIds) {
            emitter.disconnect(id);
        }
    });

    return watcher.bind();
}

/**
 * Creates a derived {@link Variable} from multiple source Variables.
 *
 * Similar to {@link merge} but operates on Variables directly rather than
 * Bindings, and returns a Variable instead of a Binding.
 *
 * @param deps - Array of Variables to observe
 * @param fn - Function that receives all current values and returns the derived value
 * @returns A new Variable containing the derived value
 */
export function derive<
    V,
    const Deps extends Variable<any>[],
    Args extends { [K in keyof Deps]: Deps[K] extends Variable<infer T> ? T : never },
>(deps: Deps, fn: (...args: Args) => V) {
    const update = () => fn(...(deps.map(d => d.value) as Args));
    const watcher = new Variable(update());
    const connectionIds: Array<{ emitter: Connectable; id: number }> = [];

    for (const dep of deps) {
        const id = dep.connect('changed', () => (watcher.value = update()));
        connectionIds.push({ emitter: dep, id });
    }

    watcher.connect('dispose', () => {
        for (const { emitter, id } of connectionIds) {
            emitter.disconnect(id);
        }
    });

    return watcher;
}

type B<T> = Binding<Variable<T>, any, T>;

/**
 * Creates a binding that re-evaluates a callback whenever specified
 * objects emit signals.
 *
 * @param init - The initial value
 * @param objs - Connectable object(s) to watch, optionally with signal names
 * @param callback - Callback if signal name was provided
 * @returns A binding of the watched value
 *
 * @example
 * ```typescript
 * const label = Widget.Label({
 *     label: Utils.watch('', audio, 'speaker-changed', () => {
 *         return `Volume: ${audio.speaker?.volume}`;
 *     }),
 * });
 * ```
 */

export function watch<T>(
    init: T,
    objs: Array<Connectable | [obj: Connectable, signal?: string]>,
    callback: () => T,
): B<T>;
export function watch<T>(init: T, obj: Connectable, signal: string, callback: () => T): B<T>;
export function watch<T>(init: T, obj: Connectable, callback: () => T): B<T>;
export function watch<T>(
    init: T,
    objs: Connectable | Array<Connectable | [obj: Connectable, signal?: string]>,
    sigOrFn: string | (() => T),
    callback?: () => T,
) {
    const v = new Variable(init);
    const f = typeof sigOrFn === 'function' ? sigOrFn : (callback ?? (() => v.value));
    const set = () => (v.value = f());
    const connectionIds: Array<{ emitter: Connectable; id: number }> = [];

    if (Array.isArray(objs)) {
        // multiple objects
        for (const obj of objs) {
            if (Array.isArray(obj)) {
                // obj signal pair
                const [o, s = 'changed'] = obj;
                const id = o.connect(s, set);
                connectionIds.push({ emitter: o, id });
            } else {
                // obj on changed
                const id = obj.connect('changed', set);
                connectionIds.push({ emitter: obj, id });
            }
        }
    } else {
        // watch single object
        const signal = typeof sigOrFn === 'string' ? sigOrFn : 'changed';
        const id = objs.connect(signal, set);
        connectionIds.push({ emitter: objs, id });
    }

    v.connect('dispose', () => {
        for (const { emitter, id } of connectionIds) {
            emitter.disconnect(id);
        }
    });

    return v.bind();
}
