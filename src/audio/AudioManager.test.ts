// @vitest-environment happy-dom

/**
 * Unit tests for {@link AudioManager}.
 *
 * Verifies the bus graph wiring (`sfx`/`music` -> `main` -> `destination`),
 * bus volume get/set, mute semantics (mute preserves the configured volume;
 * unmute restores it), and the browser autoplay-unlock gesture state machine
 * (pointerdown/keydown flip locked -> unlocked and self-remove the gesture
 * listeners). Uses the Web Audio mock factories since Node.js and happy-dom
 * provide no Web Audio APIs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createMockAudioBuffer,
    installMockAudioContext,
    type MockAudioContext,
    type MockAudioParam,
    type MockGainNode,
    uninstallMockAudioContext,
} from '../__test__/webaudio-mock';
import { AudioManager } from './AudioManager';
import { INVALID_SOUND_REF } from './VoicePool';

/**
 * Mounts a canvas for {@link AudioManager.attach}.
 */
const createCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');

    document.body.appendChild(canvas);

    return canvas;
};

/**
 * Returns the gain node created at `index` in `AudioManager.buildBusGraph()`'s
 * `createGain()` call order (0 = main, 1 = music, 2 = sfx), throwing if the
 * bus graph was not built with at least `index + 1` nodes.
 */
const nthGainNode = (calls: readonly GainNode[], index: number): MockGainNode => {
    // eslint-disable-next-line security/detect-object-injection -- index is a small caller-supplied literal (0-2), not user input
    const node = calls[index];

    if (node === undefined) {
        throw new Error(`expected a gain node at index ${index}, got ${calls.length} total`);
    }

    return node as unknown as MockGainNode;
};

