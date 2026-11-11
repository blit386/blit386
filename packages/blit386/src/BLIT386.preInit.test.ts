/**
 * `BT` members read before `BT.init()` (BT-765): a getter with a configure default returns a fresh, mutable copy of it,
 * `BT.inputMap` survives the layout seed `init()` applies, and `BT.musicPlay` validates its options either way.
 *
 * Nothing in this file initializes the static `BT`; the tests that need a running engine import a fresh module graph.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as Harness from './__test__/engineHarness';
import type { AudioClip } from './assets/AudioClip';
import { BT } from './BLIT386';
import { defaultConfig } from './core/mergeHardwareSettings';
import { Vector2i } from './utils/Vector2i';

const ONE = new Vector2i(1, 1);

/**
 * Asserts a vector can be written to (not the frozen `Vector2i.zero()` singleton).
 *
 * @param vector - Vector a getter returned.
 */
function expectMutable(vector: Vector2i): void {
    const x = vector.x;

    expect(() => vector.addInPlace(ONE)).not.toThrow();
    expect(vector.x).toBe(x + 1);
}

describe('BT getters before init', () => {
    it('displaySize returns the configure default as a fresh vector', () => {
        expect(BT.displaySize.isEqual(defaultConfig().displaySize)).toBe(true);
        expectMutable(BT.displaySize);
    });

    it('drawingBufferSize returns the configure default as a fresh vector', () => {
        const size = BT.drawingBufferSize;

        expect(size?.isEqual(new Vector2i(640, 480))).toBe(true);
        expectMutable(size ?? new Vector2i());
    });

    it('outputSize returns the configure default as a fresh vector', () => {
        expect(BT.outputSize.isEqual(new Vector2i(640, 480))).toBe(true);
        expectMutable(BT.outputSize);
    });

    it('camera returns a fresh (0, 0)', () => {
        expect(BT.camera.isEqual(Vector2i.zero())).toBe(true);
        expectMutable(BT.camera);
    });

    it('pointerPos returns a fresh (0, 0)', () => {
        expect(BT.pointerPos().isEqual(Vector2i.zero())).toBe(true);
        expectMutable(BT.pointerPos());
    });

    it('pointerDelta returns a fresh (0, 0)', () => {
        expect(BT.pointerDelta().isEqual(Vector2i.zero())).toBe(true);
        expectMutable(BT.pointerDelta());
    });

    it('systemPrintMeasure returns a fresh (0, 0)', () => {
        expect(BT.systemPrintMeasure('hello').isEqual(Vector2i.zero())).toBe(true);
        expectMutable(BT.systemPrintMeasure('hello'));
    });
});

describe('BT.musicPlay and BT.musicStop before init', () => {
    const unloaded = { buffer: null } as unknown as AudioClip;

    it('musicPlay rejects a non-finite option before init', () => {
        expect(() => BT.musicPlay(unloaded, { volume: Number.NaN })).toThrow();
        expect(() => BT.musicPlay(unloaded, { fadeMs: Number.POSITIVE_INFINITY })).toThrow();
    });

    it('musicPlay still ignores an unloaded clip with valid options', () => {
        expect(() => BT.musicPlay(unloaded, { volume: 0.5 })).not.toThrow();
    });

    it('musicStop rejects a non-finite fadeMs before init', () => {
        expect(() => BT.musicStop({ fadeMs: Number.NaN })).toThrow();
    });
});

describe('BT members with a running engine', () => {
    let dispose: (() => void) | null = null;

    afterEach(() => {
        dispose?.();
        dispose = null;
    });

    /**
     * Loads a fresh copy of the engine (so its keyboard maps are unseeded) and the harness that drives it.
     *
     * @returns The fresh `BT` and `startEngine`.
     */
    async function freshEngine(): Promise<{
        freshBT: typeof BT;
        startEngine: typeof Harness.startEngine;
    }> {
        vi.resetModules();

        const { BT: freshBT } = await import('./BLIT386');
        const { startEngine } = await import('./__test__/engineHarness');

        return { freshBT, startEngine };
    }

    it('inputMap called before init survives the layout seed init applies', async () => {
        const { freshBT, startEngine } = await freshEngine();

        freshBT.inputMap(0, freshBT.BTN_A, 'KeyZ');

        const harness = await startEngine({ read: () => freshBT.isDown(freshBT.BTN_A) });

        dispose = harness.dispose;
        harness.key('keydown', 'KeyZ');
        harness.frame(1000 / 60);

        expect(harness.updates.at(-1)).toBe(true);
    });

    it('pointerPos and pointerDelta return a fresh (0, 0) for an out-of-range slot', async () => {
        const { freshBT, startEngine } = await freshEngine();
        const harness = await startEngine({ read: () => null });

        dispose = harness.dispose;

        expectMutable(freshBT.pointerPos(7));
        expectMutable(freshBT.pointerDelta(7));
    });
});
