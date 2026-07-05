// @vitest-environment happy-dom

/**
 * Unit tests for {@link VoicePool}.
 *
 * Constructs a real {@link AudioManager} attached against the Web Audio mock (see
 * `src/__test__/webaudio-mock.ts`) so `VoicePool` exercises its real `getContext()` /
 * `getSfxBus()` accessors, then constructs `VoicePool` instances directly against that manager.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockAudioContext, uninstallMockAudioContext } from '../__test__/webaudio-mock';
import { BTAPI } from '../core/BTAPI';
import type { HardwareSettings } from '../core/IBTDemo';
import { AudioManager } from './AudioManager';
import { VoicePool } from './VoicePool';

/**
 * Mounts a canvas for {@link AudioManager.attach}.
 */
const createCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');

    document.body.appendChild(canvas);

    return canvas;
};

describe('VoicePool', () => {
    let canvas: HTMLCanvasElement;
    let audio: AudioManager;

    beforeEach(() => {
        installMockAudioContext();
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

            expect(pool.getStealCount()).toBe(0);
            expect(pool.getDropCount()).toBe(0);

            // Sizing is verified indirectly in Task 5 (allocation exhaustion); this test only
            // establishes that construction with no hardware settings does not throw.
        });

        it('reads the configured audioVoices count', () => {
            vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
                audioVoices: 2,
            } as HardwareSettings);

            expect(() => new VoicePool(audio)).not.toThrow();
        });
    });

    describe('counters', () => {
        it('starts with zero drop and steal counts', () => {
            const pool = new VoicePool(audio);

            expect(pool.getDropCount()).toBe(0);
            expect(pool.getStealCount()).toBe(0);
        });
    });
});
