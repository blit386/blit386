/**
 * Unit tests for `AudioCommands`, the engine side of the `BT` audio members: each call is a
 * no-op or returns its default while the audio subsystem is missing, and forwards to
 * `AudioManager`, its voice pool or its music player once one is attached.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockAudioBuffer } from '../../__test__/webaudio-mock';
import type { AudioClip } from '../../assets/AudioClip';
import { AudioManager } from '../../audio/AudioManager';
import type { MusicPlayer } from '../../audio/MusicPlayer';
import { INVALID_SOUND_REF, type VoicePool } from '../../audio/VoicePool';
import { BTAPI } from '../BTAPI';

function resetSingleton(): void {
    // BTAPI._instance is private; the cast is intentional - there is no public
    // reset API, and this is the least-invasive way to isolate singleton state
    // between tests without modifying production code.
    (BTAPI as unknown as { _instance: BTAPI | null })._instance = null;
}

describe('sound playback passthroughs', () => {
    beforeEach(() => {
        resetSingleton();
    });

    afterEach(() => {
        resetSingleton();
    });

    function setAudio(audio: AudioManager | null): void {
        // BTAPI's `audio` field is private; this cast is the same test-isolation technique
        // `resetSingleton()` above uses for `_instance` - it lets these tests inject a real
        // AudioManager without running a full init()/WebGPU/AudioContext mock setup, since none
        // of these passthroughs need a live renderer or context.
        (BTAPI.instance as unknown as { audio: AudioManager | null }).audio = audio;
    }

    it('soundPlay returns INVALID_SOUND_REF when the audio subsystem is not initialized', () => {
        const clip = { buffer: createMockAudioBuffer() } as unknown as AudioClip;

        expect(BTAPI.instance.audioCommands.soundPlay(clip)).toEqual(INVALID_SOUND_REF);
    });

    it('soundPlay returns INVALID_SOUND_REF when the clip buffer is null', () => {
        setAudio(new AudioManager());

        const clip = { buffer: null } as unknown as AudioClip;

        expect(BTAPI.instance.audioCommands.soundPlay(clip)).toEqual(INVALID_SOUND_REF);
    });

    it('soundPlay delegates to AudioManager.playSound with the clip buffer', () => {
        const audio = new AudioManager();
        const buffer = createMockAudioBuffer();
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(audio, 'playSound').mockReturnValue(ref);

        setAudio(audio);

        const clip = { buffer } as unknown as AudioClip;
        const result = BTAPI.instance.audioCommands.soundPlay(clip, { volume: 0.5 });

        expect(spy).toHaveBeenCalledWith(buffer, { volume: 0.5 });
        expect(result).toBe(ref);
    });

    it("soundStop delegates to the voice pool's stop", () => {
        const audio = new AudioManager();
        const spy = vi.fn().mockReturnValue(undefined);

        vi.spyOn(audio, 'voices', 'get').mockReturnValue({ stop: spy } as unknown as VoicePool);

        setAudio(audio);
        BTAPI.instance.audioCommands.soundStop(INVALID_SOUND_REF, 200);

        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF, 200);
    });

    it('soundStop is a no-op when the audio subsystem is not initialized', () => {
        expect(() => BTAPI.instance.audioCommands.soundStop(INVALID_SOUND_REF)).not.toThrow();
    });

    it("isSoundPlaying delegates to the voice pool's isPlaying", () => {
        const audio = new AudioManager();
        const spy = vi.fn().mockReturnValue(true);

        vi.spyOn(audio, 'voices', 'get').mockReturnValue({ isPlaying: spy } as unknown as VoicePool);

        setAudio(audio);

        expect(BTAPI.instance.audioCommands.isSoundPlaying(INVALID_SOUND_REF)).toBe(true);
        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF);
    });

    it('isSoundPlaying returns false when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.audioCommands.isSoundPlaying(INVALID_SOUND_REF)).toBe(false);
    });

    it("soundVolumeSet delegates to the voice pool's volumeSet", () => {
        const audio = new AudioManager();
        const spy = vi.fn().mockReturnValue(undefined);

        vi.spyOn(audio, 'voices', 'get').mockReturnValue({ volumeSet: spy } as unknown as VoicePool);

        setAudio(audio);
        BTAPI.instance.audioCommands.soundVolumeSet(INVALID_SOUND_REF, 0.5, 100);

        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF, 0.5, 100);
    });

    it("soundVolumeGet delegates to the voice pool's volumeGet", () => {
        const audio = new AudioManager();
        const spy = vi.fn().mockReturnValue(0.75);

        vi.spyOn(audio, 'voices', 'get').mockReturnValue({ volumeGet: spy } as unknown as VoicePool);

        setAudio(audio);

        expect(BTAPI.instance.audioCommands.soundVolumeGet(INVALID_SOUND_REF)).toBe(0.75);
        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF);
    });

    it('soundVolumeGet returns 1 when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.audioCommands.soundVolumeGet(INVALID_SOUND_REF)).toBe(1);
    });

    it("soundPitchSet delegates to the voice pool's pitchSet", () => {
        const audio = new AudioManager();
        const spy = vi.fn().mockReturnValue(undefined);

        vi.spyOn(audio, 'voices', 'get').mockReturnValue({ pitchSet: spy } as unknown as VoicePool);

        setAudio(audio);
        BTAPI.instance.audioCommands.soundPitchSet(INVALID_SOUND_REF, 1.5, 50);

        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF, 1.5, 50);
    });

    it('soundPitchGet returns 1 when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.audioCommands.soundPitchGet(INVALID_SOUND_REF)).toBe(1);
    });

    it("soundPanSet delegates to the voice pool's panSet", () => {
        const audio = new AudioManager();
        const spy = vi.fn().mockReturnValue(undefined);

        vi.spyOn(audio, 'voices', 'get').mockReturnValue({ panSet: spy } as unknown as VoicePool);

        setAudio(audio);
        BTAPI.instance.audioCommands.soundPanSet(INVALID_SOUND_REF, -0.5, 50);

        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF, -0.5, 50);
    });

    it('soundPanGet returns 0 when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.audioCommands.soundPanGet(INVALID_SOUND_REF)).toBe(0);
    });
});

describe('music playback passthroughs', () => {
    beforeEach(() => {
        resetSingleton();
    });

    afterEach(() => {
        resetSingleton();
    });

    function setAudio(audio: AudioManager | null): void {
        // Same test-isolation technique as the "sound playback passthroughs" block above - see
        // its comment for why this cast is safe here.
        (BTAPI.instance as unknown as { audio: AudioManager | null }).audio = audio;
    }

    it('musicPlay is a no-op when the audio subsystem is not initialized', () => {
        const clip = { buffer: createMockAudioBuffer() } as unknown as AudioClip;

        expect(() => BTAPI.instance.audioCommands.musicPlay(clip)).not.toThrow();
    });

    it('musicPlay is a no-op when the clip buffer is null', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'musicPlay').mockReturnValue(undefined);

        setAudio(audio);

        const clip = { buffer: null } as unknown as AudioClip;

        BTAPI.instance.audioCommands.musicPlay(clip);

        expect(spy).not.toHaveBeenCalled();
    });

    it('musicPlay delegates to AudioManager.musicPlay with the clip buffer', () => {
        const audio = new AudioManager();
        const buffer = createMockAudioBuffer();
        const spy = vi.spyOn(audio, 'musicPlay').mockReturnValue(undefined);

        setAudio(audio);

        const clip = { buffer } as unknown as AudioClip;

        BTAPI.instance.audioCommands.musicPlay(clip, { volume: 0.5 });

        expect(spy).toHaveBeenCalledWith(buffer, { volume: 0.5 });
    });

    it('musicStop delegates to AudioManager.musicStop', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'musicStop').mockReturnValue(undefined);

        setAudio(audio);
        BTAPI.instance.audioCommands.musicStop(200);

        expect(spy).toHaveBeenCalledWith(200);
    });

    it('musicStop is a no-op when the audio subsystem is not initialized', () => {
        expect(() => BTAPI.instance.audioCommands.musicStop()).not.toThrow();
    });

    it("isMusicPlaying delegates to the music player's isPlaying", () => {
        const audio = new AudioManager();
        const spy = vi.fn().mockReturnValue(true);

        vi.spyOn(audio, 'music', 'get').mockReturnValue({ isPlaying: spy } as unknown as MusicPlayer);

        setAudio(audio);

        expect(BTAPI.instance.audioCommands.isMusicPlaying()).toBe(true);
        expect(spy).toHaveBeenCalledWith();
    });

    it('isMusicPlaying returns false when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.audioCommands.isMusicPlaying()).toBe(false);
    });

    it('audioVolumeGet returns the default bus volume, 1, when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.audioCommands.audioVolumeGet('main')).toBe(1);
        expect(new AudioManager().volumeGet('main')).toBe(BTAPI.instance.audioCommands.audioVolumeGet('main'));
    });

    it("musicVolumeSet delegates to the music player's volumeSet", () => {
        const audio = new AudioManager();
        const spy = vi.fn().mockReturnValue(undefined);

        vi.spyOn(audio, 'music', 'get').mockReturnValue({ volumeSet: spy } as unknown as MusicPlayer);

        setAudio(audio);
        BTAPI.instance.audioCommands.musicVolumeSet(0.4, 100);

        expect(spy).toHaveBeenCalledWith(0.4, 100);
    });

    it("musicVolumeGet delegates to the music player's volumeGet", () => {
        const audio = new AudioManager();
        const spy = vi.fn().mockReturnValue(0.75);

        vi.spyOn(audio, 'music', 'get').mockReturnValue({ volumeGet: spy } as unknown as MusicPlayer);

        setAudio(audio);

        expect(BTAPI.instance.audioCommands.musicVolumeGet()).toBe(0.75);
        expect(spy).toHaveBeenCalledWith();
    });

    it('musicVolumeGet returns 1 when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.audioCommands.musicVolumeGet()).toBe(1);
    });
});
