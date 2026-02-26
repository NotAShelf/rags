import GObject from 'gi://GObject';

/**
 * Type-safe GObject property notification callback
 */
export type NotifyCallback<T extends GObject.Object, K extends keyof T> = (
    object: T,
    pspec: GObject.ParamSpec,
) => void;

/**
 * Type-safe signal connection helper
 */
export type SignalCallback<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => void;

/**
 * Extract property names from GObject class
 */
export type GObjectProperties<T extends GObject.Object> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

/**
 * Type guard for checking if value is a GObject
 */
export function isGObject(value: unknown): value is GObject.Object {
    return value instanceof GObject.Object;
}

/**
 * Safe property getter with type checking
 */
export function getGObjectProperty<T extends GObject.Object, K extends keyof T>(
    object: T,
    property: K,
): T[K] | undefined {
    try {
        return object[property];
    } catch (error) {
        console.error(`Failed to get property ${String(property)}:`, error);
        return undefined;
    }
}

/**
 * Safe property setter with type checking
 */
export function setGObjectProperty<T extends GObject.Object, K extends keyof T>(
    object: T,
    property: K,
    value: T[K],
): boolean {
    try {
        object[property] = value;
        return true;
    } catch (error) {
        console.error(`Failed to set property ${String(property)}:`, error);
        return false;
    }
}
