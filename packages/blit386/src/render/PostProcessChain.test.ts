/**
 * Unit tests for {@link PostProcessChain}.
 *
 * Covers the lazy GPU resource model:
 * - constructor does not touch the GPU
 * - {@link PostProcessChain.isActive} reflects effect-list contents
 * - first {@link PostProcessChain.add} allocates `texA` and a sampler; second
 *   allocates `texB`
 * - tier mismatch on {@link PostProcessChain.add} throws a clear error
 * - {@link PostProcessChain.remove} of the last effect and
 *   {@link PostProcessChain.clear} both destroy the offscreen textures and
 *   revert to the no-effect path
 * - {@link PostProcessChain.getInputView} guard rails before activation
 * - {@link PostProcessChain.encode} orchestrates effects in registration order
 *
 * Effects are stubbed via a minimal `Effect` implementation that records
 * lifecycle calls; the chain orchestration is tested without involving the
 * real WGSL shaders.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockGPUDevice, installMockNavigatorGPU, uninstallMockNavigatorGPU } from '../__test__/webgpu-mock';
import { Vector2i } from '../utils/Vector2i';
import type { Effect, EffectTier } from './effects/Effect';
import { PostProcessChain } from './PostProcessChain';

const FORMAT: GPUTextureFormat = 'bgra8unorm';
const DISPLAY_SIZE = new Vector2i(320, 240);

interface CallLog {
    init: number;
    update: number;
    encode: number;
    dispose: number;
}

/** Creates a stub effect that records lifecycle calls. */
function createStubEffect(tier: EffectTier = 'pixel'): Effect & { calls: CallLog } {
    const calls: CallLog = { init: 0, update: 0, encode: 0, dispose: 0 };

    return {
        calls,
        tier,
        init: () => {
            calls.init++;
        },
        updateUniforms: () => {
            calls.update++;
        },
        encodePass: () => {
            calls.encode++;
        },
        dispose: () => {
            calls.dispose++;
        },
    };
}

beforeAll(() => {
    installMockNavigatorGPU();
});

afterAll(() => {
    uninstallMockNavigatorGPU();
});

describe('PostProcessChain constructor', () => {
    it('does not allocate GPU textures', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');

        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');

        expect(chain).toBeInstanceOf(PostProcessChain);
        expect(createTexture).not.toHaveBeenCalled();
    });

    it('reports isActive() === false before any effect is added', () => {
        const chain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');

        expect(chain.isActive()).toBe(false);
    });

    it('exposes its tier via the read-only getter', () => {
        const pixel = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');
        const display = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'display');

        expect(pixel.tier).toBe('pixel');
        expect(display.tier).toBe('display');
    });
});

describe('add()', () => {
    it('initializes the effect with the chain device, format, and chain size', () => {
        const device = createMockGPUDevice();
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const effect = createStubEffect('pixel');
        const initSpy = vi.spyOn(effect, 'init');

        chain.add(effect);

        expect(initSpy).toHaveBeenCalledTimes(1);
        expect(initSpy).toHaveBeenCalledWith(device, FORMAT, DISPLAY_SIZE);
    });

    it('flips isActive() to true on first add', () => {
        const chain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');

        chain.add(createStubEffect('pixel'));

        expect(chain.isActive()).toBe(true);
    });

    it('lazily allocates texA on the first add', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');

        chain.add(createStubEffect('pixel'));

        expect(createTexture).toHaveBeenCalledTimes(1);
    });

    it('lazily allocates texB only on the second add', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');

        chain.add(createStubEffect('pixel'));
        expect(createTexture).toHaveBeenCalledTimes(1);

        chain.add(createStubEffect('pixel'));
        expect(createTexture).toHaveBeenCalledTimes(2);
    });

    it('does not allocate additional textures for a third or fourth effect', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');

        chain.add(createStubEffect('pixel'));
        chain.add(createStubEffect('pixel'));
        chain.add(createStubEffect('pixel'));
        chain.add(createStubEffect('pixel'));

        expect(createTexture).toHaveBeenCalledTimes(2);
    });

    it('throws when the same effect instance is added twice', () => {
        const chain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');
        const effect = createStubEffect('pixel');

        chain.add(effect);

        expect(() => chain.add(effect)).toThrow(/already registered/);
    });

    it('throws when the effect tier does not match the chain tier', () => {
        const pixelChain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');
        const displayEffect = createStubEffect('display');

        expect(() => pixelChain.add(displayEffect)).toThrow(/does not match chain tier/);
        expect(pixelChain.isActive()).toBe(false);
    });

    it('throws when a pixel-tier effect is added to a display chain', () => {
        const displayChain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'display');
        const pixelEffect = createStubEffect('pixel');

        expect(() => displayChain.add(pixelEffect)).toThrow(/does not match chain tier/);
        expect(displayChain.isActive()).toBe(false);
    });

    it('reuses the existing texB when re-adding a second effect after a 2 -> 1 remove', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const a = createStubEffect('pixel');
        const b = createStubEffect('pixel');
        const c = createStubEffect('pixel');

        chain.add(a);
        chain.add(b);
        expect(createTexture).toHaveBeenCalledTimes(2);

        chain.remove(b);
        // texB stays allocated until the chain is fully cleared.
        chain.add(c);

        // No new texture allocations – existing texA + texB are reused.
        expect(createTexture).toHaveBeenCalledTimes(2);
    });

    it('calls effect.init() exactly once per successful add', () => {
        const chain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');
        const effect = createStubEffect('pixel');

        chain.add(effect);

        expect(effect.calls.init).toBe(1);
    });
});

