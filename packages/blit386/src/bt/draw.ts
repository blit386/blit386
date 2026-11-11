/**
 * Drawing: clearing, primitives, system and bitmap text, sprites, tiles, and nine-slice panels.
 *
 * Part of the `BT` namespace; `BLIT386.ts` merges every part into `BT`.
 */

import type { BitmapFont } from '../assets/BitmapFont';
import type { NineSlice } from '../assets/NineSlice';
import type { SpriteSheet } from '../assets/SpriteSheet';
import { BTAPI } from '../core/BTAPI';
import type { SpriteDrawParams } from '../render/SpriteOrientation';
import { Color32 } from '../utils/Color32';
import { SYSTEM_FONT_NOT_READY_MESSAGE } from '../utils/errorMessages';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { reportDrawError, showBeginnerRuntimeError } from './internal';

/**
 * Checks that the renderer exists and, when it does not, reports a draw call made before bootstrap finished.
 *
 * @param methodName - BT method name being called.
 * @returns `true` when the call can go ahead.
 */
export function drawReady(methodName: string): boolean {
    if (BTAPI.instance.getRenderer() !== null) {
        return true;
    }

    showBeginnerRuntimeError(
        `Can't use BT.${methodName}() yet because the engine is still starting.\n` +
            "The engine isn't ready yet. Make sure all drawing happens inside update() or render().",
        'Engine Not Ready',
    );

    return false;
}

/**
 * Treats any non-null object argument as a `Vector2i` for `BT.drawTile` dispatch.
 *
 * A bare `typeof value === 'object'` also matches `null`, which would let an untyped
 * `null` argument reach `.x` / `.y` and surface a raw TypeError instead of the
 * wrong-arguments error. Still `typeof`-based, so the dispatch stays `instanceof`-free.
 *
 * @param value - Argument to classify.
 * @returns `true` for a non-null object.
 */
function isVectorArg(value: unknown): value is Vector2i {
    return typeof value === 'object' && value !== null;
}

/**
 * Converts an unknown runtime value into a concise display type label.
 *
 * @param value - Runtime value to inspect.
 * @returns A short readable type description.
 */
function describeRuntimeType(value: unknown): string {
    if (value === null) {
        return 'null';
    }

    if (value === undefined) {
        return 'undefined';
    }

    if (value instanceof Vector2i) {
        return 'Vector2i';
    }

    if (value instanceof Rect2i) {
        return 'Rect2i';
    }

    if (value instanceof Color32) {
        return 'Color32';
    }

    if (value instanceof Promise) {
        return 'Promise (missing await?)';
    }

    if (typeof value === 'object') {
        const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
        return ctor && ctor.length > 0 ? ctor : 'object';
    }

    return typeof value;
}

/**
 * Shows a friendly hint when a Promise was passed instead of an awaited asset.
 *
 * @param loadCall - Asset loader call name to reference in the message.
 */
function reportMissingAwait(loadCall: string): void {
    showBeginnerRuntimeError(`Did you forget to use 'await' before ${loadCall}?`, 'Missing await');
}

