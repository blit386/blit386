// @vitest-environment happy-dom

/**
 * Unit tests for {@link MusicPlayer}.
 *
 * Constructs a `MusicPlayer` directly against a mock `AudioContext` and a mock `music` bus gain
 * node (see `src/__test__/webaudio-mock.ts`), mirroring how `AudioManager.attach()` wires it up
 * without needing a full `AudioManager` instance.
 */

import { describe, expect, it } from 'vitest';

import {
    createMockAudioBuffer,
    createMockAudioContext,
    type MockGainNode,
    setMockCurrentTime,
} from '../__test__/webaudio-mock';
import { MusicPlayer } from './MusicPlayer';

/** Casts a `GainNode` back to its mock tracking shape. */
const asMockGain = (node: GainNode): MockGainNode => node as unknown as MockGainNode;

/** Casts an `AudioBufferSourceNode` back to its mock tracking shape. */
const asMockSource = (
    node: AudioBufferSourceNode,
): AudioBufferSourceNode & {
    connectCalls: unknown[];
    startCalls: Array<{ when: number }>;
    stopCalls: number[];
    onended: (() => void) | null;
} =>
    node as unknown as AudioBufferSourceNode & {
        connectCalls: unknown[];
        startCalls: Array<{ when: number }>;
        stopCalls: number[];
        onended: (() => void) | null;
    };

/** Builds a fresh `MusicPlayer` wired to a fresh mock context and music bus. */
function createPlayer(): { player: MusicPlayer; context: AudioContext; musicBus: GainNode } {
    const context = createMockAudioContext();
    const musicBus = context.createGain();

    return { player: new MusicPlayer(context, musicBus), context, musicBus };
}