describe('remove()', () => {
    it('disposes the effect and removes it from the active set', () => {
        const chain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');
        const a = createStubEffect('pixel');
        const b = createStubEffect('pixel');

        chain.add(a);
        chain.add(b);
        const removed = chain.remove(a);

        expect(removed).toBe(true);
        expect(a.calls.dispose).toBe(1);
        expect(b.calls.dispose).toBe(0);
        expect(chain.isActive()).toBe(true);
    });

    it('returns false and leaves the chain unchanged when the effect was never added', () => {
        const chain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');
        const a = createStubEffect('pixel');
        const b = createStubEffect('pixel');

        chain.add(a);
        chain.add(b);
        const removed = chain.remove(createStubEffect('pixel')); // not in chain

        expect(removed).toBe(false);
        expect(chain.isActive()).toBe(true);
        expect(a.calls.dispose).toBe(0);
        expect(b.calls.dispose).toBe(0);
    });

    it('flips isActive() back to false and destroys textures when the last effect is removed', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const effect = createStubEffect('pixel');

        chain.add(effect);
        chain.add(createStubEffect('pixel'));

        chain.remove(effect);
        expect(chain.isActive()).toBe(true);

        const textures = createTexture.mock.results.map((result) => result.value as GPUTexture);
        const destroySpies = textures.map((t) => vi.spyOn(t, 'destroy'));

        chain.clear();

        expect(chain.isActive()).toBe(false);
        for (const spy of destroySpies) {
            expect(spy).toHaveBeenCalled();
        }
    });
});

describe('clear()', () => {
    it('disposes every registered effect', () => {
        const chain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');
        const a = createStubEffect('pixel');
        const b = createStubEffect('pixel');
        const c = createStubEffect('pixel');

        chain.add(a);
        chain.add(b);
        chain.add(c);
        chain.clear();

        expect(a.calls.dispose).toBe(1);
        expect(b.calls.dispose).toBe(1);
        expect(c.calls.dispose).toBe(1);
        expect(chain.isActive()).toBe(false);
    });

    it('is a no-op when there are no effects', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');

        expect(() => {
            chain.clear();
        }).not.toThrow();
        expect(createTexture).not.toHaveBeenCalled();
        expect(chain.isActive()).toBe(false);
    });

    it('re-allocates textures on a subsequent add() after clear()', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');

        chain.add(createStubEffect('pixel'));
        chain.clear();
        chain.add(createStubEffect('pixel'));

        // First add allocated 1, second add (post-clear) allocated 1 more.
        expect(createTexture).toHaveBeenCalledTimes(2);
    });
});

describe('getInputView()', () => {
    it('throws before any effect has been added', () => {
        const chain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');

        expect(() => chain.getInputView()).toThrow(/no active effects/i);
    });

    it('returns a stable view across consecutive calls', () => {
        const chain = new PostProcessChain(createMockGPUDevice(), FORMAT, DISPLAY_SIZE, 'pixel');

        chain.add(createStubEffect('pixel'));

        const a = chain.getInputView();
        const b = chain.getInputView();

        expect(a).toBe(b);
    });
});

