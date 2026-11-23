// @vitest-environment happy-dom

/**
 * Unit tests for the `BT` members defined in `src/bt/draw.ts`: clearing, primitives, system and bitmap text, sprites,
 * tiles, nine-slice.
 */

import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { withErrorContainer } from '../__test__/btFacadeFixtures';
import { NineSlice } from '../assets/NineSlice';
import type { BitmapFont, SpriteDrawParams } from '../BLIT386';
import { BT, Rect2i, SpriteSheet, Vector2i } from '../BLIT386';
import { BTAPI } from '../core/BTAPI';
import { DEFAULT_CONTAINER_ID } from '../utils/BootstrapHelpers';

describe('BT.clear', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.setClearColor', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'setClearColor').mockReturnValue(undefined);

        BT.clear(1);

        expect(spy).toHaveBeenCalledWith(1);
    });
});

describe('BT.clearRect', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.clearRect', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'clearRect').mockReturnValue(undefined);
        const rect = new Rect2i(0, 0, 100, 100);

        BT.clearRect(rect, 1);

        expect(spy).toHaveBeenCalledWith(rect, 1);
    });
});

describe('BT.drawPixel', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawPixel', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawPixel').mockReturnValue(undefined);
        const pos = new Vector2i(5, 10);

        BT.drawPixel(pos, 2);

        expect(spy).toHaveBeenCalledWith(pos, 2);
    });

    it('passes the same Vector2i through without copying it', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawPixel').mockReturnValue(undefined);
        const pos = new Vector2i(5, 10);

        BT.drawPixel(pos, 2);

        expect(spy.mock.calls[0]?.[0]).toBe(pos);
    });

    it('supports (x, y, color) arguments, routed through the XY fast path', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawPixelXY').mockReturnValue(undefined);

        BT.drawPixel(5, 10, 3);

        expect(spy).toHaveBeenCalledWith(5, 10, 3);
    });

    it('shows a beginner-friendly error when drawPixel arguments are invalid', async () => {
        await withErrorContainer(async () => {
            BT.drawPixel({} as never, 2 as never);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('drawPixel expects (x, y, paletteIndex) or (Vector2i, paletteIndex).');
        });
    });

    it('shows the beginner runtime error when the underlying draw call throws', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance.draw, 'drawPixel').mockImplementation(() => {
                throw new Error('boom');
            });

            BT.drawPixel(new Vector2i(5, 10), 2);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('boom');
        });
    });

    it('names the method in the not-ready message when called before bootstrap', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.drawPixel(new Vector2i(5, 10), 2);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("Can't use BT.drawPixel() yet");
        });
    });
});

describe('BT.drawLine', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawLine', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawLine').mockReturnValue(undefined);
        const p0 = new Vector2i(0, 0);
        const p1 = new Vector2i(50, 50);

        BT.drawLine(p0, p1, 3);

        expect(spy).toHaveBeenCalledWith(p0, p1, 3);
    });
});

describe('BT.drawRect', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawRect', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawRect').mockReturnValue(undefined);
        const rect = new Rect2i(10, 10, 40, 30);

        BT.drawRect(rect, 4);

        expect(spy).toHaveBeenCalledWith(rect, 4);
    });
});

describe('BT.drawRectFill', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawRectFill', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawRectFill').mockReturnValue(undefined);
        const rect = new Rect2i(0, 0, 20, 20);

        BT.drawRectFill(rect, 8);

        expect(spy).toHaveBeenCalledWith(rect, 8);
    });
});

describe('BT.systemPrint', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawSystemText', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawSystemText').mockReturnValue(undefined);
        const pos = new Vector2i(10, 10);

        BT.systemPrint(pos, 8, 'Hello');

        expect(spy).toHaveBeenCalledWith(pos, 8, 'Hello');
    });
});

