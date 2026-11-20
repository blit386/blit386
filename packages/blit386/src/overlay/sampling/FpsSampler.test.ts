import type { MockInstance } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FpsSampler } from './FpsSampler';

const FRAME_MS = 1000 / 60;

/** Feeds the sampler `count` frames at 60 Hz starting at `startMs`; returns the next timestamp. */
function feedFrames(sampler: FpsSampler, nowSpy: MockInstance<() => number>, startMs: number, count: number): number {
    let now = startMs;

    for (let i = 0; i < count; i++) {
        nowSpy.mockReturnValue(now);
        sampler.sample();
        now += FRAME_MS;
    }

    return now;
}

describe('FpsSampler background-tab gap', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the readout steady across a long rAF pause', () => {
        const nowSpy = vi.spyOn(performance, 'now');
        const sampler = new FpsSampler(60);

        const afterWarmup = feedFrames(sampler, nowSpy, 0, 60);

        nowSpy.mockReturnValue(afterWarmup + 10_000);
        sampler.sample();
        nowSpy.mockReturnValue(afterWarmup + 10_000 + FRAME_MS);
        sampler.sample();

        expect(sampler.measuredFps).toBe(60);
    });

    it('measures the frame after the gap normally', () => {
        const nowSpy = vi.spyOn(performance, 'now');
        const sampler = new FpsSampler(60);

        const afterWarmup = feedFrames(sampler, nowSpy, 0, 60);
        const resumeMs = afterWarmup + 10_000;

        nowSpy.mockReturnValue(resumeMs);
        sampler.sample();
        // 30 FPS cadence after the gap must still move the readout, so #lastSampleMs advanced.
        for (let i = 1; i <= 60; i++) {
            nowSpy.mockReturnValue(resumeMs + i * 2 * FRAME_MS);
            sampler.sample();
        }

        expect(sampler.measuredFps).toBe(30);
    });
});