describe('encode()', () => {
    function makeDestView(): GPUTextureView {
        return { label: 'DestView' } as unknown as GPUTextureView;
    }

    it('is a no-op when there are no effects', () => {
        const device = createMockGPUDevice();
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const encoder = device.createCommandEncoder();
        const beginSpy = vi.spyOn(encoder, 'beginRenderPass');

        chain.encode(encoder, 16, makeDestView());

        expect(beginSpy).not.toHaveBeenCalled();
    });

    it('runs each effect updateUniforms with the chain size', () => {
        const device = createMockGPUDevice();
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const a = createStubEffect('pixel');
        const b = createStubEffect('pixel');

        chain.add(a);
        chain.add(b);
        chain.encode(device.createCommandEncoder(), 16, makeDestView());

        expect(a.calls.update).toBe(1);
        expect(b.calls.update).toBe(1);
    });

    it('single-effect: source = inputView, dest = destinationView', () => {
        const device = createMockGPUDevice();
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const effect = createStubEffect('pixel');
        const encodeSpy = vi.spyOn(effect, 'encodePass');

        chain.add(effect);
        const inputView = chain.getInputView();
        const destView = makeDestView();

        chain.encode(device.createCommandEncoder(), 16, destView);

        expect(encodeSpy).toHaveBeenCalledTimes(1);
        const args = encodeSpy.mock.calls[0];
        expect(args?.[1]).toBe(inputView);
        expect(args?.[2]).toBe(destView);
    });

    it('two effects: input -> texB, texB -> destination', () => {
        const device = createMockGPUDevice();
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const a = createStubEffect('pixel');
        const b = createStubEffect('pixel');
        const aSpy = vi.spyOn(a, 'encodePass');
        const bSpy = vi.spyOn(b, 'encodePass');

        chain.add(a);
        chain.add(b);

        const inputView = chain.getInputView();
        const destView = makeDestView();

        chain.encode(device.createCommandEncoder(), 16, destView);

        // First effect reads input view and writes to texB; second effect
        // reads texB and writes to the destination.
        const firstArgs = aSpy.mock.calls[0];
        const secondArgs = bSpy.mock.calls[0];

        expect(firstArgs?.[1]).toBe(inputView);
        const intermediateView = firstArgs?.[2];
        expect(intermediateView).not.toBe(inputView);
        expect(intermediateView).not.toBe(destView);

        expect(secondArgs?.[1]).toBe(intermediateView);
        expect(secondArgs?.[2]).toBe(destView);
    });

    it('three effects ping-pong correctly: A -> B, B -> A, A -> destination', () => {
        const device = createMockGPUDevice();
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const a = createStubEffect('pixel');
        const b = createStubEffect('pixel');
        const c = createStubEffect('pixel');
        const aSpy = vi.spyOn(a, 'encodePass');
        const bSpy = vi.spyOn(b, 'encodePass');
        const cSpy = vi.spyOn(c, 'encodePass');

        chain.add(a);
        chain.add(b);
        chain.add(c);

        const inputView = chain.getInputView();
        const destView = makeDestView();

        chain.encode(device.createCommandEncoder(), 16, destView);

        const aArgs = aSpy.mock.calls[0];
        const bArgs = bSpy.mock.calls[0];
        const cArgs = cSpy.mock.calls[0];

        // Pass 1: input (texA) -> texB.
        const texBView = aArgs?.[2];
        expect(aArgs?.[1]).toBe(inputView);
        expect(texBView).not.toBe(inputView);
        expect(texBView).not.toBe(destView);

        // Pass 2: texB -> texA (ping-pong returns to the input texture).
        expect(bArgs?.[1]).toBe(texBView);
        expect(bArgs?.[2]).toBe(inputView);

        // Pass 3 (last): texA -> destination.
        expect(cArgs?.[1]).toBe(inputView);
        expect(cArgs?.[2]).toBe(destView);
    });

    it('preserves effect registration order across encode passes', () => {
        const device = createMockGPUDevice();
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const order: string[] = [];

        function trackingEffect(name: string): Effect {
            return {
                tier: 'pixel',
                init: () => {},
                updateUniforms: () => {
                    order.push(`${name}.update`);
                },
                encodePass: () => {
                    order.push(`${name}.encode`);
                },
            };
        }

        chain.add(trackingEffect('a'));
        chain.add(trackingEffect('b'));
        chain.add(trackingEffect('c'));

        chain.encode(device.createCommandEncoder(), 16, makeDestView());

        expect(order).toEqual(['a.update', 'a.encode', 'b.update', 'b.encode', 'c.update', 'c.encode']);
    });
});

describe('dispose()', () => {
    it('destroys every effect and offscreen texture', () => {
        const device = createMockGPUDevice();
        const createTexture = vi.spyOn(device, 'createTexture');
        const chain = new PostProcessChain(device, FORMAT, DISPLAY_SIZE, 'pixel');
        const effect = createStubEffect('pixel');

        chain.add(effect);
        chain.add(createStubEffect('pixel'));

        const textures = createTexture.mock.results.map((r) => r.value as GPUTexture);
        const destroySpies = textures.map((t) => vi.spyOn(t, 'destroy'));

        chain.dispose();

        expect(effect.calls.dispose).toBe(1);
        for (const spy of destroySpies) {
            expect(spy).toHaveBeenCalled();
        }
        expect(chain.isActive()).toBe(false);
    });
});