describe('BT.systemPrintMeasure', () => {
    it('returns zero vector when system font is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getSystemFont').mockReturnValue(null);

        const result = BT.systemPrintMeasure('any text');

        expect(result.x).toBe(0);
        expect(result.y).toBe(0);
    });

    it('returns a mutable zero vector when system font is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getSystemFont').mockReturnValue(null);

        const result = BT.systemPrintMeasure('any text');

        expect(() => result.addInPlace(new Vector2i(1, 1))).not.toThrow();
        expect(result.x).toBe(1);
    });

    it('returns measured size when system font is available', () => {
        const mockFont = {
            measureTextSize: vi.fn().mockReturnValue({ width: 40, height: 8 }),
        };

        vi.spyOn(BTAPI.instance, 'getSystemFont').mockReturnValue(mockFont as unknown as BitmapFont);

        const result = BT.systemPrintMeasure('Hello');

        expect(result.x).toBe(40);
        expect(result.y).toBe(8);
        expect(mockFont.measureTextSize).toHaveBeenCalledWith('Hello');
    });
});

describe('BT.printFont', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawBitmapText', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawBitmapText').mockReturnValue(undefined);
        const font = {} as BitmapFont;
        const pos = new Vector2i(0, 0);
        const paletteOffset = 4;

        BT.printFont(font, pos, 'Hi', paletteOffset);

        expect(spy).toHaveBeenCalledWith(font, pos, 'Hi', paletteOffset);
    });

    it('forwards an undefined paletteOffset when omitted', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawBitmapText').mockReturnValue(undefined);
        const font = {} as BitmapFont;

        BT.printFont(font, new Vector2i(0, 0), 'Hi');

        expect(spy).toHaveBeenCalledWith(font, expect.anything(), 'Hi', undefined);
    });

    it('shows a missing await message for Promise font values', async () => {
        await withErrorContainer(async () => {
            BT.printFont(Promise.resolve({}) as unknown as BitmapFont, new Vector2i(0, 0), 'Hi');

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("Did you forget to use 'await' before BitmapFont.load()?");
        });
    });
});

