/**
 * Unit tests for which sprite sheets {@link BTAPI.spritesRefresh} re-maps.
 *
 * A sheet is tracked from the moment it is indexized until it is destroyed,
 * whether or not it has ever been drawn (BT-726).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Palette } from '../assets/Palette';
import { getIndexedSheets, SpriteSheet } from '../assets/SpriteSheet';
import { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { BTAPI } from './BTAPI';

const RED = new Color32(255, 0, 0);
const GREEN = new Color32(0, 255, 0);

/** Sheets created by a test, destroyed afterwards so they leave the module-level registry. */
const created: SpriteSheet[] = [];

/**
 * Builds a 1x1 sheet of one opaque color and indexizes it against `palette`.
 *
 * @param color - The sheet's only pixel.
 * @param palette - Palette to indexize against.
 * @returns The indexized sheet.
 */
function indexedSheet(color: Color32, palette: Palette): SpriteSheet {
    const pixels = new Uint8ClampedArray([color.r, color.g, color.b, 255]);

    vi.stubGlobal(
        'OffscreenCanvas',
        class {
            getContext() {
                return { drawImage: () => {}, imageSmoothingEnabled: false, getImageData: () => ({ data: pixels }) };
            }
        },
    );

    const sheet = new SpriteSheet({ width: 1, height: 1 } as HTMLImageElement);

    sheet.indexize(palette);
    created.push(sheet);

    return sheet;
}

/**
 * Builds a palette with `first` at slot 1 and `second` at slot 2.
 *
 * @param first - Color for slot 1.
 * @param second - Color for slot 2.
 * @returns The palette.
 */
function twoColorPalette(first: Color32, second: Color32): Palette {
    const palette = new Palette(16);

    palette.set(1, first);
    palette.set(2, second);

    return palette;
}

describe('BTAPI.spritesRefresh tracking', () => {
    beforeEach(() => {
        (BTAPI as unknown as { _instance: BTAPI | null })._instance = null;
    });

    afterEach(() => {
        for (const sheet of created.splice(0)) {
            sheet.destroy();
        }

        (BTAPI as unknown as { _instance: BTAPI | null })._instance = null;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('re-maps an indexized sheet that was never drawn', () => {
        const before = twoColorPalette(RED, GREEN);
        const drawn = indexedSheet(RED, before);
        const idle = indexedSheet(GREEN, before);

        BTAPI.instance.setPalette(before);
        BTAPI.instance.drawSprite(drawn, new Rect2i(0, 0, 1, 1), new Vector2i(0, 0));

        // Same colors, swapped slots.
        BTAPI.instance.setPalette(twoColorPalette(GREEN, RED));
        BTAPI.instance.spritesRefresh();

        expect(drawn.getIndexedPixels()[0]).toBe(2);
        expect(idle.getIndexedPixels()[0]).toBe(1);
    });

    it('forgets a sheet once it is destroyed', () => {
        const sheet = indexedSheet(RED, twoColorPalette(RED, GREEN));

        expect(getIndexedSheets()).toContain(sheet);

        sheet.destroy();

        expect(getIndexedSheets()).not.toContain(sheet);
    });

    it('registers a sheet once, however often it is indexized', () => {
        const palette = twoColorPalette(RED, GREEN);
        const sheet = indexedSheet(RED, palette);

        sheet.indexize(palette);

        expect(getIndexedSheets().filter((s) => s === sheet)).toHaveLength(1);
    });

    it('does not track a sheet just because it was drawn', () => {
        const palette = new Palette(16);
        const reindexize = vi.fn();
        const mockSheet = { isIndexed: () => true, reindexize } as unknown as SpriteSheet;

        BTAPI.instance.setPalette(palette);
        BTAPI.instance.drawSprite(mockSheet, new Rect2i(0, 0, 1, 1), new Vector2i(0, 0));
        BTAPI.instance.spritesRefresh();

        expect(reindexize).not.toHaveBeenCalled();
    });

    it('keeps a sheet whose colors are missing and re-maps it on a later refresh', () => {
        const sheet = indexedSheet(RED, twoColorPalette(RED, GREEN));

        vi.spyOn(console, 'error').mockImplementation(() => {});
        BTAPI.instance.setPalette(twoColorPalette(GREEN, GREEN));
        BTAPI.instance.spritesRefresh();

        expect(sheet.getIndexedPixels()[0]).toBe(1);

        BTAPI.instance.setPalette(twoColorPalette(GREEN, RED));
        BTAPI.instance.spritesRefresh();

        expect(sheet.getIndexedPixels()[0]).toBe(2);
    });
});
