export interface Warning {
    message: string;
    /** Character offset in the source. */
    index?: number;
    /** Zero-based `[column, line]`. */
    pos?: [column: number, line: number];
}

type SVGElementOrUnknown = typeof globalThis extends { SVGSVGElement: { prototype: infer T } } ? T : unknown;

interface SvgOptions {
    seed?: string | number;
}

/** Markup from `@svg` code; `element()` needs a browser. */
export declare const svg: {
    (code: string, options?: SvgOptions): string;
    element(code: string, options?: SvgOptions): SVGElementOrUnknown | undefined;
};

/** A `polygon()` or `shape()` value from `@shape` code; arguments join with commas. */
export function shape(...code: (string | number)[]): string;

export type PrerenderNeed = 'shader' | 'mouse' | 'size' | 'clock' | 'update' | 'doodle' | 'safari' | 'variables' | 'color';

export interface PrerenderOptions {
    seed?: string | number;
    /** `''` or `true` writes a bare attribute. */
    attributes?: Record<string, string | number | boolean>;
    /** Custom properties for `@use`, keyed with the dashes. */
    variables?: Record<string, string | number>;
}

export interface PrerenderResult {
    html: string;
    seed: string | number;
    /** What only the runtime can draw. */
    needs: PrerenderNeed[];
    warnings: Warning[];
}

/** HTML with a declarative shadow root that paints without the runtime. */
export function prerender(code?: string, options?: PrerenderOptions): Promise<PrerenderResult>;

export interface ImageOptions {
    seed?: string | number;
    /** Pixels; both or neither. */
    width?: number | string;
    height?: number | string;
}

export interface ImageResult {
    svg: string;
    seed: string | number;
    needs: ('shader' | 'color')[];
    warnings: Warning[];
}

/** One standalone SVG of the doodle. */
export function image(code?: string, options?: ImageOptions): Promise<ImageResult>;