describe('BT.drawSprite', () => {
    const mockImage = { width: 64, height: 64 } as HTMLImageElement;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawSprite', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawSprite').mockReturnValue(undefined);
        const sheet = new SpriteSheet(mockImage);
        const srcRect = new Rect2i(0, 0, 16, 16);
        const destPos = new Vector2i(10, 20);

        BT.drawSprite(sheet, srcRect, destPos);

        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith(sheet, srcRect, destPos, undefined);
    });

    it('forwards the paletteOffset argument', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawSprite').mockReturnValue(undefined);
        const sheet = new SpriteSheet(mockImage);
        const paletteOffset = 16;

        BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0), paletteOffset);

        expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), paletteOffset);
    });

    it('forwards undefined tint when omitted', () => {
        const spy = vi.spyOn(BTAPI.instance.draw, 'drawSprite').mockReturnValue(undefined);
        const sheet = new SpriteSheet(mockImage);

        BT.drawSprite(sheet, new Rect2i(0, 0, 8, 8), new Vector2i(0, 0));

        expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), undefined);
    });

    it('does not throw when called multiple times', () => {
        vi.spyOn(BTAPI.instance.draw, 'drawSprite').mockReturnValue(undefined);

        const sheet = new SpriteSheet(mockImage);

        expect(() => {
            BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
            BT.drawSprite(sheet, new Rect2i(16, 0, 16, 16), new Vector2i(20, 0));
        }).not.toThrow();
    });

    it('shows a missing await message for Promise sprite sheet values', async () => {
        await withErrorContainer(async () => {
            BT.drawSprite(Promise.resolve({}) as unknown as SpriteSheet, new Rect2i(0, 0, 8, 8), new Vector2i(0, 0), 0);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("Did you forget to use 'await' before SpriteSheet.load()?");
        });
    });

    it('routes an object 4th argument to the params path and a number to the fast path', () => {
        const fast = vi.spyOn(BTAPI.instance.draw, 'drawSprite').mockReturnValue(undefined);
        const withParams = vi.spyOn(BTAPI.instance.draw, 'drawSpriteWithParams').mockReturnValue(undefined);
        const sheet = new SpriteSheet(mockImage);
        const src = new Rect2i(0, 0, 16, 16);
        const dest = new Vector2i(1, 2);
        const params = { flags: BT.FLIP_H, paletteOffset: 0 };

        BT.drawSprite(sheet, src, dest, params);
        BT.drawSprite(sheet, src, dest, 3);

        expect(withParams).toHaveBeenCalledWith(sheet, src, dest, params);
        expect(fast).toHaveBeenCalledOnce();
        expect(fast).toHaveBeenCalledWith(sheet, src, dest, 3);
    });

    it('accepts a Rect2i destination and scale on the params form only', () => {
        const fast = vi.spyOn(BTAPI.instance.draw, 'drawSprite').mockReturnValue(undefined);
        const withParams = vi.spyOn(BTAPI.instance.draw, 'drawSpriteWithParams').mockReturnValue(undefined);
        const sheet = new SpriteSheet(mockImage);
        const src = new Rect2i(0, 0, 8, 8);
        const rect = new Rect2i(0, 0, 16, 16);
        const point = new Vector2i(1, 2);

        BT.drawSprite(sheet, src, rect, {});
        BT.drawSprite(sheet, src, point, { scale: 2 });
        BT.drawSprite(sheet, src, point, { scale: new Vector2i(2, 1), flags: BT.ROT_90_CW });

        expect(withParams).toHaveBeenCalledTimes(3);
        expect(withParams).toHaveBeenNthCalledWith(1, sheet, src, rect, {});
        expect(fast).not.toHaveBeenCalled();

        if (Math.random() > 2) {
            // Type-only: never runs. A Rect2i without params would be a silent unscaled draw.
            // @ts-expect-error - overload 1 only takes a Vector2i destination.
            BT.drawSprite(sheet, src, rect);
            // @ts-expect-error - a number 4th argument is overload 1, which only takes a Vector2i.
            BT.drawSprite(sheet, src, rect, 0);
        }
    });

    it('sends null params to the params path, which rejects them', async () => {
        await withErrorContainer(async () => {
            const fast = vi.spyOn(BTAPI.instance.draw, 'drawSprite').mockReturnValue(undefined);

            BT.drawSprite(
                new SpriteSheet(mockImage),
                new Rect2i(0, 0, 8, 8),
                new Vector2i(0, 0),
                null as unknown as SpriteDrawParams,
            );

            expect(fast).not.toHaveBeenCalled();
            expect(document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '').toContain('got null');
        });
    });

    it.each([
        ['frame name', 'hero-idle'],
        ['raw source numbers', 0],
    ])('rejects a %s source until that overload ships', async (label, src) => {
        await withErrorContainer(async () => {
            const fast = vi.spyOn(BTAPI.instance.draw, 'drawSprite').mockReturnValue(undefined);

            BT.drawSprite(new SpriteSheet(mockImage), src as unknown as Rect2i, new Vector2i(0, 0));

            expect(fast).not.toHaveBeenCalled();
            expect(document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '').toContain(label);
        });
    });

    it('shows engine-not-ready message when drawing before bootstrap completes', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.drawSprite(new SpriteSheet(mockImage), new Rect2i(0, 0, 8, 8), new Vector2i(0, 0), 0);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("The engine isn't ready yet.");
        });
    });
});

