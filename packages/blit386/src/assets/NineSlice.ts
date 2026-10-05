import { Rect2i } from '../utils/Rect2i';
import { SpriteSheet } from './SpriteSheet';

/**
 * How a nine-slice edge or center fills its box: `'stretch'` samples the source strip into the box with the
 * sprite stretch rule, `'tile'` repeats it at 1:1 from the box's top-left and crops the last tile.
 *
 * @since 1.8.0
 */
export type NineSliceMode = 'stretch' | 'tile';

/**
 * Fill modes for {@link NineSlice.fromSheet}. Both default to `'stretch'`.
 *
 * @since 1.8.0
 */
export interface NineSliceOptions {
    /** How the four edges fill their length. */
    edges?: NineSliceMode;
    /** How the center fills its box. */
    center?: NineSliceMode;
}

/** Every accepted {@link NineSliceMode}, for the runtime check on untyped callers. */
const NINE_SLICE_MODES: readonly NineSliceMode[] = ['stretch', 'tile'];

/**
 * A sprite region split into 9 parts for scalable UI panels: 4 corners drawn at 1:1, 4 edges and a center that
 * stretch or tile. Draw it with `BT.drawNineSlice`. Immutable: build it once in `init()` and draw it every frame.
 *
 * @since 1.8.0
 */
export class NineSlice {
    /**
     * Internal constructor: use {@link NineSlice.fromSheet} instead.
     *
     * @param sheet - Sheet holding the panel art.
     * @param outer - Whole panel, sheet coordinates (frozen).
     * @param inner - Center region, sheet coordinates (frozen).
     * @param edges - Edge fill mode.
     * @param center - Center fill mode.
     */
    private constructor(
        public readonly sheet: SpriteSheet,
        public readonly outer: Rect2i,
        public readonly inner: Rect2i,
        public readonly edges: NineSliceMode,
        public readonly center: NineSliceMode,
    ) {
        Object.freeze(this);
    }

    /**
     * Builds a nine-slice from a sheet region. Both rects are in sheet coordinates; `inner` marks the center,
     * and the space between `inner` and `outer` gives the corners and edges. `inner` may touch `outer`, so a
     * zero-size side makes a three-slice bar.
     *
     * @since 1.8.0
     * @param sheet - Sheet holding the panel art. It may be indexized later; drawing checks that.
     * @param outer - Whole panel region, inside the sheet.
     * @param inner - Center region, inside `outer`, at least 1x1.
     * @param options - Edge and center fill modes, both `'stretch'` by default.
     * @returns A frozen nine-slice holding copies of both rects.
     * @throws If `sheet` is not a `SpriteSheet`, a rect is not a `Rect2i` of integers, `outer` leaves the sheet,
     *   `inner` leaves `outer` or is smaller than 1x1, `options` is not an object, or a mode is not `'stretch'`
     *   or `'tile'`.
     *
     * @example
     * const panel = NineSlice.fromSheet(sheet, new Rect2i(0, 0, 16, 16), new Rect2i(4, 4, 8, 8), { edges: 'tile' });
     * BT.drawNineSlice(panel, new Rect2i(20, 20, 120, 64));
     */
    static fromSheet(sheet: SpriteSheet, outer: Rect2i, inner: Rect2i, options: NineSliceOptions = {}): NineSlice {
        if (!(sheet instanceof SpriteSheet)) {
            throw new Error('NineSlice.fromSheet expects a SpriteSheet as its first argument');
        }

        assertIntegerRect('outer', outer);
        assertIntegerRect('inner', inner);

        if (outer.x < 0 || outer.y < 0 || outer.right > sheet.width || outer.bottom > sheet.height) {
            throw new Error(
                `NineSlice outer rect (${formatRect(outer)}) must lie inside the ${sheet.width}x${sheet.height} sheet`,
            );
        }

        if (inner.width < 1 || inner.height < 1) {
            throw new Error(`NineSlice inner rect must be at least 1x1, got ${inner.width}x${inner.height}`);
        }

        if (inner.x < outer.x || inner.y < outer.y || inner.right > outer.right || inner.bottom > outer.bottom) {
            throw new Error(
                `NineSlice inner rect (${formatRect(inner)}) must lie inside the outer rect (${formatRect(outer)})`,
            );
        }

        // Untyped callers can pass null or a primitive; reject it rather than guess the defaults.
        if (typeof options !== 'object' || options === null) {
            throw new Error("NineSlice.fromSheet options must be an object like { edges: 'tile' }, or left out");
        }

        return new NineSlice(
            sheet,
            Object.freeze(outer.clone()),
            Object.freeze(inner.clone()),
            resolveMode('edges', options.edges),
            resolveMode('center', options.center),
        );
    }
}

/**
 * Splits one axis of a nine-slice box into start cap, middle, and end cap sizes. When the box is smaller than
 * both caps, the caps share it in proportion to their sizes (start takes the floor) and the middle gets 0.
 * Engine-internal; not re-exported from the package entry.
 *
 * @param size - Box size on this axis; `<= 0` gives all zeros.
 * @param start - Source start cap size (left or top).
 * @param end - Source end cap size (right or bottom).
 * @param out - Receives `[startSize, middleSize, endSize]`.
 */
export function splitNineSliceAxis(size: number, start: number, end: number, out: Int32Array): void {
    if (size <= 0) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        return;
    }

    const caps = start + end;

    if (size >= caps) {
        out[0] = start;
        out[1] = size - caps;
        out[2] = end;
        return;
    }

    // size < caps implies caps > 0, so the division is safe.
    const startSize = Math.floor((size * start) / caps);

    out[0] = startSize;
    out[1] = 0;
    out[2] = size - startSize;
}

/**
 * Validates that a rect is a Rect2i with integer fields.
 *
 * @param name - Argument name for the message.
 * @param rect - Value to check.
 * @throws If `rect` is not a `Rect2i` or holds a non-integer field.
 */
function assertIntegerRect(name: 'outer' | 'inner', rect: Rect2i): void {
    if (!(rect instanceof Rect2i)) {
        throw new Error(`NineSlice.fromSheet expects a Rect2i for ${name}`);
    }

    if (
        !Number.isInteger(rect.x) ||
        !Number.isInteger(rect.y) ||
        !Number.isInteger(rect.width) ||
        !Number.isInteger(rect.height)
    ) {
        throw new Error(`NineSlice ${name} rect fields must be integers, got (${formatRect(rect)})`);
    }
}

/**
 * Resolves an optional NineSliceMode, defaulting to `'stretch'`.
 *
 * @param name - Option name for the message.
 * @param mode - Option value, possibly from untyped code.
 * @returns The mode, `'stretch'` when absent.
 * @throws If `mode` is defined and not a {@link NineSliceMode}.
 */
function resolveMode(name: 'edges' | 'center', mode: NineSliceMode | undefined): NineSliceMode {
    if (mode === undefined) {
        return 'stretch';
    }

    if (!NINE_SLICE_MODES.includes(mode)) {
        throw new Error(`NineSlice ${name} must be 'stretch' or 'tile', got ${String(mode)}`);
    }

    return mode;
}

/**
 * Formats a rect as a string for error messages.
 *
 * @param rect - Rect to format.
 * @returns `x, y, width x height`.
 */
function formatRect(rect: Rect2i): string {
    return `${rect.x}, ${rect.y}, ${rect.width}x${rect.height}`;
}
