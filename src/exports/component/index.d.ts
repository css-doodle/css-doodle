import type { Warning } from '../generator/index.js';
import type { Grid } from '../parser/index.js';

export type { Warning, Grid };

export interface ExportOptions {
    /** Whole-number multiplier on the rendered size. */
    scale?: number | string;
    /** Also render the PNG into `blob` and `source`. */
    detail?: boolean;
    download?: boolean;
    /** Download file name, without `.png`. */
    name?: string;
}

export interface ExportResult {
    width: number;
    height: number;
    svg: string;
}

export interface ExportDetail extends ExportResult {
    blob: Blob;
    /** The SVG as a data URL. */
    source: string;
}

export interface CellClick {
    x: number;
    y: number;
    z: number;
    element: Element;
    originalEvent: MouseEvent;
}

export interface CSSDoodleEventMap extends HTMLElementEventMap {
    render: CustomEvent<{}>;
    update: CustomEvent<{}>;
    beforeUpdate: CustomEvent<{}>;
    /** `preventDefault()` keeps it out of the console. */
    warn: CustomEvent<Warning>;
    'click:cell': CustomEvent<CellClick>;
}

/** `random()` in [0, 1), `random(n)` in [0, n), `random(a, b)` in [a, b). */
export interface Random {
    (): number;
    (n: number): number;
    (a: number, b: number): number;
}

export type Rgba = [r: number, g: number, b: number, a: number];

export interface AddonHelpers {
    /** Cuts at top-level commas. */
    split(text: string): string[];
    /** Cuts at top-level spaces. */
    words(text: string): string[];
    warn(message: string): void;
}

export interface ValueApi extends AddonHelpers {
    i: number;
    x: number;
    y: number;
    I: number;
    X: number;
    Y: number;
    /** The doodle's stream, the one `@r` reads. */
    random: Random;
    seed: string;
    /** A stream of the addon's own, the same for the same seed and key. */
    stream(key: string): Random;
    /** Kept for this call across the cells of one draw. */
    state: Record<string, any>;
    /** Draws again with the same seed once the promise settles. */
    wait(promise: Promise<unknown>): void;
    color(value: string, space?: string): Rgba | null;
}

export interface ShaderApi extends AddonHelpers {
    color(value: string, space?: string): Rgba | null;
    /** `@paint` math as GLSL for a float, `null` when it doesn't read. */
    expr(text: string): string | null;
}

export interface DoodleApi extends AddonHelpers {
    /** The size after `@doodle`, `'60'` for `@doodle60.name`, or `''`. */
    size: string;
    seed: string;
    stream(key: string): Random;
}

export interface Addon {
    /** `@name(…)` as a value: the evaluated arguments in, CSS text out. */
    value?(args: string[], api: ValueApi): string | number;
    /** `@name(…)` as a WebGL image: the argument text in, a fragment shader out. */
    shader?(text: string, api: ShaderApi): string;
    /** `@doodle.name(…)` as a tile: the body in, doodle code out; `size` is `WxH`. */
    doodle?(code: string, api: DoodleApi): string | { code: string; size?: string } | null | undefined;
}

export declare class CSSDoodle extends HTMLElement {
    static observedAttributes: string[];
    /** Tried before unpkg when `@use` loads an addon by name. */
    static addonBase?: string;
    /** Registers `@name()`, `@name.kind()` or `@doodle.name()`. */
    static use(name: string, addon: Addon): void;

    /** Empty before the first render; set it to a value like `'5x4'`. */
    get grid(): Partial<Grid>;
    set grid(grid: string | number);

    get seed(): string | undefined;
    set seed(seed: string | number);

    get use(): string | null;
    set use(use: string);

    /** The warnings of the last render. */
    get diagnostics(): Warning[];

    /** Milliseconds on the doodle's clock. */
    currentTime: number;

    update(code?: string): void;
    pause(): void;
    resume(): void;
    /** Milliseconds, or a string with `ms`, `s` or `m`. */
    autoUpdate(interval?: number | string): void;
    cancelAutoUpdate(): void;
    export(options: ExportOptions & ({ detail: true } | { download: true })): Promise<ExportDetail>;
    export(options?: ExportOptions): Promise<ExportResult>;

    addEventListener<K extends keyof CSSDoodleEventMap>(type: K, listener: (this: CSSDoodle, event: CSSDoodleEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof CSSDoodleEventMap>(type: K, listener: (this: CSSDoodle, event: CSSDoodleEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

/** Registers the class under the name, unless the name is taken. */
export function define(name: string, element: CustomElementConstructor): void;

/** Registers `css-doodle` if needed and returns a new element with the code. */
export function create(code?: string): CSSDoodle;

declare global {
    interface HTMLElementTagNameMap {
        'css-doodle': CSSDoodle;
    }
}
