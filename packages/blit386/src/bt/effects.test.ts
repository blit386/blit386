// @vitest-environment happy-dom

/**
 * Unit tests for the `BT` members defined in `src/bt/effects.ts`: effectAdd / effectRemove / effectClear.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withErrorContainer } from '../__test__/btFacadeFixtures';
import { BT, Vector2i } from '../BLIT386';
import { BTAPI } from '../core/BTAPI';
import { SoftwareRenderer } from '../render/SoftwareRenderer';
import { DEFAULT_CONTAINER_ID } from '../utils/BootstrapHelpers';

describe('BT.effectAdd / BT.effectRemove / BT.effectClear', () => {
    function makeStubEffect() {
        return {
            tier: 'pixel' as const,
            init: vi.fn(),
            updateUniforms: vi.fn(),
            encodePass: vi.fn(),
            dispose: vi.fn(),
        };
    }

    /** Builds an initialized software renderer for effect-API facade tests. */
    async function makeSoftwareRenderer(): Promise<SoftwareRenderer> {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: () =>
                ({
                    imageSmoothingEnabled: false,
                    createImageData: (w: number, h: number) =>
                        ({
                            data: new Uint8ClampedArray(w * h * 4),
                            width: w,
                            height: h,
                        }) as ImageData,
                    putImageData: () => {},
                    clearRect: () => {},
                    drawImage: () => {},
                }) as unknown as CanvasRenderingContext2D,
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        return renderer;
    }

    /**
     * Temporarily installs a software renderer on the BTAPI singleton so
     * {@link BT.effectAdd} / friends reach the real unsupported-effects path.
     */
    async function withSoftwareRenderer(callback: () => void | Promise<void>): Promise<void> {
        const renderer = await makeSoftwareRenderer();
        const api = BTAPI.instance as unknown as { renderer: SoftwareRenderer | null };
        const previous = api.renderer;
        api.renderer = renderer;

        try {
            await callback();
        } finally {
            api.renderer = previous;
        }
    }

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('effectAdd shows engine-not-ready when called before bootstrap', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.effectAdd(makeStubEffect());

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("The engine isn't ready yet.");
        });
    });

    it('effectRemove shows engine-not-ready when called before bootstrap', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.effectRemove(makeStubEffect());

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("The engine isn't ready yet.");
        });
    });

    it('effectClear shows engine-not-ready when called before bootstrap', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.effectClear();

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("The engine isn't ready yet.");
        });
    });

    it('effectAdd delegates to BTAPI.instance.effectAdd when renderer is ready', () => {
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
        const spy = vi.spyOn(BTAPI.instance, 'effectAdd').mockReturnValue(undefined);
        const effect = makeStubEffect();

        BT.effectAdd(effect);

        expect(spy).toHaveBeenCalledWith(effect);
    });

    it('effectRemove delegates to BTAPI.instance.effectRemove when renderer is ready', () => {
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
        const spy = vi.spyOn(BTAPI.instance, 'effectRemove').mockReturnValue(undefined);
        const effect = makeStubEffect();

        BT.effectRemove(effect);

        expect(spy).toHaveBeenCalledWith(effect);
    });

    it('effectClear delegates to BTAPI.instance.effectClear when renderer is ready', () => {
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
        const spy = vi.spyOn(BTAPI.instance, 'effectClear').mockReturnValue(undefined);

        BT.effectClear();

        expect(spy).toHaveBeenCalled();
    });

    it('effectAdd shows a clear software-renderer unsupported message', async () => {
        await withErrorContainer(async () => {
            await withSoftwareRenderer(() => {
                BT.effectAdd(makeStubEffect());

                const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
                expect(text).toContain("doesn't support fullscreen effects");
                expect(text).toContain("set backend to 'webgpu' in configure()");
                expect(text).toContain(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
            });
        });
    });

    it('effectRemove shows a clear software-renderer unsupported message', async () => {
        await withErrorContainer(async () => {
            await withSoftwareRenderer(() => {
                BT.effectRemove(makeStubEffect());

                const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
                expect(text).toContain(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
            });
        });
    });

    it('effectClear shows a clear software-renderer unsupported message', async () => {
        await withErrorContainer(async () => {
            await withSoftwareRenderer(() => {
                BT.effectClear();

                const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
                expect(text).toContain(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
            });
        });
    });
});
