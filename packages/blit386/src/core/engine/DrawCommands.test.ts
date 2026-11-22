/**
 * Unit tests for `src/core/engine/DrawCommands.ts`, driven through `BTAPI`: palette usage tracking, drawNineSlice, and
 * palette index assertions.
 */

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { makeMockCanvas, resetSingleton } from '../../__test__/btapiFixtures';
import { installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../../__test__/webgpu-mock';
import type { BitmapFont } from '../../assets/BitmapFont';
import { NineSlice } from '../../assets/NineSlice';
import { Palette } from '../../assets/Palette';
import { SpriteSheet } from '../../assets/SpriteSheet';
import type { OverlayDrawTarget } from '../../overlay';
import { DEFAULT_IDX_TEXT, Overlay, paletteBandY } from '../../overlay';
import { OVERLAY_EDGE_MARGIN_PX } from '../../overlay/layout/constants';
import {
    computeGrid,
    DEFAULT_PALETTE_SWATCH_SIZE,
    PALETTE_GRID_PADDING_PX,
    PALETTE_SWATCH_GAP_PX,
} from '../../overlay/palette/PaletteView';
import type { SpriteDrawParams } from '../../render/SpriteOrientation';
import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import { BTAPI } from '../BTAPI';
import type { IBTDemo } from '../IBTDemo';
import { collectUsedIndices } from '../RenderPaletteUsage';

describe('BTAPI', () => {
    beforeEach(() => {
        resetSingleton();

        vi.resetAllMocks();
        vi.stubGlobal('requestAnimationFrame', vi.fn());
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        installMockNavigatorGPU();
    });

    afterEach(() => {
        resetSingleton();

        uninstallMockNavigatorGPU();

        vi.unstubAllGlobals();
    });

    describe('palette usage tracking', () => {
        function getOverlay(): Overlay | null {
            return (BTAPI.instance as unknown as { overlay: Overlay | null }).overlay;
        }

        function makeIndexizedSpriteSheet(markSpy: ReturnType<typeof vi.fn>): SpriteSheet {
            return {
                isIndexed: () => true,
                markPaletteIndicesInRect: markSpy,
            } as unknown as SpriteSheet;
        }

        function stubRendererDrawCalls(): void {
            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            vi.spyOn(renderer as NonNullable<typeof renderer>, 'drawSprite').mockImplementation(() => {});
            vi.spyOn(renderer as NonNullable<typeof renderer>, 'drawBitmapText').mockImplementation(() => {});
        }

        it('skips sprite and bitmap-text palette scans when isOverlayPaletteEnabled is false', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const mockFont = { getSpriteSheet: () => mockSheet } as unknown as BitmapFont;
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();

            BTAPI.instance.draw.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
            BTAPI.instance.draw.drawBitmapText(mockFont, new Vector2i(0, 0), 'ab');

            expect(markSpy).not.toHaveBeenCalled();
        });

        it('scans sprite and bitmap-text palette usage when isOverlayPaletteEnabled is true and overlay body is visible', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const mockFont = {
                getSpriteSheet: () => mockSheet,
                getGlyph: () => ({ rect: new Rect2i(0, 0, 8, 8) }),
            } as unknown as BitmapFont;
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();

            BTAPI.instance.draw.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
            BTAPI.instance.draw.drawBitmapText(mockFont, new Vector2i(0, 0), 'a');

            expect(markSpy).toHaveBeenCalledTimes(2);
        });

        it('routes params draws by orientation and still scans palette usage', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();
            const renderer = BTAPI.instance.getRenderer() as NonNullable<ReturnType<typeof BTAPI.instance.getRenderer>>;
            const orientedSpy = vi.spyOn(renderer, 'drawSpriteOriented').mockImplementation(() => {});
            const src = new Rect2i(0, 0, 16, 32);
            const dest = new Vector2i(5, 6);
            const params = { flags: 4 | 1, paletteOffset: 3 };

            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, dest, params);
            params.flags = 0;

            expect(orientedSpy).toHaveBeenCalledWith(mockSheet, src, dest, 3, 5);
            expect(renderer.drawSprite).not.toHaveBeenCalled();
            expect(markSpy).toHaveBeenCalledWith(src, 3, expect.anything());

            // Identity spellings (no flags, or ROT_180_CW | FLIP_H | FLIP_V) take the plain drawSprite path.
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, dest, {});
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, dest, { flags: 8 | 1 | 2, paletteOffset: 4 });

            expect(renderer.drawSprite).toHaveBeenNthCalledWith(1, mockSheet, src, dest, 0);
            expect(renderer.drawSprite).toHaveBeenNthCalledWith(2, mockSheet, src, dest, 4);
            expect(orientedSpy).toHaveBeenCalledOnce();
        });

        it('routes scaled and Rect2i draws to drawSpriteStretched and skips empty boxes', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();
            const renderer = BTAPI.instance.getRenderer() as NonNullable<ReturnType<typeof BTAPI.instance.getRenderer>>;
            const stretchedSpy = vi.spyOn(renderer, 'drawSpriteStretched').mockImplementation(() => {});
            const src = new Rect2i(0, 0, 16, 32);
            // One reused params object for both destination kinds, as the docs recommend.
            const params: SpriteDrawParams = { flags: 4, scale: new Vector2i(3, 2), paletteOffset: 1 };

            // ROT_90_CW: footprint 32x16, times (3, 2) in screen axes = 96x32.
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, new Vector2i(5, 6), params);
            expect(stretchedSpy).toHaveBeenLastCalledWith(mockSheet, src, 5, 6, 96, 32, 1, 4);

            params.scale = 1;
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, new Rect2i(1, 2, 30, 50), params);
            expect(stretchedSpy).toHaveBeenLastCalledWith(mockSheet, src, 1, 2, 30, 50, 1, 4);

            // Neutral scale on a point keeps the plain path (flags 0 -> drawSprite).
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, new Vector2i(0, 0), { scale: 1 });
            expect(renderer.drawSprite).toHaveBeenCalledWith(mockSheet, src, new Vector2i(0, 0), 0);
            expect(stretchedSpy).toHaveBeenCalledTimes(2);

            // Empty boxes draw nothing and do not throw.
            markSpy.mockClear();
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, new Rect2i(0, 0, 0, 10), {});
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, new Rect2i(0, 0, 10, -3), {});
            expect(stretchedSpy).toHaveBeenCalledTimes(2);
            expect(markSpy).not.toHaveBeenCalled();
        });

        it('draws nothing for an empty source rect with a Rect2i destination', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();
            const renderer = BTAPI.instance.getRenderer() as NonNullable<ReturnType<typeof BTAPI.instance.getRenderer>>;
            const stretchedSpy = vi.spyOn(renderer, 'drawSpriteStretched').mockImplementation(() => {});
            const dest = new Rect2i(0, 0, 20, 20);

            expect(() => {
                BTAPI.instance.draw.drawSpriteWithParams(mockSheet, new Rect2i(0, 0, 0, 8), dest, {});
                BTAPI.instance.draw.drawSpriteWithParams(mockSheet, new Rect2i(0, 0, 8, 0), dest, {});
            }).not.toThrow();
            expect(stretchedSpy).not.toHaveBeenCalled();
        });

        it('truncates a fractional or NaN Rect2i destination like the constructor', async () => {
            const mockSheet = makeIndexizedSpriteSheet(vi.fn());
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();
            const renderer = BTAPI.instance.getRenderer() as NonNullable<ReturnType<typeof BTAPI.instance.getRenderer>>;
            const stretchedSpy = vi.spyOn(renderer, 'drawSpriteStretched').mockImplementation(() => {});
            const src = new Rect2i(0, 0, 8, 8);
            const dest = new Rect2i(1, 2, 10, 10);

            // Public mutable fields can hold fractions or NaN after construction.
            dest.x = 1.9;
            dest.width = 10.7;
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, dest, {});
            expect(stretchedSpy).toHaveBeenLastCalledWith(mockSheet, src, 1, 2, 10, 10, 0, 0);

            dest.width = Number.NaN;
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, dest, {});
            expect(stretchedSpy).toHaveBeenCalledTimes(1);

            // A scaled Vector2i dest has the same public mutable fields and is truncated the same way.
            const point = new Vector2i(3, 4);
            point.x = 3.6;
            point.y = 4.2;
            BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, point, { scale: 2 });
            expect(stretchedSpy).toHaveBeenLastCalledWith(mockSheet, src, 3, 4, 16, 16, 0, 0);
        });

        describe('pivot', () => {
            // Doc table point maps for the 3x2 source, keyed by shortest flags; an independent oracle.
            const SW = 3;
            const SH = 2;
            const ORIENTATIONS: ReadonlyArray<readonly [number, (x: number, y: number) => [number, number]]> = [
                [0, (x, y) => [x, y]],
                [1, (x, y) => [SW - x, y]],
                [2, (x, y) => [x, SH - y]],
                [8, (x, y) => [SW - x, SH - y]],
                [4, (x, y) => [SH - y, x]],
                [4 | 1, (x, y) => [SH - y, SW - x]],
                [4 | 2, (x, y) => [y, x]],
                [16, (x, y) => [y, SW - x]],
            ];
            const PIVOTS = [
                [0, 0],
                [SW, SH],
                [1, 1],
                [-2, 5],
            ] as const;
            const cases = ORIENTATIONS.flatMap(([flags], i) =>
                PIVOTS.flatMap(([px, py]) => [1, 2].map((scale) => [flags, px, py, scale, i] as const)),
            );

            async function setup() {
                const mockSheet = makeIndexizedSpriteSheet(vi.fn());
                const demo: IBTDemo = {
                    configure: () => ({ isSplashEnabled: false, displaySize: new Vector2i(320, 240), targetFPS: 60 }),
                    init: vi.fn().mockResolvedValue(true),
                    update: vi.fn(),
                    render: vi.fn(),
                };

                await BTAPI.instance.init(demo, makeMockCanvas());
                BTAPI.instance.palettes.setPalette(new Palette(16));
                stubRendererDrawCalls();
                const renderer = BTAPI.instance.getRenderer() as NonNullable<
                    ReturnType<typeof BTAPI.instance.getRenderer>
                >;
                const oriented = vi.spyOn(renderer, 'drawSpriteOriented').mockImplementation(() => {});
                const stretched = vi.spyOn(renderer, 'drawSpriteStretched').mockImplementation(() => {});

                /** Top-left corner the renderer received for the one draw since the last read. */
                const lastCorner = (): [number, number] => {
                    const plain = vi.mocked(renderer.drawSprite).mock.lastCall?.[2];
                    const turned = oriented.mock.lastCall?.[2];
                    const scaled = stretched.mock.lastCall;
                    vi.mocked(renderer.drawSprite).mockClear();
                    oriented.mockClear();
                    stretched.mockClear();

                    const point = plain ?? turned;
                    return point ? [point.x, point.y] : [scaled?.[2] ?? Number.NaN, scaled?.[3] ?? Number.NaN];
                };

                return { mockSheet, renderer, stretched, lastCorner };
            }

            it.each(cases)(
                'flags %i, pivot (%i, %i), scale %i puts the mapped pivot on dest',
                async (flags, px, py, scale, row) => {
                    const { mockSheet, lastCorner } = await setup();
                    const [mx, my] = ORIENTATIONS.at(row)?.[1](px, py) ?? [Number.NaN, Number.NaN];

                    BTAPI.instance.draw.drawSpriteWithParams(
                        mockSheet,
                        new Rect2i(4, 4, SW, SH),
                        new Vector2i(50, 60),
                        {
                            flags,
                            pivot: new Vector2i(px, py),
                            scale,
                        },
                    );

                    expect(lastCorner()).toEqual([50 - mx * scale, 60 - my * scale]);
                },
            );

            it('scales the mapped pivot per screen axis', async () => {
                const { mockSheet, stretched } = await setup();
                const src = new Rect2i(0, 0, SW, SH);

                // ROT_90_CW maps (1, 0) to (2, 1); footprint 2x3 times (3, 2) = 6x6.
                BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, new Vector2i(20, 20), {
                    flags: 4,
                    pivot: new Vector2i(1, 0),
                    scale: new Vector2i(3, 2),
                });
                expect(stretched).toHaveBeenLastCalledWith(mockSheet, src, 14, 18, 6, 6, 0, 4);
            });

            it('treats an explicit (0, 0) differently from no pivot once flipped', async () => {
                const { mockSheet, lastCorner } = await setup();
                const src = new Rect2i(0, 0, SW, SH);
                const dest = new Vector2i(10, 10);
                const params: SpriteDrawParams = { flags: 1, pivot: new Vector2i(0, 0), scale: 1, paletteOffset: 0 };

                BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, dest, params);
                expect(lastCorner()).toEqual([7, 10]);

                params.pivot = undefined;
                BTAPI.instance.draw.drawSpriteWithParams(mockSheet, src, dest, params);
                expect(lastCorner()).toEqual([10, 10]);
            });

            it('copies the corner instead of passing the caller dest or pivot on', async () => {
                const { mockSheet, renderer } = await setup();
                const dest = new Vector2i(10, 10);
                const pivot = new Vector2i(1, 1);

                BTAPI.instance.draw.drawSpriteWithParams(mockSheet, new Rect2i(0, 0, SW, SH), dest, { pivot });
                const passed = vi.mocked(renderer.drawSprite).mock.calls[0]?.[2];

                expect(passed).not.toBe(dest);
                expect(passed).not.toBe(pivot);
                expect([dest.x, dest.y, pivot.x, pivot.y]).toEqual([10, 10, 1, 1]);
            });

            it('throws for a pivot with a Rect2i destination, even at scale 1', async () => {
                const { mockSheet } = await setup();

                expect(() =>
                    BTAPI.instance.draw.drawSpriteWithParams(
                        mockSheet,
                        new Rect2i(0, 0, SW, SH),
                        new Rect2i(0, 0, 8, 8),
                        {
                            pivot: new Vector2i(0, 0),
                            scale: 1,
                        },
                    ),
                ).toThrow('takes no pivot');
            });

            it.each([
                ['a plain object', { x: 1, y: 1 }],
                ['null', null],
            ])('throws for %s as pivot', async (_label, pivot) => {
                const { mockSheet } = await setup();

                expect(() =>
                    BTAPI.instance.draw.drawSpriteWithParams(mockSheet, new Rect2i(0, 0, SW, SH), new Vector2i(0, 0), {
                        pivot: pivot as unknown as Vector2i,
                    }),
                ).toThrow('pivot');
            });
        });

        describe('fast-path Rect2i guard', () => {
            const guardDemo = (): IBTDemo => ({
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            });

            afterEach(() => {
                Reflect.deleteProperty(globalThis, '__BLIT386_DEV__');
            });

            it('throws in dev mode and points at a params object', async () => {
                globalThis.__BLIT386_DEV__ = true;
                await BTAPI.instance.init(guardDemo(), makeMockCanvas());
                stubRendererDrawCalls();

                expect(() =>
                    BTAPI.instance.draw.drawSprite(
                        makeIndexizedSpriteSheet(vi.fn()),
                        new Rect2i(0, 0, 8, 8),
                        new Rect2i(0, 0, 16, 16) as unknown as Vector2i,
                    ),
                ).toThrow('needs a params object');
            });

            it('does not check in release mode', async () => {
                Reflect.deleteProperty(globalThis, '__BLIT386_DEV__');
                await BTAPI.instance.init(guardDemo(), makeMockCanvas());
                stubRendererDrawCalls();

                expect(() =>
                    BTAPI.instance.draw.drawSprite(
                        makeIndexizedSpriteSheet(vi.fn()),
                        new Rect2i(0, 0, 8, 8),
                        new Rect2i(0, 0, 16, 16) as unknown as Vector2i,
                    ),
                ).not.toThrow();
            });
        });

        it('skips palette scans when the palette grid is enabled but the overlay body is hidden', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();

            const overlay = getOverlay();
            expect(overlay).not.toBeNull();
            expect(overlay?.isBodyVisible).toBe(false);
            expect(overlay?.isTrackingPaletteUsage).toBe(false);

            BTAPI.instance.draw.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));

            expect(markSpy).not.toHaveBeenCalled();
        });

        it('skips palette scans when the overlay body is hidden even if the toggle hint is visible', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayToggleHintVisible: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();

            const overlay = getOverlay();
            expect(overlay).not.toBeNull();
            expect(overlay?.isBodyVisible).toBe(false);
            expect(overlay?.isTrackingPaletteUsage).toBe(false);

            BTAPI.instance.draw.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));

            expect(markSpy).not.toHaveBeenCalled();
        });

        it('wires demo render palette usage through the game loop into overlay grid swatches', async () => {
            const overlaySpy = vi.spyOn(Overlay.prototype, 'updateAndRender');
            const rafCallbacks: FrameRequestCallback[] = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);
                    return rafCallbacks.length;
                }),
            );

            const palette = Palette.cga();
            const usedSlots = [5, 6] as const;
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(() => {
                    BTAPI.instance.draw.drawPixel(new Vector2i(4, 4), usedSlots[0]);
                    BTAPI.instance.draw.drawPixel(new Vector2i(5, 5), usedSlots[1]);
                }),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(palette);

            const renderer = BTAPI.instance.getRenderer();
            expect(renderer).not.toBeNull();

            const swatchFills: { index: number; rect: Rect2i }[] = [];

            vi.spyOn(renderer as NonNullable<typeof renderer> & OverlayDrawTarget, 'drawBarFill').mockImplementation(
                (rect: Rect2i, index: number) => {
                    swatchFills.push({ index, rect: new Rect2i(rect.x, rect.y, rect.width, rect.height) });
                },
            );

            const maxIterations = 1000;
            let iterations = 0;

            while (rafCallbacks.length > 0) {
                iterations++;
                if (iterations > maxIterations) {
                    throw new Error('Exceeded max rAF callback drain iterations before overlay render.');
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16);
                }

                if (overlaySpy.mock.calls.length > 0) {
                    break;
                }
            }

            expect(demo.render).toHaveBeenCalled();
            expect(overlaySpy).toHaveBeenCalled();

            const lastCall = overlaySpy.mock.calls.at(-1);
            const usedMask = lastCall?.[8] as Uint8Array | undefined;
            const maskScratch: number[] = [];

            expect(usedMask).toBeDefined();
            expect(collectUsedIndices(usedMask as Uint8Array, palette.size, maskScratch)).toEqual([5, 6]);

            const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, palette.size, PALETTE_SWATCH_GAP_PX);
            const paletteBandTop = paletteBandY(240, grid.totalHeight);
            const { cols, swatchSize, gap } = grid;

            for (const slot of usedSlots) {
                const col = slot % cols;
                const row = Math.floor(slot / cols);
                const x = OVERLAY_EDGE_MARGIN_PX + col * (swatchSize + gap);
                const y = paletteBandTop + PALETTE_GRID_PADDING_PX + row * (swatchSize + gap);

                expect(
                    swatchFills.some(
                        (fill) =>
                            fill.index === slot &&
                            fill.rect.x === x &&
                            fill.rect.y === y &&
                            fill.rect.width === swatchSize &&
                            fill.rect.height === swatchSize,
                    ),
                ).toBe(true);
            }

            const unusedSlot = 3;
            const unusedCol = unusedSlot % cols;
            const unusedRow = Math.floor(unusedSlot / cols);
            const unusedX = OVERLAY_EDGE_MARGIN_PX + unusedCol * (swatchSize + gap);
            const unusedY = paletteBandTop + PALETTE_GRID_PADDING_PX + unusedRow * (swatchSize + gap);

            expect(
                swatchFills.some(
                    (fill) =>
                        fill.index === DEFAULT_IDX_TEXT &&
                        fill.rect.x === unusedX + 2 &&
                        fill.rect.y === unusedY + 2 &&
                        fill.rect.width === 3 &&
                        fill.rect.height === 3,
                ),
            ).toBe(true);
            expect(
                swatchFills.some(
                    (fill) =>
                        fill.index === unusedSlot &&
                        fill.rect.x === unusedX &&
                        fill.rect.y === unusedY &&
                        fill.rect.width === swatchSize,
                ),
            ).toBe(false);
        });

        it('drawSystemText marks only the text palette index and does not scan glyph rects', async () => {
            const glyphScanSpy = vi.fn();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();

            const systemFont = BTAPI.instance.getSystemFont();
            expect(systemFont).not.toBeNull();
            if (!systemFont) {
                return;
            }

            vi.spyOn(systemFont.getSpriteSheet(), 'markPaletteIndicesInRect').mockImplementation(glyphScanSpy);

            const textPaletteIndex = 8;

            BTAPI.instance.draw.drawSystemText(new Vector2i(0, 0), textPaletteIndex, 'hello');

            expect(glyphScanSpy).not.toHaveBeenCalled();

            const usageMask = (BTAPI.instance as unknown as { draw: { framePaletteUsageMask: Uint8Array } }).draw
                .framePaletteUsageMask;
            const scratch: number[] = [];

            expect(collectUsedIndices(usageMask, 16, scratch)).toEqual([textPaletteIndex]);
        });

        it('drawBitmapText scans glyph rects when palette tracking is enabled', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const mockFont = {
                getSpriteSheet: () => mockSheet,
                getGlyph: (char: string) => ({ rect: new Rect2i(0, 0, 8, 8), char }),
            } as unknown as BitmapFont;
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));
            stubRendererDrawCalls();

            BTAPI.instance.draw.drawBitmapText(mockFont, new Vector2i(0, 0), 'ab');

            expect(markSpy).toHaveBeenCalledTimes(2);
        });

        it('clears stale palette usage after overlay hide and re-show', async () => {
            const overlaySpy = vi.spyOn(Overlay.prototype, 'updateAndRender');
            const rafCallbacks: FrameRequestCallback[] = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);
                    return rafCallbacks.length;
                }),
            );

            const render = vi.fn(() => {
                const renderCall = render.mock.calls.length;

                if (renderCall === 1) {
                    BTAPI.instance.draw.drawPixel(new Vector2i(0, 0), 9);
                    return;
                }

                if (renderCall >= 3) {
                    BTAPI.instance.draw.drawPixel(new Vector2i(0, 0), 7);
                }
            });

            const drainRafUntilRenderCount = (target: number): void => {
                let guard = 0;

                while (render.mock.calls.length < target) {
                    if (guard++ > 1000 || rafCallbacks.length === 0) {
                        throw new Error(`Timed out waiting for render call ${target}`);
                    }

                    const cb = rafCallbacks.shift();

                    if (cb) {
                        cb(16);
                    }
                }
            };

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render,
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const overlay = getOverlay();
            expect(overlay).not.toBeNull();
            expect(overlay?.isBodyVisible).toBe(true);

            drainRafUntilRenderCount(1);

            overlay?.handleFrameInput(null, true, 1);
            expect(overlay?.isTrackingPaletteUsage).toBe(false);

            drainRafUntilRenderCount(2);

            overlay?.handleFrameInput(null, true, 2);
            expect(overlay?.isTrackingPaletteUsage).toBe(true);

            overlaySpy.mockClear();
            drainRafUntilRenderCount(3);

            const usedMask = overlaySpy.mock.calls.at(-1)?.[8] as Uint8Array | undefined;
            const scratch: number[] = [];

            expect(collectUsedIndices(usedMask as Uint8Array, 16, scratch)).toEqual([7]);
        });
    });

    describe('drawNineSlice', () => {
        type Quad = { kind: 'sprite' | 'stretched'; src: number[]; box: number[] };

        // Panel source: L=2, R=3, T=3, B=2, center 5x4 at (6, 7).
        const OUTER = new Rect2i(4, 4, 10, 9);
        const INNER = new Rect2i(6, 7, 5, 4);

        /**
         * Inits BTAPI and records every quad as it was at call time - drawNineSlice reuses one scratch
         * Rect2i and Vector2i, so the spies' own call records would all show the last values.
         */
        async function setup(): Promise<{
            quads: Quad[];
            offsets: number[];
            sheet: SpriteSheet;
            markSpy: MockInstance;
        }> {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.palettes.setPalette(new Palette(16));

            const renderer = BTAPI.instance.getRenderer() as NonNullable<ReturnType<typeof BTAPI.instance.getRenderer>>;
            const quads: Quad[] = [];
            const offsets: number[] = [];

            vi.spyOn(renderer, 'drawSprite').mockImplementation((_sheet, src, dest, offset) => {
                offsets.push(offset ?? 0);
                quads.push({
                    kind: 'sprite',
                    src: [src.x, src.y, src.width, src.height],
                    box: [dest.x, dest.y, src.width, src.height],
                });
            });
            vi.spyOn(renderer, 'drawSpriteStretched').mockImplementation(
                (_sheet, src, x, y, w, h, offset, orientation) => {
                    expect(orientation).toBe(0);
                    offsets.push(offset);
                    quads.push({ kind: 'stretched', src: [src.x, src.y, src.width, src.height], box: [x, y, w, h] });
                },
            );

            const sheet = SpriteSheet.fromIndexedPixels(32, 32, new Uint8Array(32 * 32) as Uint8Array<ArrayBuffer>);
            const markSpy = vi.spyOn(sheet, 'markPaletteIndicesInRect');

            return { quads, offsets, sheet, markSpy };
        }

        /** Asserts the quads tile a `w x h` box at (-3, 5) with every pixel covered exactly once. */
        function expectExactCoverage(quads: Quad[], w: number, h: number): void {
            const hits = new Uint8Array(Math.max(w * h, 1));

            for (const { box } of quads) {
                const [bx = 0, by = 0, bw = 0, bh = 0] = box;

                expect(bw).toBeGreaterThan(0);
                expect(bh).toBeGreaterThan(0);

                for (let y = by; y < by + bh; y++) {
                    for (let x = bx; x < bx + bw; x++) {
                        expect(x >= -3 && x < -3 + w && y >= 5 && y < 5 + h).toBe(true);
                        hits[(y - 5) * w + (x + 3)] = (hits[(y - 5) * w + (x + 3)] ?? 0) + 1;
                    }
                }
            }

            if (w > 0 && h > 0) {
                expect(Array.from(hits).every((count) => count === 1)).toBe(true);
            } else {
                expect(quads).toHaveLength(0);
            }
        }

        function pendingDrawCalls(): number {
            return (BTAPI.instance as unknown as { pendingDrawCalls: number }).pendingDrawCalls;
        }

        it('draws 1:1 corners and stretched edges and center when the box fits', async () => {
            const { quads, offsets, sheet } = await setup();

            BTAPI.instance.draw.drawNineSlice(NineSlice.fromSheet(sheet, OUTER, INNER), new Rect2i(100, 50, 20, 15), 2);

            expect(quads).toEqual([
                { kind: 'sprite', src: [4, 4, 2, 3], box: [100, 50, 2, 3] },
                { kind: 'stretched', src: [6, 4, 5, 3], box: [102, 50, 15, 3] },
                { kind: 'sprite', src: [11, 4, 3, 3], box: [117, 50, 3, 3] },
                { kind: 'stretched', src: [4, 7, 2, 4], box: [100, 53, 2, 10] },
                { kind: 'stretched', src: [6, 7, 5, 4], box: [102, 53, 15, 10] },
                { kind: 'stretched', src: [11, 7, 3, 4], box: [117, 53, 3, 10] },
                { kind: 'sprite', src: [4, 11, 2, 2], box: [100, 63, 2, 2] },
                { kind: 'stretched', src: [6, 11, 5, 2], box: [102, 63, 15, 2] },
                { kind: 'sprite', src: [11, 11, 3, 2], box: [117, 63, 3, 2] },
            ]);
            expect(offsets).toEqual(Array(9).fill(2));
        });

        it('crops corners from their outer side when the box is smaller than both caps', async () => {
            const { quads, sheet } = await setup();

            // x: 4 < 2 + 3 -> [1, 0, 3]; y: 4 < 3 + 2 -> [2, 0, 2].
            BTAPI.instance.draw.drawNineSlice(NineSlice.fromSheet(sheet, OUTER, INNER), new Rect2i(0, 0, 4, 4));

            expect(quads).toEqual([
                { kind: 'sprite', src: [4, 4, 1, 2], box: [0, 0, 1, 2] },
                { kind: 'sprite', src: [11, 4, 3, 2], box: [1, 0, 3, 2] },
                { kind: 'sprite', src: [4, 11, 1, 2], box: [0, 2, 1, 2] },
                { kind: 'sprite', src: [11, 11, 3, 2], box: [1, 2, 3, 2] },
            ]);
        });

        it('crops edge thickness with the corners when only one axis is too small', async () => {
            const { quads, sheet } = await setup();

            // x fits: [2, 15, 3]; y: 4 < 5 -> [2, 0, 2].
            BTAPI.instance.draw.drawNineSlice(NineSlice.fromSheet(sheet, OUTER, INNER), new Rect2i(0, 0, 20, 4));

            expect(quads).toEqual([
                { kind: 'sprite', src: [4, 4, 2, 2], box: [0, 0, 2, 2] },
                { kind: 'stretched', src: [6, 4, 5, 2], box: [2, 0, 15, 2] },
                { kind: 'sprite', src: [11, 4, 3, 2], box: [17, 0, 3, 2] },
                { kind: 'sprite', src: [4, 11, 2, 2], box: [0, 2, 2, 2] },
                { kind: 'stretched', src: [6, 11, 5, 2], box: [2, 2, 15, 2] },
                { kind: 'sprite', src: [11, 11, 3, 2], box: [17, 2, 3, 2] },
            ]);
        });

        it('tiles edges and center from the region top-left and crops the last tile', async () => {
            const { quads, sheet } = await setup();
            const slice = NineSlice.fromSheet(sheet, OUTER, INNER, { edges: 'tile', center: 'tile' });

            // x: [2, 12, 3]; y: [3, 7, 2]. Strips: top 5 wide -> 5, 5, 2; center 5x4 -> cols 5, 5, 2 x rows 4, 3.
            BTAPI.instance.draw.drawNineSlice(slice, new Rect2i(0, 0, 17, 12));

            expect(quads.every((quad) => quad.kind === 'sprite')).toBe(true);
            expect(quads).toHaveLength(1 + 3 + 1 + 2 + 6 + 2 + 1 + 3 + 1);
            // Top edge, in order.
            expect(quads.slice(1, 4)).toEqual([
                { kind: 'sprite', src: [6, 4, 5, 3], box: [2, 0, 5, 3] },
                { kind: 'sprite', src: [6, 4, 5, 3], box: [7, 0, 5, 3] },
                { kind: 'sprite', src: [6, 4, 2, 3], box: [12, 0, 2, 3] },
            ]);
            // Left edge tiles vertically: 4 rows, then a cropped 3.
            expect(quads.slice(5, 7)).toEqual([
                { kind: 'sprite', src: [4, 7, 2, 4], box: [0, 3, 2, 4] },
                { kind: 'sprite', src: [4, 7, 2, 3], box: [0, 7, 2, 3] },
            ]);
            // Center: last tile cropped on both axes.
            expect(quads[12]).toEqual({ kind: 'sprite', src: [6, 7, 2, 3], box: [12, 7, 2, 3] });
        });

        it('mixes tiled edges with a stretched center', async () => {
            const { quads, sheet } = await setup();
            const slice = NineSlice.fromSheet(sheet, OUTER, INNER, { edges: 'tile', center: 'stretch' });

            BTAPI.instance.draw.drawNineSlice(slice, new Rect2i(0, 0, 17, 12));

            const stretched = quads.filter((quad) => quad.kind === 'stretched');

            expect(stretched).toEqual([{ kind: 'stretched', src: [6, 7, 5, 4], box: [2, 3, 12, 7] }]);
            expect(quads).toHaveLength(20 - 6 + 1);
        });

        it('draws a three-slice bar with no top or bottom caps', async () => {
            const { quads, sheet } = await setup();
            const bar = NineSlice.fromSheet(sheet, new Rect2i(0, 20, 12, 6), new Rect2i(4, 20, 4, 6));

            BTAPI.instance.draw.drawNineSlice(bar, new Rect2i(0, 0, 30, 6));

            expect(quads).toEqual([
                { kind: 'stretched', src: [0, 20, 4, 6], box: [0, 0, 4, 6] },
                { kind: 'stretched', src: [4, 20, 4, 6], box: [4, 0, 22, 6] },
                { kind: 'stretched', src: [8, 20, 4, 6], box: [26, 0, 4, 6] },
            ]);
        });

        it.each(['stretch', 'tile'] as const)(
            'covers the box exactly once at every size from 0x0 to 20x20 (%s mode, negative origin)',
            async (mode) => {
                const { quads, sheet } = await setup();
                const slice = NineSlice.fromSheet(sheet, OUTER, INNER, { edges: mode, center: mode });

                for (let w = 0; w <= 20; w++) {
                    for (let h = 0; h <= 20; h++) {
                        quads.length = 0;
                        BTAPI.instance.draw.drawNineSlice(slice, new Rect2i(-3, 5, w, h));

                        expectExactCoverage(quads, w, h);
                    }
                }
            },
        );

        it('draws nothing for an empty, negative, or NaN box and truncates fractions', async () => {
            const { quads, sheet } = await setup();
            const slice = NineSlice.fromSheet(sheet, OUTER, INNER);

            BTAPI.instance.draw.drawNineSlice(slice, new Rect2i(0, 0, 0, 10));
            BTAPI.instance.draw.drawNineSlice(slice, new Rect2i(0, 0, 10, -3));

            const nan = new Rect2i(0, 0, 10, 10);
            nan.width = Number.NaN;
            BTAPI.instance.draw.drawNineSlice(slice, nan);

            expect(quads).toHaveLength(0);

            const fractional = new Rect2i(0, 0, 20, 15);
            fractional.x = 1.9;
            fractional.width = 20.7;
            BTAPI.instance.draw.drawNineSlice(slice, fractional);

            expect(quads[0]?.box).toEqual([1, 0, 2, 3]);
            expect(quads[2]?.box).toEqual([18, 0, 3, 3]);
        });

        it.each([
            [
                'a non-NineSlice',
                (slice: NineSlice) => [{ ...slice } as NineSlice, new Rect2i(0, 0, 20, 15), 0],
                'NineSlice.fromSheet',
            ],
            [
                'a non-Rect2i destination',
                (slice: NineSlice) => [slice, { x: 0, y: 0, width: 20, height: 15 } as Rect2i, 0],
                'Rect2i',
            ],
            ['a negative paletteOffset', (slice: NineSlice) => [slice, new Rect2i(0, 0, 20, 15), -1], 'color number'],
            [
                'an out-of-range paletteOffset',
                (slice: NineSlice) => [slice, new Rect2i(0, 0, 20, 15), 16],
                'too big for this palette',
            ],
        ] as const)('rejects %s before drawing anything', async (_label, args, fragment) => {
            const { quads, sheet } = await setup();
            const [slice, dest, offset] = args(NineSlice.fromSheet(sheet, OUTER, INNER));

            expect(() =>
                BTAPI.instance.draw.drawNineSlice(slice as NineSlice, dest as Rect2i, offset as number),
            ).toThrow(fragment);
            expect(quads).toHaveLength(0);
        });

        it('rejects a sheet that is not indexized before drawing anything', async () => {
            const { quads } = await setup();
            const rawSheet = new SpriteSheet(null, new Vector2i(32, 32));

            expect(() =>
                BTAPI.instance.draw.drawNineSlice(
                    NineSlice.fromSheet(rawSheet, OUTER, INNER),
                    new Rect2i(0, 0, 20, 15),
                ),
            ).toThrow("hasn't been prepared");
            expect(quads).toHaveLength(0);
        });

        it('counts one draw call per drawNineSlice call and marks palette usage once per region', async () => {
            const { quads, sheet, markSpy } = await setup();
            const slice = NineSlice.fromSheet(sheet, OUTER, INNER, { edges: 'tile', center: 'tile' });
            const before = pendingDrawCalls();

            BTAPI.instance.draw.drawNineSlice(slice, new Rect2i(0, 0, 17, 12), 1);

            expect(quads.length).toBeGreaterThan(1);
            expect(pendingDrawCalls() - before).toBe(1);
            expect(markSpy).toHaveBeenCalledTimes(9);
            expect(markSpy).toHaveBeenCalledWith(expect.any(Rect2i), 1, expect.anything());

            const afterFirst = pendingDrawCalls();

            BTAPI.instance.draw.drawNineSlice(slice, new Rect2i(0, 0, 0, 12));

            expect(pendingDrawCalls() - afterFirst).toBe(0);
        });

        it('marks only the cropped part of a tile strip narrower box', async () => {
            const { sheet, markSpy } = await setup();
            const marked: number[][] = [];

            markSpy.mockImplementation((rect: Rect2i) => {
                marked.push([rect.x, rect.y, rect.width, rect.height]);
            });

            // x: [2, 3, 3]; the top strip is 5 wide but only 3 columns show.
            BTAPI.instance.draw.drawNineSlice(
                NineSlice.fromSheet(sheet, OUTER, INNER, { edges: 'tile', center: 'tile' }),
                new Rect2i(0, 0, 8, 12),
            );

            expect(marked[1]).toEqual([6, 4, 3, 3]);
        });
    });

    describe('assertPaletteIndex', () => {
        it('throws when index is negative (no palette set)', () => {
            expect(() => BTAPI.instance.draw.drawPixel(new Vector2i(0, 0), -1)).toThrow('0 or higher');
        });

        it('throws when index is out of range for the active palette', () => {
            const palette = new Palette(16);

            BTAPI.instance.palettes.setPalette(palette);

            expect(() => BTAPI.instance.draw.drawPixel(new Vector2i(0, 0), 20)).toThrow(
                'The color number 20 is too big',
            );
        });
    });
});
