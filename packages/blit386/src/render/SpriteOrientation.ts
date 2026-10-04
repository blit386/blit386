/**
 * Sprite flip / quarter-turn flags and the single orientation table both renderers read.
 *
 * The 32 possible flag masks reduce to 8 orientations. Each orientation is one row of
 * {@link SPRITE_ORIENTATIONS}; the software texel remap and the WebGPU UV corner order are both
 * derived from that row, so the two backends cannot drift apart.
 */

import { Vector2i } from '../utils/Vector2i';

/** Horizontal flip bit. Public as `BT.FLIP_H`. */
export const SPRITE_FLIP_H = 1;

/** Vertical flip bit. Public as `BT.FLIP_V`. */
export const SPRITE_FLIP_V = 1 << 1;

/** One clockwise quarter turn. Public as `BT.ROT_90_CW`. */
export const SPRITE_ROT_90_CW = 1 << 2;

/** Two clockwise quarter turns. Public as `BT.ROT_180_CW`. */
export const SPRITE_ROT_180_CW = 1 << 3;

/** Three clockwise quarter turns. Public as `BT.ROT_270_CW`. */
export const SPRITE_ROT_270_CW = 1 << 4;

/** Every valid flag bit. Bits outside this mask are rejected. */
const FLAGS_MASK = 0x1f;

/**
 * Per-draw options for the params form of `BT.drawSprite`.
 *
 * Read, never mutated or retained: a hot loop can allocate one object and rewrite its fields
 * between draws. Create it with every field present (`{ flags: 0, scale: 1, paletteOffset: 0 }`) so its
 * shape never changes.
 *
 * @since 1.8.0
 */
export interface SpriteDrawParams {
    /** Any combination of `BT.FLIP_*` / `BT.ROT_*` bits (default `0`). */
    flags?: number;

    /**
     * Positive integer scale of the post-flags footprint, in screen axes (default `1`). `2` equals
     * `new Vector2i(2, 2)`; `scale.x` is on-screen width even after a 90-degree turn. For uneven sizes,
     * pass a `Rect2i` destination instead. With a `Rect2i` destination only `1` (or leaving it out) is
     * accepted, so one reused params object works for both destination kinds.
     */
    scale?: number | Vector2i;

    /** Same meaning as the fast-path 4th argument of `BT.drawSprite` (default `0`). */
    paletteOffset?: number;
}

/**
 * One orientation's point map from a `sw x sh` source onto its post-flags footprint:
 * `(u, v) = swap ? (y, x) : (x, y)`, then `fx = flipX ? fw - u : u` and `fy = flipY ? fh - v : v`,
 * where the footprint `fw x fh` is `sh x sw` when `swap` is set and `sw x sh` otherwise.
 */
export type SpriteOrientation = {
    readonly swap: boolean;
    readonly flipX: boolean;
    readonly flipY: boolean;
};

/**
 * The 8 orientations, indexed `0`-`7` in the order of the table in `docs/api-rendering.md`
 * ("Transform order and flags").
 */
export const SPRITE_ORIENTATIONS: readonly SpriteOrientation[] = Object.freeze([
    { swap: false, flipX: false, flipY: false }, // 0: identity, (x, y)
    { swap: false, flipX: true, flipY: false }, // 1: FLIP_H, (sw - x, y)
    { swap: false, flipX: false, flipY: true }, // 2: FLIP_V, (x, sh - y)
    { swap: false, flipX: true, flipY: true }, // 3: ROT_180_CW, (sw - x, sh - y)
    { swap: true, flipX: true, flipY: false }, // 4: ROT_90_CW, (sh - y, x)
    { swap: true, flipX: true, flipY: true }, // 5: ROT_90_CW | FLIP_H, (sh - y, sw - x)
    { swap: true, flipX: false, flipY: false }, // 6: ROT_90_CW | FLIP_V, (y, x)
    { swap: true, flipX: false, flipY: true }, // 7: ROT_270_CW, (y, sw - x)
]);

