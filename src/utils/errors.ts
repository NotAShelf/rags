/**
 * Base error class for all AGS errors
 */
export class AgsError extends Error {
    constructor(
        message: string,
        public context?: Record<string, unknown>,
    ) {
        super(message);
        this.name = this.constructor.name;
        // @ts-expect-error V8-specific API not in standard Error type
        if (Error.captureStackTrace) {
            // @ts-expect-error V8-specific API not in standard Error type
            Error.captureStackTrace(this, this.constructor);
        }
    }

    toString(): string {
        let ctx = '';
        if (this.context) {
            try {
                ctx = ` | Context: ${JSON.stringify(this.context)}`;
            } catch {
                ctx = ' | Context: [Unable to serialize]';
            }
        }
        return `${this.name}: ${this.message}${ctx}`;
    }
}

/**
 * Configuration validation errors
 */
export class AgsConfigError extends AgsError {}

/**
 * Service initialization and operation errors
 */
export class AgsServiceError extends AgsError {}

/**
 * DBus connection and proxy errors
 */
export class AgsDBusError extends AgsError {}

/**
 * Runtime validation errors
 */
export class AgsRuntimeError extends AgsError {}