describe('BT.drawTile', () => {
    // 64x48 sheet: 16x24 tiles give 4 columns x 2 rows.
    const mockImage = { width: 64, height: 48 } as HTMLImageElement;
    const dest = new Vector2i(10, 20);

    /** Source rects as they were at call time - drawTile reuses one scratch rect. */
    let captured: number[][];
    let drawSpriteSpy: MockInstance<BTAPI['draw']['drawSprite']>;

    function gridSheet(): SpriteSheet {
        const sheet = new SpriteSheet(mockImage);
        sheet.tileSize = new Vector2i(16, 24);

        return sheet;
    }

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
        captured = [];
        drawSpriteSpy = vi
            .spyOn(BTAPI.instance.draw, 'drawSprite')
            .mockImplementation((_sheet: SpriteSheet, srcRect: Rect2i) => {
                captured.push([srcRect.x, srcRect.y, srcRect.width, srcRect.height]);
            });
    });

    it('draws by row-major index using the sheet grid', () => {
        const sheet = gridSheet();

        BT.drawTile(sheet, 5, dest);

        expect(captured).toEqual([[16, 24, 16, 24]]);
        expect(drawSpriteSpy).toHaveBeenCalledWith(sheet, expect.any(Rect2i), dest, 0);
    });

    it('draws by column and row using the sheet grid', () => {
        BT.drawTile(gridSheet(), 3, 1, dest);

        expect(captured).toEqual([[48, 24, 16, 24]]);
    });

    it('draws with an explicit number tile size on a sheet with no grid', () => {
        BT.drawTile(new SpriteSheet(mockImage), 2, 1, 16, dest);

        expect(captured).toEqual([[32, 16, 16, 16]]);
    });

    it('tells (col, row, Vector2i size, dest) apart from (col, row, dest, paletteOffset)', () => {
        const sheet = gridSheet();

        BT.drawTile(sheet, 1, 0, new Vector2i(32, 24), dest);
        BT.drawTile(sheet, 1, 0, dest, 7);

        expect(captured).toEqual([
            [32, 0, 32, 24],
            [16, 0, 16, 24],
        ]);
        expect(drawSpriteSpy).toHaveBeenNthCalledWith(1, sheet, expect.any(Rect2i), dest, 0);
        expect(drawSpriteSpy).toHaveBeenNthCalledWith(2, sheet, expect.any(Rect2i), dest, 7);
    });

    it('forwards paletteOffset in all three forms', () => {
        const sheet = gridSheet();

        BT.drawTile(sheet, 5, dest, 16);
        BT.drawTile(sheet, 1, 1, dest, 17);
        BT.drawTile(sheet, 1, 1, 16, dest, 18);

        expect(drawSpriteSpy.mock.calls.map((call) => call[3])).toEqual([16, 17, 18]);
    });

    it('passes the same scratch Rect2i on every call (no per-draw allocation)', () => {
        const sheet = gridSheet();

        BT.drawTile(sheet, 0, dest);
        BT.drawTile(sheet, 1, 1, dest);
        BT.drawTile(sheet, 0, 0, 8, dest);

        const rects = drawSpriteSpy.mock.calls.map((call) => call[1]);
        expect(rects[0]).toBe(rects[1]);
        expect(rects[1]).toBe(rects[2]);
    });

    it('shows the grid-missing message, naming the explicit-size form, on a sheet with no grid', async () => {
        await withErrorContainer(async () => {
            // Explicit-size call with destPos forgotten: lands in the sheet-grid form.
            BT.drawTile(new SpriteSheet(mockImage), 1, 0, new Vector2i(16, 16));

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('no tile size');
            expect(text).toContain('BT.drawTile(sheet, col, row, tileSize, destPos)');
        });
        expect(drawSpriteSpy).not.toHaveBeenCalled();
    });

    it('rejects a NaN column from untyped callers instead of drawing', async () => {
        await withErrorContainer(async () => {
            BT.drawTile(gridSheet(), Number.NaN, 0, dest);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('Tile column must be a whole number');
        });
        expect(drawSpriteSpy).not.toHaveBeenCalled();
    });

    it('reports an out-of-grid tile', async () => {
        await withErrorContainer(async () => {
            BT.drawTile(gridSheet(), 8, dest);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('outside this sheet');
        });
    });

    it('reports wrong arguments when no destPos is given', async () => {
        await withErrorContainer(async () => {
            // @ts-expect-error -- untyped JS callers can omit destPos
            BT.drawTile(gridSheet(), 1, 1);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('drawTile expects');
        });
    });

    it('rejects a non-number paletteOffset in the index form instead of dropping it', async () => {
        await withErrorContainer(async () => {
            // @ts-expect-error -- untyped JS callers can mix up the forms
            BT.drawTile(gridSheet(), 1, new Vector2i(16, 16), dest);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('drawTile expects');
        });
        expect(drawSpriteSpy).not.toHaveBeenCalled();
    });

    it('rejects a missing tile size in the explicit-size form', async () => {
        await withErrorContainer(async () => {
            // @ts-expect-error -- untyped JS callers can pass undefined for tileSize
            BT.drawTile(new SpriteSheet(mockImage), 1, 0, undefined, dest);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('drawTile expects');
        });
        expect(drawSpriteSpy).not.toHaveBeenCalled();
    });

    it('rejects null object arguments with the wrong-arguments error, not a raw TypeError', async () => {
        await withErrorContainer(async () => {
            // @ts-expect-error -- untyped JS callers can pass null for tileSize
            BT.drawTile(new SpriteSheet(mockImage), 1, 0, null, dest);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('drawTile expects');
            expect(text).not.toContain('Cannot read properties of null');
        });
        await withErrorContainer(async () => {
            // @ts-expect-error -- untyped JS callers can pass null for destPos
            BT.drawTile(gridSheet(), 1, 1, null);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('drawTile expects');
        });
        expect(drawSpriteSpy).not.toHaveBeenCalled();
    });

    it('shows engine-not-ready message when drawing before bootstrap completes', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.drawTile(gridSheet(), 0, dest);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("The engine isn't ready yet.");
        });
        expect(drawSpriteSpy).not.toHaveBeenCalled();
    });

    it('shows a missing await message for Promise sprite sheet values', async () => {
        await withErrorContainer(async () => {
            BT.drawTile(Promise.resolve({}) as unknown as SpriteSheet, 0, dest);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("Did you forget to use 'await' before SpriteSheet.load()?");
        });
    });
});

