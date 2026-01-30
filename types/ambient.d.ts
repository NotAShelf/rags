/**
 * GJS global `print` function for stdout output.
 *
 * @param args - Values to print (converted to strings)
 */
declare function print(...args: any[]): void;

/**
 * GJS package metadata, set at runtime by the application entry point.
 */
declare const pkg: {
    /** The application version string. */
    version: string;
    /** The application bus name / identifier. */
    name: string;
    /** Path to the application's data directory. */
    pkgdatadir: string;
};

/**
 * GJS legacy imports system.
 *
 * @deprecated Prefer ES module imports instead.
 */
declare const imports: {
    config: any;
    gi: any;
    searchPath: string[];
};

/** GJS console module augmentation with GLib-style logging. */
declare module console {
    function error(obj: object, others?: object[]): void;
    function error(msg: string, subsitutions?: any[]): void;
    function log(obj: object, others?: object[]): void;
    function log(msg: string, subsitutions?: any[]): void;
    function warn(obj: object, others?: object[]): void;
    function warn(msg: string, subsitutions?: any[]): void;
}

/** GJS String.format extension for printf-style formatting. */
declare interface String {
    format(...replacements: string[]): string;
    format(...replacements: number[]): string;
}

/** GJS Number.toFixed override that returns a number instead of string. */
declare interface Number {
    toFixed(digits: number): number;
}

/**
 * WHATWG TextDecoder for converting byte sequences to strings.
 */
declare class TextDecoder {
    constructor(label?: string, options?: TextDecoderOptions);
    decode(input?: BufferSource, options?: TextDecodeOptions): string;
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
}

/**
 * WHATWG TextEncoder for converting strings to UTF-8 byte sequences.
 */
declare class TextEncoder {
    constructor();
    encode(input?: string): Uint8Array;
}
