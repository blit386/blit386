import { describe, expect, it } from 'vitest';

import {
    createMockAudioBufferSourceNode,
    createMockAudioContext,
    createMockStereoPannerNode,
    type MockAudioContext,
} from './webaudio-mock';

describe('createMockAudioBufferSourceNode', () => {
    it('records connect, start, and stop calls and exposes playbackRate', () => {
        const source = createMockAudioBufferSourceNode();
        const destination = {} as AudioNode;

        source.connect(destination);
        source.start(1.5);
        source.stop(3);

        expect((source as unknown as { connectCalls: unknown[] }).connectCalls).toEqual([destination]);
        expect((source as unknown as { startCalls: number[] }).startCalls).toEqual([1.5]);
        expect((source as unknown as { stopCalls: number[] }).stopCalls).toEqual([3]);
        expect(source.playbackRate.value).toBe(1);
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
});