describe('BT.drawNineSlice', () => {
    let drawNineSliceSpy: MockInstance<BTAPI['draw']['drawNineSlice']>;

    function makeSlice(): NineSlice {
        const sheet = SpriteSheet.fromIndexedPixels(16, 16, new Uint8Array(256) as Uint8Array<ArrayBuffer>);

        return NineSlice.fromSheet(sheet, new Rect2i(0, 0, 16, 16), new Rect2i(4, 4, 8, 8));
    }

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
        drawNineSliceSpy = vi.spyOn(BTAPI.instance.draw, 'drawNineSlice').mockImplementation(() => {});
    });

    it('forwards the nine-slice, box, and paletteOffset', () => {
        const slice = makeSlice();
        const box = new Rect2i(10, 20, 64, 32);

        BT.drawNineSlice(slice, box);
        BT.drawNineSlice(slice, box, 7);

        expect(drawNineSliceSpy).toHaveBeenNthCalledWith(1, slice, box, 0);
        expect(drawNineSliceSpy).toHaveBeenNthCalledWith(2, slice, box, 7);
    });

    it('shows the error instead of throwing when BTAPI rejects the call', async () => {
        drawNineSliceSpy.mockImplementation(() => {
            throw new Error(
                'drawNineSlice expects a NineSlice; build one with NineSlice.fromSheet(sheet, outer, inner)',
            );
        });

        await withErrorContainer(async () => {
            expect(() => BT.drawNineSlice({} as NineSlice, new Rect2i(0, 0, 8, 8))).not.toThrow();

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('NineSlice.fromSheet');
        });
    });

    it('reports the engine as not ready and draws nothing before init', () => {
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

        expect(() => BT.drawNineSlice(makeSlice(), new Rect2i(0, 0, 8, 8))).not.toThrow();
        expect(drawNineSliceSpy).not.toHaveBeenCalled();
    });
});
