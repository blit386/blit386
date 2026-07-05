import { describe, expect, it } from 'vitest';

import {
    createMockAudioBufferSourceNode,
    createMockAudioContext,
    createMockStereoPannerNode,
    type MockAudioContext,
    setMockCurrentTime,
} from './webaudio-mock';

describe('createMockAudioBufferSourceNode', () => {
    it('records connect, start, and stop calls and exposes playbackRate', () => {
        const source = createMockAudioBufferSourceNode();
        const destination = {} as AudioNode;

        source.connect(destination);
        source.start(1.5);
        source.stop(3);

        expect((source as unknown as { connectCalls: unknown[] }).connectCalls).toEqual([destination]);
        expect((source as unknown as { startCalls: Array<{ when: number }> }).startCalls).toEqual([{ when: 1.5 }]);
        expect((source as unknown as { stopCalls: number[] }).stopCalls).toEqual([3]);
        expect(source.playbackRate.value).toBe(1);
    });

    it('records offset and duration arguments passed to start', () => {
        const source = createMockAudioBufferSourceNode();

        source.start(1.5, 0.25, 2);

        expect(
            (source as unknown as { startCalls: Array<{ when: number; offset?: number; duration?: number }> })
                .startCalls,
        ).toEqual([{ when: 1.5, offset: 0.25, duration: 2 }]);
    });

    it('throws when started twice', () => {
        const source = createMockAudioBufferSourceNode();

        source.start(0);

        expect(() => source.start(0)).toThrow();
    });

    it('supports assigning onended', () => {
        const source = createMockAudioBufferSourceNode();
        let fired = false;

        source.onended = () => {
            fired = true;
        };

        (source.onended as () => void)();

        expect(fired).toBe(true);
    });
});

describe('createMockStereoPannerNode', () => {
    it('records connect calls and exposes pan', () => {
        const panner = createMockStereoPannerNode();
        const destination = {} as AudioNode;

        panner.connect(destination);

        expect((panner as unknown as { connectCalls: unknown[] }).connectCalls).toEqual([destination]);
        expect(panner.pan.value).toBe(0);
    });
});

describe('createMockAudioContext', () => {
    it('tracks createBufferSource and createStereoPanner calls', () => {
        const context = createMockAudioContext();

        const source = context.createBufferSource();
        const panner = context.createStereoPanner();

        const mockContext = context as unknown as MockAudioContext;

        expect(mockContext.createBufferSourceCalls).toEqual([source]);
        expect(mockContext.createStereoPannerCalls).toEqual([panner]);
    });

    it('starts at currentTime 0', () => {
        const context = createMockAudioContext();

        expect(context.currentTime).toBe(0);
    });
});

describe('setMockCurrentTime', () => {
    it('advances a mock context currentTime', () => {
        const context = createMockAudioContext();

        setMockCurrentTime(context, 12.5);

        expect(context.currentTime).toBe(12.5);
    });
});