/**
 * Applies an orientation's point map.
 *
 * @param row - Orientation row.
 * @param x - Source X in `[0, sw]`.
 * @param y - Source Y in `[0, sh]`.
 * @param sw - Source width.
 * @param sh - Source height.
 * @returns The point in the post-flags footprint.
 */
function mapPoint(row: SpriteOrientation, x: number, y: number, sw: number, sh: number): [number, number] {
    const fw = row.swap ? sh : sw;
    const fh = row.swap ? sw : sh;
    const u = row.swap ? y : x;
    const v = row.swap ? x : y;

    return [row.flipX ? fw - u : u, row.flipY ? fh - v : v];
}

/** Probe source size for matching composed transforms to rows: non-square, so every orientation differs. */
const PROBE_W = 3;
const PROBE_H = 2;

/** Quad corners, indexed TL, TR, BL, BR: bit 0 set = right edge, bit 1 set = bottom edge. */
const CORNER_COUNT = 4;

/**
 * Composes a mask in the fixed order (`FLIP_H`, `FLIP_V`, then clockwise quarter turns summed
 * modulo 4) and returns the orientation index whose point map gives the same result.
 *
 * @param mask - Flags inside {@link FLAGS_MASK}.
 * @returns Orientation index `0`-`7`.
 */
function composeMask(mask: number): number {
    let w = PROBE_W;
    let h = PROBE_H;
    let corners: Array<[number, number]> = [
        [0, 0],
        [w, 0],
        [0, h],
    ];

    if (mask & SPRITE_FLIP_H) {
        corners = corners.map(([x, y]) => [w - x, y]);
    }

    if (mask & SPRITE_FLIP_V) {
        corners = corners.map(([x, y]) => [x, h - y]);
    }

    const turns =
        ((mask & SPRITE_ROT_90_CW ? 1 : 0) + (mask & SPRITE_ROT_180_CW ? 2 : 0) + (mask & SPRITE_ROT_270_CW ? 3 : 0)) %
        4;

    for (let t = 0; t < turns; t++) {
        corners = corners.map(([x, y]) => [h - y, x]);
        [w, h] = [h, w];
    }

    const index = SPRITE_ORIENTATIONS.findIndex((row) =>
        corners.every(([cx, cy], i) => {
            const [px, py] = mapPoint(row, i === 1 ? PROBE_W : 0, i === 2 ? PROBE_H : 0, PROBE_W, PROBE_H);
            return px === cx && py === cy;
        }),
    );

    if (index < 0) {
        throw new Error(`Sprite flags 0x${mask.toString(16)} compose to no known orientation`);
    }

    return index;
}

/** Mask (`0`-`31`) -> orientation index, computed once at module load. */
const ORIENTATION_BY_MASK: Uint8Array = Uint8Array.from({ length: FLAGS_MASK + 1 }, (_, mask) => composeMask(mask));

/**
 * For each orientation (stride 4) and each screen corner (TL, TR, BL, BR), the source corner that
 * lands there: bit 0 set = right edge (`u1`), bit 1 set = bottom edge (`v1`). Derived from
 * {@link SPRITE_ORIENTATIONS}, so it is the same table the software remap reads.
 */
export const SPRITE_UV_CORNERS: Uint8Array = Uint8Array.from(
    { length: SPRITE_ORIENTATIONS.length * CORNER_COUNT },
    (_, slot) => {
        const row = SPRITE_ORIENTATIONS[Math.floor(slot / CORNER_COUNT)] as SpriteOrientation;
        const screenCorner = slot % CORNER_COUNT;
        const fw = row.swap ? PROBE_H : PROBE_W;
        const fh = row.swap ? PROBE_W : PROBE_H;
        const targetX = screenCorner & 1 ? fw : 0;
        const targetY = screenCorner & 2 ? fh : 0;

        for (let src = 0; src < CORNER_COUNT; src++) {
            const [x, y] = mapPoint(row, src & 1 ? PROBE_W : 0, src & 2 ? PROBE_H : 0, PROBE_W, PROBE_H);

            if (x === targetX && y === targetY) {
                return src;
            }
        }

        throw new Error('Sprite orientation table is not a bijection on corners');
    },
);