/** Drawing members of `BT`. */
export const draw = {
    /**
     * Sets the frame clear color using a palette index.
     *
     * The renderer uses this color when clearing the full display at the start
     * of the next frame.
     *
     * @since 0.1.0
     * @param paletteIndex - Palette index for the full-screen clear pass.
     */
    clear: (paletteIndex: number): void => {
        if (!drawReady('clear')) {
            return;
        }

        try {
            BTAPI.instance.draw.setClearColor(paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Fills a rectangular display region with a palette-indexed color.
     *
     * @since 0.1.0
     * @param rect - Rectangle in display pixel coordinates.
     * @param paletteIndex - Palette color index.
     */
    clearRect: (rect: Rect2i, paletteIndex: number): void => {
        if (!drawReady('clearRect')) {
            return;
        }

        try {
            BTAPI.instance.draw.clearRect(rect, paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Draws a single pixel.
     *
     * Accepts either:
     * - `(posOrX: Vector2i, yOrColor: number)` where `yOrColor` is the palette index.
     * - `(posOrX: number, yOrColor: number, maybeColor: number)` for `(x, y, paletteIndex)`.
     *
     * Fractional coordinates are truncated toward zero, the same rule `Vector2i` applies.
     *
     * @since 0.1.0
     * @changed 1.8.1 Numeric coordinates now truncate toward zero before rendering, so the software backend no longer corrupts neighboring pixels.
     * @param posOrX - Pixel position as `Vector2i`, or x coordinate when using numeric overload.
     * @param yOrColor - Palette index for vector overload, or y coordinate for numeric overload.
     * @param maybeColor - Palette index when using numeric overload.
     */
    drawPixel: (posOrX: Vector2i | number, yOrColor: number, maybeColor?: number): void => {
        if (!drawReady('drawPixel')) {
            return;
        }

        try {
            if (posOrX instanceof Vector2i && maybeColor === undefined) {
                BTAPI.instance.draw.drawPixel(posOrX, yOrColor);
                return;
            }

            if (typeof posOrX === 'number' && typeof maybeColor === 'number') {
                BTAPI.instance.draw.drawPixelXY(posOrX, yOrColor, maybeColor);
                return;
            }

            const typeDetails = [
                describeRuntimeType(posOrX),
                describeRuntimeType(yOrColor),
                describeRuntimeType(maybeColor),
            ]
                .filter((part) => part !== 'undefined')
                .join(', ');
            showBeginnerRuntimeError(
                `drawPixel expects (x, y, paletteIndex) or (Vector2i, paletteIndex). Got: [${typeDetails}]`,
                'Wrong drawPixel Arguments',
            );
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Draws a pixel-perfect line between two points.
     *
     * Uses rasterized line drawing without antialiasing.
     *
     * @since 0.1.0
     * @param p0 - Start position in display coordinates.
     * @param p1 - End position in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawLine: (p0: Vector2i, p1: Vector2i, paletteIndex: number): void => {
        if (!drawReady('drawLine')) {
            return;
        }

        try {
            BTAPI.instance.draw.drawLine(p0, p1, paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Draws an unfilled rectangle outline.
     *
     * @since 0.1.0
     * @param rect - Rectangle bounds in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawRect: (rect: Rect2i, paletteIndex: number): void => {
        if (!drawReady('drawRect')) {
            return;
        }

        try {
            BTAPI.instance.draw.drawRect(rect, paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Draws a filled rectangle.
     *
     * @since 0.1.0
     * @param rect - Rectangle bounds in display coordinates.
     * @param paletteIndex - Palette color index.
     */
    drawRectFill: (rect: Rect2i, paletteIndex: number): void => {
        if (!drawReady('drawRectFill')) {
            return;
        }

        try {
            BTAPI.instance.draw.drawRectFill(rect, paletteIndex);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Built-in 6x14 system font used by {@link BT.systemPrint} (live reference, not a copy).
     *
     * Read `codePoints` on the returned font to see every Unicode code point it covers, or
     * `hasGlyph(char)` to test one character. Pass it to {@link BT.printFont} to draw with the
     * exact glyphs and metrics {@link BT.systemPrint} uses internally.
     *
     * @since 1.7.0
     * @changed 1.8.1 The 14 blank reserved glyphs at U+E006-U+E013 are gone: `hasGlyph` is false for them and `codePoints` and `glyphCount` shrink by 14.
     * @throws Error if read before {@link BT.init} finishes creating the system font.
     * @returns The engine's built-in system font.
     */
    get systemFont(): BitmapFont {
        const font = BTAPI.instance.getSystemFont();

        if (!font) {
            throw new Error(SYSTEM_FONT_NOT_READY_MESSAGE);
        }

        return font;
    },

    /**
     * Draws text using the built-in 6x14 system font.
     *
     * The system font covers printable ASCII (characters 32-126) plus extra glyphs: dashes, accented Latin, media
     * icons, arrows, Greek capitals, and more ({@link BT.systemFont}'s `codePoints` lists them all). For custom
     * bitmap fonts with proportional glyphs, use {@link BT.printFont} instead.
     *
     * @since 1.0.3
     * @changed 1.8.1 U+E006-U+E013 now draw the fallback glyph instead of nothing (the blank reserved glyphs were removed).
     * @changed 1.8.1 On WebGPU a character outside the Basic Multilingual Plane (an emoji) draws one fallback glyph, not two, matching software and `BT.systemPrintMeasure`.
     * @param pos - Text origin in display coordinates.
     * @param paletteIndex - Palette color index for the text.
     * @param text - String to render.
     */
    systemPrint: (pos: Vector2i, paletteIndex: number, text: string): void => {
        if (!drawReady('systemPrint')) {
            return;
        }

        try {
            BTAPI.instance.draw.drawSystemText(pos, paletteIndex, text);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Measures the pixel dimensions of a string rendered with the built-in
     * system font.
     *
     * @since 1.0.3
     * @changed 1.8.1 Before initialization, returns a new `(0, 0)` vector instead of the frozen `Vector2i.zero()`.
     * @param text - Text string to measure.
     * @returns Width and height in pixels, or a new `(0, 0)` vector before engine initialization.
     */
    systemPrintMeasure: (text: string): Vector2i => {
        const font = BTAPI.instance.getSystemFont();

        if (!font) {
            return new Vector2i();
        }

        const size = font.measureTextSize(text);

        return new Vector2i(size.width, size.height);
    },

    /**
     * Draws text with a bitmap font through the indexed sprite pipeline.
     *
     * Supports proportional glyph widths and glyph-level offsets defined by the
     * supplied {@link BitmapFont}. The font's underlying sprite sheet must have
     * been indexized before calling this.
     *
     * Palette offset semantics and out-of-range behavior are identical to
     * {@link BT.drawSprite}.
     *
     * @since 0.1.0
     * @changed 1.8.1 Glyph pixels on an alpha-0 palette entry or past the palette are skipped on both backends, and on WebGPU a character outside the Basic Multilingual Plane (an emoji) draws one glyph, not two, matching `BitmapFont.measureText`.
     * @param font - Font asset used for rendering.
     * @param pos - Text origin in display coordinates.
     * @param text - String to render.
     * @param paletteOffset - Shift added to every stored glyph index before palette lookup (default 0).
     */
    printFont: (font: BitmapFont, pos: Vector2i, text: string, paletteOffset?: number): void => {
        if (!drawReady('printFont')) {
            return;
        }

        try {
            if (font instanceof Promise) {
                reportMissingAwait('BitmapFont.load()');
                return;
            }

            BTAPI.instance.draw.drawBitmapText(font, pos, text, paletteOffset);
        } catch (error) {
            reportDrawError(error);
        }
    },

    /**
     * Draws a sprite region from an indexed sprite sheet.
     *
     * Sprite draws are batched internally. Grouping draws from the same
     * {@link SpriteSheet} minimizes batch flushes and reduces GPU state changes.
     *
     * The sprite sheet must have been converted to palette indices via
     * `spriteSheet.indexize(palette)` before the first draw call. Prefer
     * `SpriteSheet.loadIndexed(...)` for one-call setup.
     *
     * **Palette offset semantics:** Sprite pixels are stored as palette indices starting at 1.
     * Index 0 is always transparent and is discarded by the fragment shader. The final palette
     * lookup is `storedIndex + paletteOffset`, so:
     *
     * - `paletteOffset = 0` (default): a sprite pixel stored at index 1 renders as `palette[1]`.
     *   `palette[0]` is never reachable because stored indices start at 1.
     * - `paletteOffset = N`: shifts the entire sprite's color range up by N slots. A pixel stored
     *   at index 1 renders as `palette[1 + N]`, a pixel at index 2 renders as `palette[2 + N]`,
     *   and so on. Use this for palette-swap effects such as team colors or damage flashes.
     *
     * **Out-of-range behavior:** `paletteOffset` must be a non-negative integer below the palette size,
     * or the call throws. A pixel whose `storedIndex + paletteOffset` lands past the last palette index,
     * or on a palette entry with alpha 0, is skipped (left transparent), the same on both backends.
     *
     * **Flip and quarter turns (since 1.8.0):** pass a {@link SpriteDrawParams} object as the 4th argument
     * instead of a number. `params.flags` takes any combination of `BT.FLIP_H`, `BT.FLIP_V`,
     * `BT.ROT_90_CW`, `BT.ROT_180_CW`, and `BT.ROT_270_CW`, composed as FLIP_H, then FLIP_V, then the
     * clockwise quarter turns summed modulo 4. `destPos` is the top-left of the post-flags footprint, so a
     * 16x32 sprite with `ROT_90_CW` covers 32x16. `params.paletteOffset` means the same as the number form.
     * The object is read, never mutated or retained: allocate it once and rewrite its fields between draws.
     *
     * **Scale and stretch (since 1.8.0):** `params.scale` takes a positive integer or a `Vector2i` of
     * positive integers and multiplies the post-flags footprint in screen axes (`scale.x` is on-screen width
     * even after a 90-degree turn). For an uneven size, pass a `Rect2i` as `destPos` instead: the sprite is
     * stretched into it with nearest-neighbor sampling at pixel centers, the same on both backends. A
     * `Rect2i` needs the params form - write `BT.drawSprite(sheet, src, destRect, {})` - and accepts only
     * `scale: 1`, `new Vector2i(1, 1)`, or no scale.
     *
     * **Pivot (since 1.8.0):** `params.pivot` is a point in source pixels, relative to `srcRect`'s top-left,
     * that lands on a `Vector2i` `destPos` instead of the footprint's top-left. It goes through the flags,
     * then the scale. An explicit `(0, 0)` is the source origin and moves under flips, unlike no pivot;
     * assign `params.pivot = undefined` to reset. A `Rect2i` `destPos` takes no pivot.
     *
     * @since 0.1.0
     * @changed 1.8.0 Added the `SpriteDrawParams` 4th-argument form for flips, quarter turns, integer scale, pivot placement, and Rect2i stretch destinations.
     * @changed 1.8.1 Pixels on an alpha-0 palette entry or past the palette are skipped on both backends (software drew them opaque or black, WebGPU could show a stale color).
     * @param spriteSheet - Indexed sprite sheet.
     * @param srcRect - Source rectangle within the sprite sheet, in pixels.
     * @param destPos - Destination top-left in display coordinates (or where `params.pivot` lands), or (params
     *   form only) a Rect2i to stretch into.
     * @param paletteOffsetOrParams - Shift added to every stored pixel index before palette lookup (default
     *   0), or a {@link SpriteDrawParams} object.
     *
     * @example
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10));
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10), 16); // blue team
     *
     * const params: SpriteDrawParams = { flags: 0, pivot: undefined, scale: 1, paletteOffset: 0 }; // allocate once
     * params.flags = facingLeft ? BT.FLIP_H : 0;
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10), params);
     * params.scale = 2; // double size
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(10, 10), params);
     * params.scale = 1;
     * BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Rect2i(10, 40, 48, 12), params); // stretch
     */
    drawSprite: ((
        spriteSheet: SpriteSheet,
        srcRect: Rect2i,
        destPos: Vector2i | Rect2i,
        paletteOffsetOrParams?: number | SpriteDrawParams,
    ): void => {
        if (!drawReady('drawSprite')) {
            return;
        }

        try {
            if (spriteSheet instanceof Promise) {
                reportMissingAwait('SpriteSheet.load()');
                return;
            }

            // Dispatch reads argument 2, then argument 4: two typeof checks, no instanceof, no
            // allocation on the fast path. Later overloads slot into the non-object branch.
            if (typeof srcRect === 'object') {
                if (typeof paletteOffsetOrParams === 'object') {
                    BTAPI.instance.draw.drawSpriteWithParams(spriteSheet, srcRect, destPos, paletteOffsetOrParams);
                } else {
                    // Typed callers cannot reach here with a Rect2i; untyped ones hit BTAPI's dev-mode guard.
                    BTAPI.instance.draw.drawSprite(spriteSheet, srcRect, destPos as Vector2i, paletteOffsetOrParams);
                }

                return;
            }

            const srcType = typeof srcRect;
            throw new Error(
                srcType === 'string'
                    ? 'drawSprite does not accept a frame name yet; pass a Rect2i source rectangle'
                    : srcType === 'number'
                      ? 'drawSprite does not accept raw source numbers yet; pass a Rect2i source rectangle'
                      : `drawSprite expects a Rect2i source rectangle, got ${describeRuntimeType(srcRect)}`,
            );
        } catch (error) {
            reportDrawError(error);
        }
        // Object literals cannot declare overloads; the cast gives callers the typed forms. The
        // shipped fast path is declared first. gen-api-history.mjs unwraps the `as`.
    }) as {
        (spriteSheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset?: number): void;
        (spriteSheet: SpriteSheet, src: Rect2i, dest: Vector2i | Rect2i, params: SpriteDrawParams): void;
    },

    /**
     * Draws one tile from a sprite sheet laid out as a grid of equal cells.
     *
     * Three forms:
     *
     * - `BT.drawTile(sheet, index, destPos, paletteOffset?)` - row-major index into the sheet's grid.
     * - `BT.drawTile(sheet, col, row, destPos, paletteOffset?)` - column and row in the sheet's grid.
     * - `BT.drawTile(sheet, col, row, tileSize, destPos, paletteOffset?)` - tile size given here, for sheets with no
     *   grid. `tileSize` is a number for square tiles or a `Vector2i` for width x height.
     *
     * The first two need a grid on the sheet: `SpriteSheet.load(url, { tileSize: 16 })`,
     * `SpriteSheet.loadIndexed(url, palette, slot, { tileSize: 16 })`, or `sheet.tileSize = 16`. Tiles are whole
     * cells counted from the top-left; a partial cell at the right or bottom edge is not a tile, and a tile outside
     * the grid is an error. `paletteOffset` works exactly as in {@link BT.drawSprite}.
     *
     * Allocation-free: the engine reuses one internal source rectangle. To flip, rotate, or scale a tile, pass
     * `sheet.tileRect(...)` to `BT.drawSprite` with a {@link SpriteDrawParams} object instead.
     *
     * @since 1.8.0
     * @param spriteSheet - Indexized sprite sheet.
     * @param colOrIndex - Tile index (first form) or column (other forms).
     * @param rowOrDestPos - Destination position (first form) or row (other forms).
     * @param arg4 - Palette offset (first form), destination position (second form), or tile size (third form).
     * @param arg5 - Palette offset (second form) or destination position (third form).
     * @param arg6 - Palette offset (third form).
     *
     * @example
     * const sheet = await SpriteSheet.load('/sprites/hero.png', { tileSize: 16 });
     * // ...after sheet.indexize(palette):
     * BT.drawTile(sheet, frame, new Vector2i(40, 60)); // by index
     * BT.drawTile(sheet, 2, 1, new Vector2i(40, 60)); // by column and row
     * BT.drawTile(otherSheet, 2, 1, 8, new Vector2i(40, 60)); // explicit 8x8 tiles
     */
    drawTile: ((
        spriteSheet: SpriteSheet,
        colOrIndex: number,
        rowOrDestPos: number | Vector2i,
        arg4?: number | Vector2i,
        arg5?: number | Vector2i,
        arg6?: number,
    ): void => {
        if (!drawReady('drawTile')) {
            return;
        }

        try {
            if (spriteSheet instanceof Promise) {
                reportMissingAwait('SpriteSheet.load()');
                return;
            }

            // Each form accepts exactly its own argument shapes; anything else falls through to the
            // wrong-arguments error below rather than being coerced.
            if (isVectorArg(rowOrDestPos)) {
                // (sheet, index, destPos, paletteOffset?)
                if (!isVectorArg(arg4)) {
                    BTAPI.instance.draw.drawTile(spriteSheet, colOrIndex, undefined, rowOrDestPos, arg4);
                    return;
                }
            } else if (isVectorArg(arg5)) {
                // (sheet, col, row, tileSize, destPos, paletteOffset?)
                if (typeof arg4 === 'number' || isVectorArg(arg4)) {
                    const tileW = typeof arg4 === 'number' ? arg4 : arg4.x;
                    const tileH = typeof arg4 === 'number' ? arg4 : arg4.y;

                    BTAPI.instance.draw.drawTileSized(spriteSheet, colOrIndex, rowOrDestPos, tileW, tileH, arg5, arg6);
                    return;
                }
            } else if (isVectorArg(arg4)) {
                // (sheet, col, row, destPos, paletteOffset?)
                BTAPI.instance.draw.drawTile(spriteSheet, colOrIndex, rowOrDestPos, arg4, arg5);
                return;
            }

            const typeDetails = [colOrIndex, rowOrDestPos, arg4, arg5, arg6]
                .map(describeRuntimeType)
                .filter((part) => part !== 'undefined')
                .join(', ');
            showBeginnerRuntimeError(
                'drawTile expects (sheet, index, destPos), (sheet, col, row, destPos), or ' +
                    `(sheet, col, row, tileSize, destPos), each with an optional paletteOffset. Got: [sheet, ${typeDetails}]`,
                'Wrong drawTile Arguments',
            );
        } catch (error) {
            reportDrawError(error);
        }
        // Object literals cannot declare overloads; the cast gives callers the three typed forms.
        // gen-api-history.mjs unwraps the `as` and still classifies this member as a method.
    }) as {
        (spriteSheet: SpriteSheet, index: number, destPos: Vector2i, paletteOffset?: number): void;
        (spriteSheet: SpriteSheet, col: number, row: number, destPos: Vector2i, paletteOffset?: number): void;
        (
            spriteSheet: SpriteSheet,
            col: number,
            row: number,
            tileSize: number | Vector2i,
            destPos: Vector2i,
            paletteOffset?: number,
        ): void;
    },

    /**
     * Draws a nine-slice panel - a sprite region split into 4 corners, 4 edges, and a center - into any box.
     * Corners stay 1:1; edges and center stretch or tile as set on the {@link NineSlice}. A box smaller than
     * the corners crops them from their outer side, so a panel can animate open from size 0. `paletteOffset`
     * works exactly as in {@link BT.drawSprite}; there is no tint.
     *
     * Allocation-free: build the `NineSlice` once in `init()` and reuse it. Stretched parts follow the sprite
     * stretch rule, and both backends match pixel for pixel. Tiled parts draw one quad per tile, so tiling a
     * 1-pixel strip across a large box costs many quads - stretch flat fills instead.
     *
     * @since 1.8.0
     * @param nineSlice - Panel from `NineSlice.fromSheet(sheet, outer, inner, options?)`.
     * @param destRect - Box to fill; an empty or negative size draws nothing.
     * @param paletteOffset - Palette index offset applied at draw time (default 0).
     *
     * @example
     * // init()
     * this.panel = NineSlice.fromSheet(sheet, new Rect2i(0, 0, 16, 16), new Rect2i(4, 4, 8, 8), { edges: 'tile' });
     * // render()
     * BT.drawNineSlice(this.panel, new Rect2i(20, 20, 120, 64));
     */
    drawNineSlice: (nineSlice: NineSlice, destRect: Rect2i, paletteOffset: number = 0): void => {
        if (!drawReady('drawNineSlice')) {
            return;
        }

        try {
            BTAPI.instance.draw.drawNineSlice(nineSlice, destRect, paletteOffset);
        } catch (error) {
            reportDrawError(error);
        }
    },
};
