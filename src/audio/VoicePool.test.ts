// @vitest-environment happy-dom

/**
 * Unit tests for {@link VoicePool}.
 *
 * Constructs a real {@link AudioManager} attached against the Web Audio mock (see
 * `src/__test__/webaudio-mock.ts`) so `VoicePool` exercises its real `getContext()` /
 * `getSfxBus()` accessors, then constructs `VoicePool` instances directly against that manager.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createMockAudioBuffer,
    installMockAudioContext,
    type MockAudioContext,
    uninstallMockAudioContext,
} from '../__test__/webaudio-mock';
import { BTAPI } from '../core/BTAPI';
import type { HardwareSettings } from '../core/IBTDemo';
import { AudioManager } from './AudioManager';
import { INVALID_SOUND_REF, VoicePool } from './VoicePool';

/**
 * Mounts a canvas for {@link AudioManager.attach}.
 */
const createCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');

    document.body.appendChild(canvas);

    return canvas;
};

/**
 * Returns the mock context most recently constructed by `installed`, cast for access to its
 * call-tracking fields.
 */
const getMockContext = (installed: ReturnType<typeof installMockAudioContext>): MockAudioContext =>
    installed.getLastInstance() as unknown as MockAudioContext;

describe('VoicePool', () => {
    let canvas: HTMLCanvasElement;
    let audio: AudioManager;
    let installed: ReturnType<typeof installMockAudioContext>;

    beforeEach(() => {
        installed = installMockAudioContext();
        canvas = createCanvas();
        audio = new AudioManager();
        audio.attach(canvas);
    });

    afterEach(() => {
        audio.detach();
        canvas.remove();
        uninstallMockAudioContext();
        vi.restoreAllMocks();
    });

    describe('sizing', () => {
        it('defaults to 16 voice slots when hardware settings are unavailable', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

            const pool = new VoicePool(audio);

            for (let i = 0; i < 16; i++) {
                pool.play(createMockAudioBuffer());
            }

            expect(pool.getStealCount()).toBe(0);

            pool.play(createMockAudioBuffer());

            expect(pool.getStealCount()).toBe(1);
        });

        it('reads the configured audioVoices count', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            pool.play(createMockAudioBuffer());
            pool.play(createMockAudioBuffer());

            expect(pool.getStealCount()).toBe(0);

            pool.play(createMockAudioBuffer());

            expect(pool.getStealCount()).toBe(1);
        });
    });

    describe('counters', () => {
        it('starts with zero drop and steal counts', () => {
            const pool = new VoicePool(audio);

            expect(pool.getDropCount()).toBe(0);
            expect(pool.getStealCount()).toBe(0);
        });
    });

    describe('play', () => {
        it('builds the source -> gain -> panner -> sfx bus chain', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 4,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const buffer = createMockAudioBuffer();

            pool.play(buffer);

            const context = getMockContext(installed);
            const source = context.createBufferSourceCalls[0];
            const gain = context.createGainCalls[3]; // 0-2 are main/music/sfx from buildBusGraph
            const panner = context.createStereoPannerCalls[0];

            expect((source as unknown as { connectCalls: unknown[] }).connectCalls).toEqual([gain]);
            expect((gain as unknown as { connectCalls: unknown[] }).connectCalls).toEqual([panner]);
            expect((panner as unknown as { connectCalls: unknown[] }).connectCalls).toEqual([audio.getSfxBus()]);
        });

        it('applies volume, pitch, and pan options to the created nodes', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 4,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const buffer = createMockAudioBuffer();

            pool.play(buffer, { volume: 0.5, pitch: 1.5, pan: -0.5 });

            const context = getMockContext(installed);
            const source = context.createBufferSourceCalls[0];
            const gain = context.createGainCalls[3];
            const panner = context.createStereoPannerCalls[0];

            expect(gain?.gain.value).toBe(0.5);
            expect(source?.playbackRate.value).toBe(1.5);
            expect(panner?.pan.value).toBe(-0.5);
        });

        it('defaults volume, pitch, and pan when omitted', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 4,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            pool.play(createMockAudioBuffer());

            const context = getMockContext(installed);
            const gain = context.createGainCalls[3];
            const source = context.createBufferSourceCalls[0];
            const panner = context.createStereoPannerCalls[0];

            expect(gain?.gain.value).toBe(1);
            expect(source?.playbackRate.value).toBe(1);
            expect(panner?.pan.value).toBe(0);
        });

        it('sets loop and starts at the given atTime', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 4,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            pool.play(createMockAudioBuffer(), { loop: true, atTime: 2.5 });

            const context = getMockContext(installed);
            const source = context.createBufferSourceCalls[0];

            expect(source?.loop).toBe(true);
            expect((source as unknown as { startCalls: number[] }).startCalls).toEqual([2.5]);
        });

        it('ramps gain from silence over fadeInMs', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 4,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            pool.play(createMockAudioBuffer(), { volume: 0.8, fadeInMs: 200 });

            const context = getMockContext(installed);
            const gain = context.createGainCalls[3];

            expect(
                (gain?.gain as unknown as { linearRampToValueAtTimeCalls: Array<{ value: number }> })
                    .linearRampToValueAtTimeCalls,
            ).toEqual([{ value: 0.8, endTime: 0.2 }]);
        });

        it('returns unique, incrementing generations for sequential plays into the same slot pool', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 1,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            const first = pool.play(createMockAudioBuffer());
            const second = pool.play(createMockAudioBuffer());

            expect(first.voiceIndex).toBe(0);
            expect(second.voiceIndex).toBe(0);
            expect(second.generation).toBeGreaterThan(first.generation);
        });

        it('steals the lowest-priority active voice when the pool is full', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            pool.play(createMockAudioBuffer(), { priority: 5 });
            const low = pool.play(createMockAudioBuffer(), { priority: 1 });

            const stolenRef = pool.play(createMockAudioBuffer(), { priority: 3 });

            expect(stolenRef.voiceIndex).toBe(low.voiceIndex);
            expect(pool.getStealCount()).toBe(1);
        });

        it('breaks stealing ties at equal priority by oldest start order', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            const oldest = pool.play(createMockAudioBuffer(), { priority: 2 });
            pool.play(createMockAudioBuffer(), { priority: 2 });

            const stolenRef = pool.play(createMockAudioBuffer(), { priority: 2 });

            expect(stolenRef.voiceIndex).toBe(oldest.voiceIndex);
        });

        it('drops the request and returns an invalid ref when no slot qualifies to be stolen', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 1,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            pool.play(createMockAudioBuffer(), { priority: 5 });
            const dropped = pool.play(createMockAudioBuffer(), { priority: 1 });

            expect(dropped).toEqual(INVALID_SOUND_REF);
            expect(pool.getDropCount()).toBe(1);
        });

        it('returns an invalid ref without allocating when the manager has no live context', () => {
            audio.detach();

            const pool = new VoicePool(audio);

            const ref = pool.play(createMockAudioBuffer());

            expect(ref).toEqual(INVALID_SOUND_REF);
            expect(pool.getDropCount()).toBe(0);
        });
    });

    describe('stop and isPlaying', () => {
        it('reports isPlaying true for a freshly played voice', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer());

            expect(pool.isPlaying(ref)).toBe(true);
        });

        it('reports isPlaying false for INVALID_SOUND_REF', () => {
            const pool = new VoicePool(audio);

            expect(pool.isPlaying(INVALID_SOUND_REF)).toBe(false);
        });

        it('stop immediately frees the slot and invalidates the ref', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer());

            pool.stop(ref);

            expect(pool.isPlaying(ref)).toBe(false);
        });

        it('stop without fadeOutMs stops the source node immediately', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer());

            const context = getMockContext(installed);
            const source = context.createBufferSourceCalls[0];

            pool.stop(ref);

            expect((source as unknown as { stopCalls: number[] }).stopCalls).toEqual([0]);
        });

        it('stop with fadeOutMs ramps gain to zero and schedules a delayed stop', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer(), { volume: 1 });

            const context = getMockContext(installed);
            const gain = context.createGainCalls[3];
            const source = context.createBufferSourceCalls[0];

            pool.stop(ref, 500);

            expect(
                (gain?.gain as unknown as { linearRampToValueAtTimeCalls: Array<{ value: number; endTime: number }> })
                    .linearRampToValueAtTimeCalls,
            ).toEqual([{ value: 0, endTime: 0.5 }]);
            expect((source as unknown as { stopCalls: number[] }).stopCalls).toEqual([0.5]);
        });

        it('stop frees the slot for immediate reuse by a new play()', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 1,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const first = pool.play(createMockAudioBuffer());

            pool.stop(first, 500);

            const second = pool.play(createMockAudioBuffer());

            expect(second.voiceIndex).toBe(first.voiceIndex);
            expect(pool.getStealCount()).toBe(0);
        });

        it('is a no-op when stopping an already-stale ref', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer());

            pool.stop(ref);

            expect(() => pool.stop(ref)).not.toThrow();
        });

        it('is a no-op when stopping INVALID_SOUND_REF', () => {
            const pool = new VoicePool(audio);

            expect(() => pool.stop(INVALID_SOUND_REF)).not.toThrow();
        });

        it('is a no-op for an out-of-range voiceIndex', () => {
            const pool = new VoicePool(audio);

            expect(() => pool.stop({ voiceIndex: 999, generation: 0 })).not.toThrow();
            expect(pool.isPlaying({ voiceIndex: 999, generation: 0 })).toBe(false);
        });

        it('rejects a negative voiceIndex even when it would coincidentally match the last slot via Array.at(-1)', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            // A fresh pool's last slot has generation 0 - the same value `Array.at(-1)` would
            // wrap to if the explicit bounds check in getActiveSlot were ever removed. This ref
            // must still be rejected because voiceIndex -1 is out of range.
            const wouldWrapToLastSlot = { voiceIndex: -1, generation: 0 };

            expect(pool.isPlaying(wouldWrapToLastSlot)).toBe(false);
            expect(() => pool.stop(wouldWrapToLastSlot)).not.toThrow();
        });
    });

    describe('volume, pitch, and pan', () => {
        it('gets and sets volume immediately with no fadeMs', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer(), { volume: 1 });

            pool.volumeSet(ref, 0.3);

            expect(pool.volumeGet(ref)).toBe(0.3);
        });

        it('ramps volume over fadeMs', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer(), { volume: 1 });

            pool.volumeSet(ref, 0.2, 100);

            const context = getMockContext(installed);
            const gain = context.createGainCalls[3];

            expect(
                (gain?.gain as unknown as { linearRampToValueAtTimeCalls: unknown[] }).linearRampToValueAtTimeCalls,
            ).toHaveLength(1);
        });

        it('gets and sets pitch immediately', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer());

            pool.pitchSet(ref, 2);

            expect(pool.pitchGet(ref)).toBe(2);
        });

        it('gets and sets pan immediately', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer());

            pool.panSet(ref, -1);

            expect(pool.panGet(ref)).toBe(-1);
        });

        it('returns inert defaults and no-ops for a stale ref', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer());

            pool.stop(ref);

            expect(pool.volumeGet(ref)).toBe(1);
            expect(pool.pitchGet(ref)).toBe(1);
            expect(pool.panGet(ref)).toBe(0);
            expect(() => pool.volumeSet(ref, 0.1)).not.toThrow();
            expect(() => pool.pitchSet(ref, 2)).not.toThrow();
            expect(() => pool.panSet(ref, 1)).not.toThrow();
        });
    });

    describe('natural completion', () => {
        it('recycles the slot when onended fires', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const ref = pool.play(createMockAudioBuffer());

            const context = getMockContext(installed);
            const source = context.createBufferSourceCalls[0];

            (source?.onended as () => void)();

            expect(pool.isPlaying(ref)).toBe(false);
        });

        it('disconnects the ended nodes', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);

            pool.play(createMockAudioBuffer());

            const context = getMockContext(installed);
            const source = context.createBufferSourceCalls[0];
            const disconnectSpy = vi.spyOn(source as AudioBufferSourceNode, 'disconnect');

            (source?.onended as () => void)();

            expect(disconnectSpy).toHaveBeenCalledTimes(1);
        });

        it('a stale onended from a stolen voice does not clobber the new occupant', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 1,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const first = pool.play(createMockAudioBuffer(), { priority: 1 });

            const context = getMockContext(installed);
            const firstSource = context.createBufferSourceCalls[0];

            const second = pool.play(createMockAudioBuffer(), { priority: 5 });

            (firstSource?.onended as () => void)();

            expect(pool.isPlaying(second)).toBe(true);
            expect(first.voiceIndex).toBe(second.voiceIndex);
        });

        it('frees the slot for a new play() after natural completion', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 1,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            pool.play(createMockAudioBuffer());

            const context = getMockContext(installed);
            const source = context.createBufferSourceCalls[0];

            (source?.onended as () => void)();

            const next = pool.play(createMockAudioBuffer());

            expect(pool.getStealCount()).toBe(0);
            expect(next.voiceIndex).toBe(0);
        });
    });

    describe('stopAll', () => {
        it('stops and disconnects every active voice', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const first = pool.play(createMockAudioBuffer());
            const second = pool.play(createMockAudioBuffer());

            pool.stopAll();

            expect(pool.isPlaying(first)).toBe(false);
            expect(pool.isPlaying(second)).toBe(false);
        });

        it('is a no-op on an empty pool', () => {
            const pool = new VoicePool(audio);

            expect(() => pool.stopAll()).not.toThrow();
        });
    });

    describe('stopVoicesUsingBuffer', () => {
        it('stops only voices referencing the released buffer', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            const pool = new VoicePool(audio);
            const releasedBuffer = createMockAudioBuffer();
            const otherBuffer = createMockAudioBuffer();

            const releasedRef = pool.play(releasedBuffer);
            const otherRef = pool.play(otherBuffer);

            pool.stopVoicesUsingBuffer(releasedBuffer);

            expect(pool.isPlaying(releasedRef)).toBe(false);
            expect(pool.isPlaying(otherRef)).toBe(true);
        });
    });
});