describe('AudioManager', () => {
    let canvas: HTMLCanvasElement;
    let audio: AudioManager;
    let installed: ReturnType<typeof installMockAudioContext>;

    /**
     * Returns the mock context most recently constructed by `installed`, cast for
     * access to its call-tracking fields. Centralizes the cast so individual tests
     * don't repeat it.
     */
    const getMockContext = (): MockAudioContext => installed.getLastInstance() as unknown as MockAudioContext;

    beforeEach(() => {
        installed = installMockAudioContext();
        canvas = createCanvas();
        audio = new AudioManager();
    });

    afterEach(() => {
        audio.detach();
        canvas.remove();
        uninstallMockAudioContext();
    });

    describe('bus graph wiring', () => {
        it('creates main, music, and sfx gain nodes on attach', () => {
            audio.attach(canvas);

            const context = getMockContext();

            expect(context.createGainCalls).toHaveLength(3);
        });

        it('wires sfx and music into main, and main into destination', () => {
            audio.attach(canvas);

            const context = getMockContext();

            const main = nthGainNode(context.createGainCalls, 0);
            const music = nthGainNode(context.createGainCalls, 1);
            const sfx = nthGainNode(context.createGainCalls, 2);

            expect(music.connectCalls).toEqual([main]);
            expect(sfx.connectCalls).toEqual([main]);
            expect(main.connectCalls).toEqual([context.destination]);
        });

        it('rebuilds a fresh bus graph on a second attach', () => {
            audio.attach(canvas);
            audio.attach(canvas);

            const context = getMockContext();

            expect(context.createGainCalls).toHaveLength(3);
        });

        it('does not throw when AudioContext construction fails', () => {
            Object.defineProperty(globalThis, 'AudioContext', {
                value: function ThrowingAudioContext(): never {
                    throw new Error('AudioContext limit reached');
                },
                writable: true,
                configurable: true,
            });

            expect(() => audio.attach(canvas)).not.toThrow();
            expect(audio.isUnlocked()).toBe(false);
        });
    });

    describe('internal accessors', () => {
        it('getContext returns null before attach', () => {
            expect(audio.getContext()).toBeNull();
        });

        it('getContext returns the live context after attach', () => {
            audio.attach(canvas);

            expect(audio.getContext()).toBe(getMockContext());
        });

        it('getContext returns null after detach', () => {
            audio.attach(canvas);
            audio.detach();

            expect(audio.getContext()).toBeNull();
        });

        it('getSfxBus returns null before attach', () => {
            expect(audio.getSfxBus()).toBeNull();
        });

        it('getSfxBus returns the sfx bus gain node after attach', () => {
            audio.attach(canvas);

            const context = getMockContext();
            const sfx = nthGainNode(context.createGainCalls, 2);

            expect(audio.getSfxBus()).toBe(sfx);
        });

        it('getSfxBus returns null after detach', () => {
            audio.attach(canvas);
            audio.detach();

            expect(audio.getSfxBus()).toBeNull();
        });
    });

    describe('detach', () => {
        it('closes the audio context', () => {
            audio.attach(canvas);

            const context = getMockContext();

            audio.detach();

            expect(context.closeCallCount).toBe(1);
        });

        it('is safe to call before attach', () => {
            expect(() => audio.detach()).not.toThrow();
        });
    });

    describe('volume', () => {
        beforeEach(() => {
            audio.attach(canvas);
        });

        it('defaults every bus to full volume', () => {
            expect(audio.volumeGet('main')).toBe(1);
            expect(audio.volumeGet('music')).toBe(1);
            expect(audio.volumeGet('sfx')).toBe(1);
        });

        it('sets and gets logical volume immediately with no fadeMs', () => {
            audio.volumeSet('music', 0.5);

            expect(audio.volumeGet('music')).toBe(0.5);
        });

        it('applies the volume to the underlying gain node immediately with no fadeMs', () => {
            const context = getMockContext();
            const music = nthGainNode(context.createGainCalls, 1);

            audio.volumeSet('music', 0.25);

            expect(music.gain.value).toBe(0.25);
        });

        it('clamps volume above 1 down to 1', () => {
            audio.volumeSet('sfx', 5);

            expect(audio.volumeGet('sfx')).toBe(1);
        });

        it('clamps volume below 0 up to 0', () => {
            audio.volumeSet('sfx', -5);

            expect(audio.volumeGet('sfx')).toBe(0);
        });

        it('schedules a linear ramp on the gain param when fadeMs is provided', () => {
            const context = getMockContext();
            const main = nthGainNode(context.createGainCalls, 0);

            audio.volumeSet('main', 0.5, 200);

            const gain = main.gain as unknown as MockAudioParam;

            expect(gain.linearRampToValueAtTimeCalls).toHaveLength(1);
            expect(gain.linearRampToValueAtTimeCalls[0]?.value).toBe(0.5);
            expect(gain.value).toBe(0.5);
        });

        it('samples an eased curve via setValueCurveAtTime for non-linear easing', () => {
            const context = getMockContext();
            const main = nthGainNode(context.createGainCalls, 0);

            audio.volumeSet('main', 0.8, 200, 'ease-out');

            const gain = main.gain as unknown as MockAudioParam;

            expect(gain.setValueCurveAtTimeCalls).toHaveLength(1);
            // Float32Array storage loses a little precision versus the JS double target.
            expect(gain.value).toBeCloseTo(0.8, 5);
        });
    });

    describe('mute', () => {
        beforeEach(() => {
            audio.attach(canvas);
        });

        it('reports unmuted by default', () => {
            expect(audio.isMuted('main')).toBe(false);
        });

        it('mute preserves the configured (logical) volume and unmute restores it', () => {
            audio.volumeSet('music', 0.75);

            audio.muteSet('music', true);
            expect(audio.isMuted('music')).toBe(true);
            expect(audio.volumeGet('music')).toBe(0.75);

            audio.muteSet('music', false);
            expect(audio.isMuted('music')).toBe(false);
            expect(audio.volumeGet('music')).toBe(0.75);
        });

        it('zeroes the underlying gain node on mute and restores it on unmute', () => {
            const context = getMockContext();
            const sfx = nthGainNode(context.createGainCalls, 2);

            audio.volumeSet('sfx', 0.4);

            audio.muteSet('sfx', true);
            expect(sfx.gain.value).toBe(0);

            audio.muteSet('sfx', false);
            expect(sfx.gain.value).toBe(0.4);
        });

        it('is a no-op when muting an already-muted bus', () => {
            audio.muteSet('main', true);
            audio.muteSet('main', true);

            expect(audio.isMuted('main')).toBe(true);
        });
    });

    describe('unlock state machine', () => {
        it('starts locked', () => {
            audio.attach(canvas);

            expect(audio.isUnlocked()).toBe(false);
        });

        it('unlocks on pointerdown and removes the gesture listeners', async () => {
            audio.attach(canvas);

            const removeSpy = vi.spyOn(canvas, 'removeEventListener');

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
            expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
            expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
        });

        it('unlocks on keydown', async () => {
            audio.attach(canvas);

            canvas.dispatchEvent(new Event('keydown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });
        });

        it('unlocks on touchstart', async () => {
            audio.attach(canvas);

            canvas.dispatchEvent(new Event('touchstart', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });
        });

        it('calls resume exactly once even if a second gesture fires after unlock', async () => {
            audio.attach(canvas);

            const context = getMockContext();

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            expect(context.resumeCallCount).toBe(1);
        });
    });

    describe('playSound', () => {
        it('drops the request and returns an invalid ref before unlock', () => {
            audio.attach(canvas);

            const ref = audio.playSound(createMockAudioBuffer());

            expect(ref).toEqual(INVALID_SOUND_REF);
            expect(audio.getDroppedSfxCount()).toBe(1);
        });

        it('delegates to the voice pool once unlocked', async () => {
            audio.attach(canvas);

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            const ref = audio.playSound(createMockAudioBuffer());

            expect(ref).not.toEqual(INVALID_SOUND_REF);
            expect(audio.getDroppedSfxCount()).toBe(0);
        });

        it('returns an invalid ref when the manager has never been attached', () => {
            const ref = audio.playSound(createMockAudioBuffer());

            expect(ref).toEqual(INVALID_SOUND_REF);
        });
    });

    describe('sound playback controls', () => {
        beforeEach(async () => {
            audio.attach(canvas);

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });
        });

        it('soundStop stops a playing sound', () => {
            const ref = audio.playSound(createMockAudioBuffer());

            audio.soundStop(ref);

            expect(audio.isSoundPlaying(ref)).toBe(false);
        });

        it('soundStop accepts an optional fadeOutMs without throwing', () => {
            const ref = audio.playSound(createMockAudioBuffer());

            expect(() => audio.soundStop(ref, 200)).not.toThrow();
        });

        it('isSoundPlaying reports true for a live sound and false for an invalid ref', () => {
            const ref = audio.playSound(createMockAudioBuffer());

            expect(audio.isSoundPlaying(ref)).toBe(true);
            expect(audio.isSoundPlaying(INVALID_SOUND_REF)).toBe(false);
        });

        it('soundVolumeSet and soundVolumeGet round-trip', () => {
            const ref = audio.playSound(createMockAudioBuffer());

            audio.soundVolumeSet(ref, 0.4);

            expect(audio.soundVolumeGet(ref)).toBe(0.4);
        });

        it('soundPitchSet and soundPitchGet round-trip', () => {
            const ref = audio.playSound(createMockAudioBuffer());

            audio.soundPitchSet(ref, 1.5);

            expect(audio.soundPitchGet(ref)).toBe(1.5);
        });

        it('soundPanSet and soundPanGet round-trip', () => {
            const ref = audio.playSound(createMockAudioBuffer());

            audio.soundPanSet(ref, -0.5);

            expect(audio.soundPanGet(ref)).toBe(-0.5);
        });

        it('every accessor reports inert defaults on a manager that was never attached', () => {
            const detachedAudio = new AudioManager();

            expect(detachedAudio.isSoundPlaying(INVALID_SOUND_REF)).toBe(false);
            expect(detachedAudio.soundVolumeGet(INVALID_SOUND_REF)).toBe(1);
            expect(detachedAudio.soundPitchGet(INVALID_SOUND_REF)).toBe(1);
            expect(detachedAudio.soundPanGet(INVALID_SOUND_REF)).toBe(0);
            expect(() => detachedAudio.soundStop(INVALID_SOUND_REF)).not.toThrow();
            expect(() => detachedAudio.soundVolumeSet(INVALID_SOUND_REF, 0.5)).not.toThrow();
        });
    });

    describe('voice pool lifecycle', () => {
        it('stops all voices and closes the context in the right order on detach', async () => {
            audio.attach(canvas);

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            const ref = audio.playSound(createMockAudioBuffer());

            audio.detach();

            expect(audio.getSfxBus()).toBeNull();

            // Re-attaching and asking the (new, empty) pool about the old ref must not throw and
            // must report it as not playing - the old pool instance was discarded on detach.
            audio.attach(canvas);
            expect(() => audio.playSound(createMockAudioBuffer())).not.toThrow();
            expect(ref).not.toEqual(INVALID_SOUND_REF);
            expect(audio.isSoundPlaying(ref)).toBe(false);
        });
    });

    describe('music playback', () => {
        it('drops nothing but remembers the request when locked: musicPlay before unlock', () => {
            audio.attach(canvas);

            audio.musicPlay(createMockAudioBuffer());

            expect(audio.isMusicPlaying()).toBe(false);
            expect(audio.hasRememberedMusicRequest()).toBe(true);

            // No voice was actually started - the request is only remembered, never dropped
            // silently like a pre-unlock playSound() call, but also not started early.
            const context = getMockContext();

            expect((context as unknown as { createBufferSourceCalls: unknown[] }).createBufferSourceCalls).toHaveLength(
                0,
            );
        });

        it('only the latest pending request survives multiple musicPlay calls while locked', async () => {
            audio.attach(canvas);

            const firstBuffer = createMockAudioBuffer();
            const secondBuffer = createMockAudioBuffer();

            audio.musicPlay(firstBuffer);
            audio.musicPlay(secondBuffer);

            const context = getMockContext();

            // Still locked - neither call started a voice yet, only the second overwrote the
            // first as the remembered pending request.
            expect((context as unknown as { createBufferSourceCalls: unknown[] }).createBufferSourceCalls).toHaveLength(
                0,
            );

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            const sources = (context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] })
                .createBufferSourceCalls;

            // Exactly one voice started, and it must be the second (latest) request's buffer -
            // proving "latest wins" concretely instead of only inferring it from a call count.
            expect(sources).toHaveLength(1);
            expect(sources[0]?.buffer).toBe(secondBuffer);
            expect(sources[0]?.buffer).not.toBe(firstBuffer);
        });

        it('starts playback immediately once unlocked', async () => {
            audio.attach(canvas);

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            audio.musicPlay(createMockAudioBuffer());

            expect(audio.isMusicPlaying()).toBe(true);
            expect(audio.hasRememberedMusicRequest()).toBe(false);
        });

        it('starts the remembered request and clears it once the context unlocks', async () => {
            audio.attach(canvas);

            audio.musicPlay(createMockAudioBuffer(), { volume: 0.5 });

            expect(audio.isMusicPlaying()).toBe(false);

            const context = getMockContext();

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            expect(audio.isMusicPlaying()).toBe(true);
            expect(audio.hasRememberedMusicRequest()).toBe(false);

            // The remembered request actually started a live voice, not just flipped the flag.
            const sources = (context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] })
                .createBufferSourceCalls;

            expect(sources).toHaveLength(1);
            expect((sources[0] as unknown as { startCalls: unknown[] }).startCalls).toHaveLength(1);

            // The stored {buffer, options} payload is cleared alongside the boolean flag, so a
            // later unlock attempt (see the test below) can never find a stale request to replay.
            expect((audio as unknown as { pendingMusicRequest: unknown }).pendingMusicRequest).toBeNull();
        });

        it('clears the remembered request and logs distinctly even if starting it throws', async () => {
            audio.attach(canvas);

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            // Invalid loopStart/loopEnd pair - MusicPlayer.play() validates and throws
            // synchronously, which must not be mistaken for a context.resume() failure.
            audio.musicPlay(createMockAudioBuffer(), { loopStart: 5, loopEnd: 1 });

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            expect(audio.hasRememberedMusicRequest()).toBe(false);
            expect((audio as unknown as { pendingMusicRequest: unknown }).pendingMusicRequest).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[BT] Failed to start the remembered music request',
                expect.any(Error),
            );
            expect(consoleErrorSpy).not.toHaveBeenCalledWith(
                '[BT] Failed to resume the audio context',
                expect.anything(),
            );

            consoleErrorSpy.mockRestore();
        });

        it('does not replay a stale remembered request on a later unlock attempt', async () => {
            audio.attach(canvas);

            // Queue a request while locked, then unlock - this replays it exactly once.
            audio.musicPlay(createMockAudioBuffer());

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            const context = getMockContext();

            expect((context as unknown as { createBufferSourceCalls: unknown[] }).createBufferSourceCalls).toHaveLength(
                1,
            );

            // A later gesture must not find a stale remembered request to replay - the source
            // count stays at 1, not 2.
            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            expect((context as unknown as { createBufferSourceCalls: unknown[] }).createBufferSourceCalls).toHaveLength(
                1,
            );
        });

        describe('controls once unlocked', () => {
            beforeEach(async () => {
                audio.attach(canvas);

                canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

                await vi.waitFor(() => {
                    expect(audio.isUnlocked()).toBe(true);
                });
            });

            it('musicStop stops playback', () => {
                audio.musicPlay(createMockAudioBuffer());

                audio.musicStop();

                expect(audio.isMusicPlaying()).toBe(false);
            });

            it('musicStop accepts an optional fadeMs without throwing', () => {
                audio.musicPlay(createMockAudioBuffer());

                expect(() => audio.musicStop(500)).not.toThrow();
            });

            it('musicVolumeSet and musicVolumeGet round-trip', () => {
                audio.musicPlay(createMockAudioBuffer());

                audio.musicVolumeSet(0.4);

                expect(audio.musicVolumeGet()).toBe(0.4);
            });
        });

        it('every accessor reports inert defaults on a manager that was never attached', () => {
            const detachedAudio = new AudioManager();

            expect(detachedAudio.isMusicPlaying()).toBe(false);
            expect(detachedAudio.musicVolumeGet()).toBe(1);
            expect(() => detachedAudio.musicPlay(createMockAudioBuffer())).not.toThrow();
            expect(() => detachedAudio.musicStop()).not.toThrow();
            expect(() => detachedAudio.musicVolumeSet(0.5)).not.toThrow();
        });

        it('detach stops music playback', async () => {
            audio.attach(canvas);

            canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            await vi.waitFor(() => {
                expect(audio.isUnlocked()).toBe(true);
            });

            audio.musicPlay(createMockAudioBuffer());
            audio.detach();

            expect(audio.isMusicPlaying()).toBe(false);
        });
    });
});
