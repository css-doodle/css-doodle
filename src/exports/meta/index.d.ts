export interface Names {
    names: string[];
    /** Alias → canonical name. */
    alias: Record<string, string>;
}

export declare const functions: Names & {
    /** The `@a.b` forms by function, such as `tile: ['circle', …]`. */
    variants: Record<string, string[]>;
};

export declare const mathFunctions: string[];
export declare const selectors: Names;
export declare const properties: Names;

/** Operator → precedence, higher binds tighter. */
export declare const calcOperators: Record<string, number>;
