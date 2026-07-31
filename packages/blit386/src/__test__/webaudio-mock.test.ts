import { describe, expect, it } from 'vitest';

import {
    createMockAudioBuffer,
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

    it('creates a buffer via createBuffer with the requested shape and tracks the call', () => {
        const context = createMockAudioContext();

        const buffer = context.createBuffer(1, 100, 8000);

        const mockContext = context as unknown as MockAudioContext;

        expect(buffer.numberOfChannels).toBe(1);
        expect(buffer.length).toBe(100);
        expect(buffer.sampleRate).toBe(8000);
        expect(mockContext.createBufferCalls).toEqual([{ numberOfChannels: 1, length: 100, sampleRate: 8000 }]);
    });
});

describe('createMockAudioBuffer', () => {
    it('defaults to a single silent zero-length channel', () => {
        const buffer = createMockAudioBuffer();

        expect(buffer.numberOfChannels).toBe(1);
        expect(buffer.length).toBe(0);
        expect(buffer.duration).toBe(0);
        expect(buffer.getChannelData(0)).toEqual(new Float32Array(0));
    });

    it('allocates independent per-channel storage for the requested shape', () => {
        const buffer = createMockAudioBuffer(2, 4, 8000);

        expect(buffer.numberOfChannels).toBe(2);
        expect(buffer.length).toBe(4);
        expect(buffer.sampleRate).toBe(8000);
        expect(buffer.duration).toBeCloseTo(4 / 8000, 10);
        expect(buffer.getChannelData(0)).toEqual(new Float32Array(4));
        expect(buffer.getChannelData(1)).toEqual(new Float32Array(4));
    });

    it('reflects copyToChannel writes back through getChannelData', () => {
        const buffer = createMockAudioBuffer(1, 4);

        buffer.copyToChannel(new Float32Array([0.1, 0.2, 0.3, 0.4]), 0);

        expect(buffer.getChannelData(0)).toEqual(new Float32Array([0.1, 0.2, 0.3, 0.4]));
    });
});

describe('setMockCurrentTime', () => {
    it('advances a mock context currentTime', () => {
        const context = createMockAudioContext();

        setMockCurrentTime(context, 12.5);

        expect(context.currentTime).toBe(12.5);
    });
});