/**
 * Validates a flags mask and resolves it to an orientation index.
 *
 * @param flags - Any combination of `BT.FLIP_*` / `BT.ROT_*` bits.
 * @returns Orientation index `0`-`7` (a row of {@link SPRITE_ORIENTATIONS}).
 * @throws If `flags` is not an integer or sets a bit outside the five flag constants.
 */
export function resolveSpriteOrientation(flags: number): number {
    // A range check, not `flags & ~mask`: bitwise ops truncate to 32 bits, so 2 ** 40 would pass as 0.
    if (!Number.isInteger(flags) || flags < 0 || flags > FLAGS_MASK) {
        throw new Error(
            `Invalid sprite flags ${String(flags)}: use a combination of BT.FLIP_H, BT.FLIP_V, BT.ROT_90_CW, ` +
                'BT.ROT_180_CW, and BT.ROT_270_CW',
        );
    }

    // `flags` is a validated integer in [0, FLAGS_MASK], so the 32-entry lookup always hits.
    // eslint-disable-next-line security/detect-object-injection
    return ORIENTATION_BY_MASK[flags] as number;
}

/**
 * Footprint texel sampled by destination pixel `d` when `f` footprint texels are stretched across `size`
 * destination pixels: the pixel center, exact ties rounding down. All operands are non-negative integers.
 * Equals `floor(d * f / size)` whenever `size` is a multiple of `f` (1:1 and integer scale).
 *
 * @param d - Destination pixel, `0` to `size - 1`.
 * @param f - Footprint length in texels (at least 1).
 * @param size - Destination length in pixels (at least 1).
 * @returns Footprint texel, `0` to `f - 1`.
 */
export function stretchSampleIndex(d: number, f: number, size: number): number {
    return Math.floor(((2 * d + 1) * f - 1) / (2 * size));
}

/**
 * Throws unless `value` is a positive integer scale component.
 *
 * @param value - One scale component.
 * @throws If `value` is not an integer of at least 1.
 */
function assertScaleComponent(value: number): void {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(
            `Invalid sprite scale ${String(value)}: scale takes positive integers; for an uneven size, pass a Rect2i destination instead`,
        );
    }
}

/**
 * Validates `SpriteDrawParams.scale` and writes it into `out` as two integers. Validates before writing,
 * because `Vector2i.set` truncates.
 *
 * @param scale - The params field (`undefined` means 1).
 * @param out - Caller-owned vector to write into.
 * @returns `out`.
 * @throws If `scale` is not a positive integer or a `Vector2i` of positive integers.
 */
export function resolveSpriteScale(scale: number | Vector2i | undefined, out: Vector2i): Vector2i {
    if (scale === undefined) {
        return out.set(1, 1);
    }

    if (typeof scale === 'number') {
        assertScaleComponent(scale);
        return out.set(scale, scale);
    }

    if (scale instanceof Vector2i) {
        assertScaleComponent(scale.x);
        assertScaleComponent(scale.y);
        return out.set(scale.x, scale.y);
    }

    const got = scale === null ? 'null' : typeof scale;
    throw new Error(`Invalid sprite scale (${got}): use a positive integer or a Vector2i of positive integers`);
}

/**
 * Whether `scale` leaves the footprint unchanged: `undefined`, `1`, or `Vector2i(1, 1)`. The only values a
 * `Rect2i` destination accepts.
 *
 * @param scale - The params field.
 * @returns `true` for a neutral scale.
 */
export function isNeutralSpriteScale(scale: number | Vector2i | undefined): boolean {
    return scale === undefined || scale === 1 || (scale instanceof Vector2i && scale.x === 1 && scale.y === 1);
}