describe('MusicPlayer', () => {
    describe('play - node graph', () => {
        it('connects a fresh voice gain to the injected music bus', () => {
            const { player, context, musicBus } = createPlayer();

            player.play(createMockAudioBuffer());

            const context2 = context as unknown as { createGainCalls: GainNode[] };
            const voiceGain = context2.createGainCalls.at(-1);

            expect(voiceGain).toBeDefined();
            expect(asMockGain(voiceGain as GainNode).connectCalls).toEqual([musicBus]);
        });

        it('connects the source through the voice gain', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer());

            const context2 = context as unknown as {
                createBufferSourceCalls: AudioBufferSourceNode[];
                createGainCalls: GainNode[];
            };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;
            const voiceGain = context2.createGainCalls.at(-1) as GainNode;

            expect(asMockSource(source).connectCalls).toEqual([voiceGain]);
        });

        it('sets buffer on the source node', () => {
            const { player, context } = createPlayer();
            const buffer = createMockAudioBuffer();

            player.play(buffer);

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(source.buffer).toBe(buffer);
        });
    });

    describe('play - volume defaults', () => {
        it('defaults volume to 1 immediately (no fade)', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer());

            const context2 = context as unknown as { createGainCalls: GainNode[] };
            const voiceGain = context2.createGainCalls.at(-1) as GainNode;

            expect(voiceGain.gain.value).toBe(1);
        });

        it('applies a custom volume immediately (no fade)', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { volume: 0.4 });

            const context2 = context as unknown as { createGainCalls: GainNode[] };
            const voiceGain = context2.createGainCalls.at(-1) as GainNode;

            expect(voiceGain.gain.value).toBe(0.4);
        });

        it('starts the source at the current audio-clock time with no fade', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 3);
            player.play(createMockAudioBuffer());

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(asMockSource(source).startCalls).toEqual([{ when: 3 }]);
        });
    });

    describe('play - loop options', () => {
        it('defaults to looping the whole track', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer());

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(source.loop).toBe(true);
        });

        it('honors loop: false for a one-shot', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { loop: false });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(source.loop).toBe(false);
        });

        it('sets loopStart/loopEnd and forces loop true when both are given', () => {
            const { player, context } = createPlayer();
            const buffer = createMockAudioBuffer(1, 10, 10); // duration 1s at sampleRate 10

            player.play(buffer, { loopStart: 0.2, loopEnd: 0.8, loop: false });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(source.loop).toBe(true);
            expect(source.loopStart).toBe(0.2);
            expect(source.loopEnd).toBe(0.8);
        });

        it('throws when only loopStart is given', () => {
            const { player } = createPlayer();
            const buffer = createMockAudioBuffer(1, 10, 10);

            expect(() => player.play(buffer, { loopStart: 0.2 })).toThrow(/loopStart and loopEnd/);
        });

        it('throws when only loopEnd is given', () => {
            const { player } = createPlayer();
            const buffer = createMockAudioBuffer(1, 10, 10);

            expect(() => player.play(buffer, { loopEnd: 0.8 })).toThrow(/loopStart and loopEnd/);
        });

        it('throws when loopStart is negative', () => {
            const { player } = createPlayer();
            const buffer = createMockAudioBuffer(1, 10, 10);

            expect(() => player.play(buffer, { loopStart: -0.1, loopEnd: 0.5 })).toThrow(/invalid loop region/);
        });

        it('throws when loopStart is not less than loopEnd', () => {
            const { player } = createPlayer();
            const buffer = createMockAudioBuffer(1, 10, 10);

            expect(() => player.play(buffer, { loopStart: 0.5, loopEnd: 0.5 })).toThrow(/invalid loop region/);
        });

        it('throws when loopEnd exceeds buffer duration', () => {
            const { player } = createPlayer();
            const buffer = createMockAudioBuffer(1, 10, 10);

            expect(() => player.play(buffer, { loopStart: 0, loopEnd: 5 })).toThrow(/invalid loop region/);
        });

        it('does not start any voice when loop validation fails', () => {
            const { player, context } = createPlayer();
            const buffer = createMockAudioBuffer(1, 10, 10);

            expect(() => player.play(buffer, { loopStart: 5, loopEnd: 1 })).toThrow();
            expect(player.isPlaying()).toBe(false);

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };

            expect(context2.createBufferSourceCalls).toHaveLength(0);
        });
    });

    describe('play - fade-in', () => {
        it('ramps gain from silence over fadeMs with linear easing by default', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { volume: 0.9, fadeMs: 200 });

            const context2 = context as unknown as { createGainCalls: GainNode[] };
            const voiceGain = asMockGain(context2.createGainCalls.at(-1) as GainNode);

            expect(voiceGain.gain.setValueAtTimeCalls).toEqual([{ value: 0, startTime: 0 }]);
            expect(voiceGain.gain.linearRampToValueAtTimeCalls).toEqual([{ value: 0.9, endTime: 0.2 }]);
        });

        it('uses setValueCurveAtTime for a non-linear easeIn', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { volume: 0.9, fadeMs: 200, easeIn: 'ease-out' });

            const context2 = context as unknown as { createGainCalls: GainNode[] };
            const voiceGain = asMockGain(context2.createGainCalls.at(-1) as GainNode);

            expect(voiceGain.gain.setValueCurveAtTimeCalls).toHaveLength(1);
        });

        it('starts the source at the current time even when fading in (overlap defaults to simultaneous)', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 5);
            player.play(createMockAudioBuffer(), { fadeMs: 500 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(asMockSource(source).startCalls).toEqual([{ when: 5 }]);
        });
    });

    describe('crossfade timing on replace', () => {
        it('fades the previous voice out starting immediately at now', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 10);
            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            const context2 = context as unknown as {
                createGainCalls: GainNode[];
                createBufferSourceCalls: AudioBufferSourceNode[];
            };
            const firstGain = asMockGain(context2.createGainCalls.at(-1) as GainNode);
            const firstSource = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            player.play(createMockAudioBuffer(), { fadeMs: 400, overlap: 1 });

            expect(firstGain.gain.linearRampToValueAtTimeCalls).toEqual([{ value: 0, endTime: 10.4 }]);
            expect(asMockSource(firstSource).stopCalls).toEqual([10.4]);
        });

        it('overlap 1 starts the fade-in at the same time as the fade-out (simultaneous)', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 10);
            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            player.play(createMockAudioBuffer(), { fadeMs: 400, overlap: 1 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const secondSource = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(asMockSource(secondSource).startCalls).toEqual([{ when: 10 }]);
        });

        it('overlap 0 starts the fade-in exactly when the fade-out ends (sequential)', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 10);
            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            player.play(createMockAudioBuffer(), { fadeMs: 400, overlap: 0 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const secondSource = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(asMockSource(secondSource).startCalls).toEqual([{ when: 10.4 }]);
        });

        it('overlap -1 inserts a silence gap of fadeMs between fade-out end and fade-in start', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 10);
            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            player.play(createMockAudioBuffer(), { fadeMs: 400, overlap: -1 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const secondSource = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(asMockSource(secondSource).startCalls).toEqual([{ when: 10.8 }]);
        });

        it('interpolates intermediate overlap values', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 0);
            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            player.play(createMockAudioBuffer(), { fadeMs: 1000, overlap: 0.5 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const secondSource = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(asMockSource(secondSource).startCalls).toEqual([{ when: 0.5 }]);
        });

        it('clamps an out-of-range overlap above 1', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 0);
            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            player.play(createMockAudioBuffer(), { fadeMs: 400, overlap: 5 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const secondSource = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(asMockSource(secondSource).startCalls).toEqual([{ when: 0 }]);
        });

        it('clamps an out-of-range overlap below -1', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 0);
            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            player.play(createMockAudioBuffer(), { fadeMs: 400, overlap: -5 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const secondSource = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            expect(asMockSource(secondSource).startCalls).toEqual([{ when: 0.8 }]);
        });

        it('uses a non-linear easeOut for the outgoing fade', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            const context2 = context as unknown as { createGainCalls: GainNode[] };
            const firstGain = asMockGain(context2.createGainCalls.at(-1) as GainNode);

            player.play(createMockAudioBuffer(), { fadeMs: 400, easeOut: 'ease-in' });

            expect(firstGain.gain.setValueCurveAtTimeCalls).toHaveLength(1);
        });

        it('does not fade out anything on the very first play (no previous track)', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { fadeMs: 400 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };

            expect(context2.createBufferSourceCalls).toHaveLength(1);
        });
    });

    describe('replace-while-fading', () => {
        it('immediately stops a still-fading previous voice when play() is called again', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { fadeMs: 0 });
            player.play(createMockAudioBuffer(), { fadeMs: 1000, overlap: 0 }); // creates a previous voice mid-fade

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const stillFadingSource = context2.createBufferSourceCalls.at(1) as AudioBufferSourceNode;

            player.play(createMockAudioBuffer(), { fadeMs: 0 }); // third call while the 2nd is still fading in as current->previous

            // The voice started by the 2nd call becomes the previous voice of the 3rd call and
            // must be force-stopped immediately (stop with no scheduled time), not scheduled.
            expect(asMockSource(stillFadingSource).stopCalls).toEqual([0]);
        });

        it('never leaves more than one previous voice live', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { fadeMs: 1000 });
            player.play(createMockAudioBuffer(), { fadeMs: 1000 });
            player.play(createMockAudioBuffer(), { fadeMs: 1000 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };

            expect(context2.createBufferSourceCalls).toHaveLength(3);
            expect(player.isPlaying()).toBe(true);
        });
    });

    describe('stop', () => {
        it('isPlaying is false before any play() call', () => {
            const { player } = createPlayer();

            expect(player.isPlaying()).toBe(false);
        });

        it('isPlaying is true after play()', () => {
            const { player } = createPlayer();

            player.play(createMockAudioBuffer());

            expect(player.isPlaying()).toBe(true);
        });

        it('isPlaying is false immediately after stop(), even with a fade in progress', () => {
            const { player } = createPlayer();

            player.play(createMockAudioBuffer());
            player.stop(500);

            expect(player.isPlaying()).toBe(false);
        });

        it('stop() with no fadeMs stops the source immediately', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer());

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            player.stop();

            expect(asMockSource(source).stopCalls).toEqual([0]);
        });

        it('stop(fadeMs) ramps gain to 0 and schedules a delayed stop', () => {
            const { player, context } = createPlayer();

            setMockCurrentTime(context, 2);
            player.play(createMockAudioBuffer());

            const context2 = context as unknown as {
                createGainCalls: GainNode[];
                createBufferSourceCalls: AudioBufferSourceNode[];
            };
            const gain = asMockGain(context2.createGainCalls.at(-1) as GainNode);
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            player.stop(500);

            expect(gain.gain.linearRampToValueAtTimeCalls).toEqual([{ value: 0, endTime: 2.5 }]);
            expect(asMockSource(source).stopCalls).toEqual([2.5]);
        });

        it('stop() also releases a voice that was still crossfading out', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { fadeMs: 0 });
            player.play(createMockAudioBuffer(), { fadeMs: 1000 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const fadingPrevious = context2.createBufferSourceCalls.at(0) as AudioBufferSourceNode;

            player.stop();

            // Already had a scheduled stop (endTime 1) from being demoted to previous by the 2nd
            // play() call; stop() force-releases it immediately on top of that, so the source
            // sees both calls (a real AudioBufferSourceNode lets the later stop() win).
            expect(asMockSource(fadingPrevious).stopCalls).toEqual([1, 0]);
        });

        it('is a no-op when nothing is playing', () => {
            const { player } = createPlayer();

            expect(() => player.stop()).not.toThrow();
            expect(() => player.stop(500)).not.toThrow();
        });
    });

    describe('volume', () => {
        it('defaults to 1 before any play()', () => {
            const { player } = createPlayer();

            expect(player.volumeGet()).toBe(1);
        });

        it('reflects the volume passed to play()', () => {
            const { player } = createPlayer();

            player.play(createMockAudioBuffer(), { volume: 0.6 });

            expect(player.volumeGet()).toBe(0.6);
        });

        it('volumeSet updates the reported volume', () => {
            const { player } = createPlayer();

            player.play(createMockAudioBuffer());
            player.volumeSet(0.3);

            expect(player.volumeGet()).toBe(0.3);
        });

        it('volumeSet applies immediately to the current voice gain with no fadeMs', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer());

            const context2 = context as unknown as { createGainCalls: GainNode[] };
            const gain = asMockGain(context2.createGainCalls.at(-1) as GainNode);

            player.volumeSet(0.25);

            expect(gain.gain.value).toBe(0.25);
        });

        it('volumeSet ramps the current voice gain over fadeMs', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer());

            const context2 = context as unknown as { createGainCalls: GainNode[] };
            const gain = asMockGain(context2.createGainCalls.at(-1) as GainNode);

            player.volumeSet(0.2, 100);

            expect(gain.gain.linearRampToValueAtTimeCalls).toHaveLength(1);
        });

        it('volumeSet before any play() does not throw and still updates volumeGet', () => {
            const { player } = createPlayer();

            expect(() => player.volumeSet(0.5)).not.toThrow();
            expect(player.volumeGet()).toBe(0.5);
        });

        it('volumeGet keeps the last value after stop()', () => {
            const { player } = createPlayer();

            player.play(createMockAudioBuffer(), { volume: 0.7 });
            player.stop();

            expect(player.volumeGet()).toBe(0.7);
        });
    });

    describe('natural completion and onended guards', () => {
        it('recycles the current voice when its source ends naturally', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { loop: false });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;

            (asMockSource(source).onended as () => void)();

            expect(player.isPlaying()).toBe(false);
        });

        it('disconnects the ended source and gain', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { loop: false });

            const context2 = context as unknown as {
                createBufferSourceCalls: AudioBufferSourceNode[];
                createGainCalls: GainNode[];
            };
            const source = context2.createBufferSourceCalls.at(-1) as AudioBufferSourceNode;
            const gain = context2.createGainCalls.at(-1) as GainNode;

            const sourceDisconnectCalls: unknown[] = [];
            const originalDisconnect = source.disconnect.bind(source);

            source.disconnect = (...args: unknown[]) => {
                sourceDisconnectCalls.push(args);

                return (originalDisconnect as (...innerArgs: unknown[]) => unknown)(...args);
            };

            let gainDisconnected = false;

            gain.disconnect = () => {
                gainDisconnected = true;
            };

            (asMockSource(source).onended as () => void)();

            expect(sourceDisconnectCalls).toHaveLength(1);
            expect(gainDisconnected).toBe(true);
        });

        it('a stale onended from a force-stopped previous voice does not clobber the new current voice', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const firstSource = context2.createBufferSourceCalls.at(0) as AudioBufferSourceNode;

            player.play(createMockAudioBuffer(), { fadeMs: 1000 }); // first -> previous, mid-fade
            player.play(createMockAudioBuffer(), { fadeMs: 0 }); // force-stops the stale previous (firstSource)

            (asMockSource(firstSource).onended as () => void)();

            expect(player.isPlaying()).toBe(true);
        });

        it('a stale onended from a replaced current voice does not clear the new current voice', () => {
            const { player, context } = createPlayer();

            player.play(createMockAudioBuffer(), { fadeMs: 0 });

            const context2 = context as unknown as { createBufferSourceCalls: AudioBufferSourceNode[] };
            const firstSource = context2.createBufferSourceCalls.at(0) as AudioBufferSourceNode;

            player.play(createMockAudioBuffer(), { fadeMs: 0 }); // firstSource is now the previous voice

            (asMockSource(firstSource).onended as () => void)();

            expect(player.isPlaying()).toBe(true);
        });
    });
});
