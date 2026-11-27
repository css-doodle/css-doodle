import type { Warning } from '../generator/index.js';

/** A node of the internal AST, which may change between versions. */
export interface Node {
    type: string;
    [key: string]: unknown;
}

export interface Grid {
    x: number;
    y: number;
    z: number;
    count: number;
    ratio: number;
}

export interface Var {
    name: string;
    fallback?: Var[];
}

export interface ValueGroupOptions {
    symbol?: string | string[];
    noSpace?: boolean;
    verbose?: boolean;
}

export function parseCss(input: string, extra?: { getVariable?(name: string): string }): Node[] & { warnings: Warning[]; addons: string[] };
export function parseSvg(source: string): Node;
export function parsePattern(source: string): Node[];
export function parseShapeCommands(input: string): Record<string, unknown>;
export function parseSvgPath(input: string): { commands: { name: string; value: number[]; type: 'absolute' | 'relative' }[]; valid: boolean };
export function parseGrid(size: string | number, max?: number): Grid;
export function parseDirection(input: string): { direction: string; angle: number };
export function parseValueGroup(input: string | number, options: ValueGroupOptions & { verbose: true }): { group: string; value: string }[];
export function parseValueGroup(input: string | number, options?: ValueGroupOptions): string[];
export function parseVar(input: string): Var[];
export function parseCompoundValue(input: string): { value?: number; unit?: string };

export declare namespace tokenizer {
    const NAME_CHAR: string;

    class Token {
        constructor(type: Token['type'], value: string, pos: Token['pos'], index: number);
        type: 'Word' | 'Number' | 'Symbol' | 'Space';
        value: string;
        pos: [column: number, line: number];
        index: number;
        /** On a quote that opens or closes a string. */
        status?: 'open' | 'close';
        /** Any symbol, or one of up to three values. */
        isSymbol(a?: string, b?: string, c?: string): boolean;
        isSpace(): boolean;
        isNumber(): boolean;
        isWord(): boolean;
    }

    function scan(source: unknown, options?: { ignoreInlineComment?: boolean; lineCommentsIn?: RegExp }): Token[];
    function iterator<T>(input: T[]): { curr(n?: number): T | undefined; next(): T | undefined };
    function textOf(tokens: Token[]): string;
    function itemsOf(tokens: Token[], keepEmpty?: boolean): Token[][];
}
