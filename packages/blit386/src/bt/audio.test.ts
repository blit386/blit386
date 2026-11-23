// @vitest-environment happy-dom

/**
 * Unit tests for the `BT` audio members defined in `src/bt/audio.ts`: delegation into
 * `BTAPI.instance.audioCommands` and the `BT.synthPreset` library.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioClip } from '../assets/AudioClip';
import { blip, explosion, hit, jump, laser, pickup } from '../assets/synth/synthPresets';
import { BT } from '../BLIT386';
import { BTAPI } from '../core/BTAPI';

describe('BT.soundPlay', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.audioCommands.soundPlay', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const clip = {} as unknown as AudioClip;
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'soundPlay').mockReturnValue(ref);

        const result = BT.soundPlay(clip, { volume: 0.5 });

        expect(spy).toHaveBeenCalledWith(clip, { volume: 0.5 });
        expect(result).toBe(ref);
    });
});

describe('BT.soundStop', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.audioCommands.soundStop, unpacking fadeOutMs', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'soundStop').mockReturnValue(undefined);

        BT.soundStop(ref, { fadeOutMs: 200 });

        expect(spy).toHaveBeenCalledWith(ref, 200);
    });

    it('passes undefined fadeOutMs when options are omitted', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'soundStop').mockReturnValue(undefined);

        BT.soundStop(ref);

        expect(spy).toHaveBeenCalledWith(ref, undefined);
    });
});

describe('BT.isSoundPlaying', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.audioCommands.isSoundPlaying', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'isSoundPlaying').mockReturnValue(true);

        expect(BT.isSoundPlaying(ref)).toBe(true);
        expect(spy).toHaveBeenCalledWith(ref);
    });
});

describe('BT.soundVolumeSet / BT.soundVolumeGet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('soundVolumeSet delegates to BTAPI.instance.audioCommands.soundVolumeSet, unpacking fadeMs', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'soundVolumeSet').mockReturnValue(undefined);

        BT.soundVolumeSet(ref, 0.5, { fadeMs: 100 });

        expect(spy).toHaveBeenCalledWith(ref, 0.5, 100);
    });

    it('soundVolumeGet delegates to BTAPI.instance.audioCommands.soundVolumeGet', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'soundVolumeGet').mockReturnValue(0.5);

        expect(BT.soundVolumeGet(ref)).toBe(0.5);
        expect(spy).toHaveBeenCalledWith(ref);
    });
});

describe('BT.soundPitchSet / BT.soundPitchGet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('soundPitchSet delegates to BTAPI.instance.audioCommands.soundPitchSet, unpacking fadeMs', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'soundPitchSet').mockReturnValue(undefined);

        BT.soundPitchSet(ref, 1.5, { fadeMs: 50 });

        expect(spy).toHaveBeenCalledWith(ref, 1.5, 50);
    });

    it('soundPitchGet delegates to BTAPI.instance.audioCommands.soundPitchGet', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'soundPitchGet').mockReturnValue(1.5);

        expect(BT.soundPitchGet(ref)).toBe(1.5);
        expect(spy).toHaveBeenCalledWith(ref);
    });
});

describe('BT.soundPanSet / BT.soundPanGet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('soundPanSet delegates to BTAPI.instance.audioCommands.soundPanSet, unpacking fadeMs', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'soundPanSet').mockReturnValue(undefined);

        BT.soundPanSet(ref, -0.5, { fadeMs: 50 });

        expect(spy).toHaveBeenCalledWith(ref, -0.5, 50);
    });

    it('soundPanGet delegates to BTAPI.instance.audioCommands.soundPanGet', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'soundPanGet').mockReturnValue(-0.5);

        expect(BT.soundPanGet(ref)).toBe(-0.5);
        expect(spy).toHaveBeenCalledWith(ref);
    });
});

describe('BT.musicPlay', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.audioCommands.musicPlay', () => {
        const clip = {} as unknown as AudioClip;
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'musicPlay').mockReturnValue(undefined);

        BT.musicPlay(clip, { volume: 0.5, fadeMs: 400 });

        expect(spy).toHaveBeenCalledWith(clip, { volume: 0.5, fadeMs: 400 });
    });
});

describe('BT.musicStop', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.audioCommands.musicStop, unpacking fadeMs', () => {
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'musicStop').mockReturnValue(undefined);

        BT.musicStop({ fadeMs: 500 });

        expect(spy).toHaveBeenCalledWith(500);
    });

    it('passes undefined fadeMs when options are omitted', () => {
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'musicStop').mockReturnValue(undefined);

        BT.musicStop();

        expect(spy).toHaveBeenCalledWith(undefined);
    });
});

describe('BT.isMusicPlaying', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.audioCommands.isMusicPlaying', () => {
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'isMusicPlaying').mockReturnValue(true);

        expect(BT.isMusicPlaying).toBe(true);
        expect(spy).toHaveBeenCalledWith();
    });
});

describe('BT.musicVolumeSet / BT.musicVolumeGet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('musicVolumeSet delegates to BTAPI.instance.audioCommands.musicVolumeSet, unpacking fadeMs', () => {
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'musicVolumeSet').mockReturnValue(undefined);

        BT.musicVolumeSet(0.5, { fadeMs: 100 });

        expect(spy).toHaveBeenCalledWith(0.5, 100);
    });

    it('musicVolumeGet delegates to BTAPI.instance.audioCommands.musicVolumeGet', () => {
        const spy = vi.spyOn(BTAPI.instance.audioCommands, 'musicVolumeGet').mockReturnValue(0.5);

        expect(BT.musicVolumeGet()).toBe(0.5);
        expect(spy).toHaveBeenCalledWith();
    });
});

describe('BT.synthPreset', () => {
    it('exposes exactly the preset sound library factories', () => {
        expect(Object.keys(BT.synthPreset).sort()).toEqual(
            ['blip', 'explosion', 'hit', 'jump', 'laser', 'pickup'].sort(),
        );
    });

    it('delegates each preset to the same factory used by src/assets/synth/synthPresets.ts', () => {
        expect(BT.synthPreset.jump).toBe(jump);
        expect(BT.synthPreset.pickup).toBe(pickup);
        expect(BT.synthPreset.explosion).toBe(explosion);
        expect(BT.synthPreset.laser).toBe(laser);
        expect(BT.synthPreset.hit).toBe(hit);
        expect(BT.synthPreset.blip).toBe(blip);
    });

    it('every preset returns a SynthParams object usable by AudioClip.synth', () => {
        for (const factory of Object.values(BT.synthPreset)) {
            const params = factory();

            expect(params.waveform).toBeDefined();
            expect(params.frequency).toBeGreaterThan(0);
            expect(params.duration).toBeGreaterThan(0);
        }
    });
});
