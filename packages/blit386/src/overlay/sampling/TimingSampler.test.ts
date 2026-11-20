import { describe, expect, it } from 'vitest';

import type { OverlayTimingSnapshot } from '../types';
import { TimingSampler } from './TimingSampler';

function sample(overrides: Partial<OverlayTimingSnapshot> = {}): OverlayTimingSnapshot {
    return {
        frameMs: 16.7,
        updateMs: 1,
        renderMs: 2,
        updateSteps: 1,
        drawCalls: 10,
        droppedFrames: 0,
        primitiveOverflowCount: 0,
        spriteOverflowCount: 0,
        primitiveSubmittedVertices: 0,
        spriteSubmittedVertices: 0,
        ...overrides,
    };
}

describe('TimingSampler.formatRendererDiagnosticsLabel', () => {
    it('pads each count to its fixed field width', () => {
        const sampler = new TimingSampler();

        sampler.sample(
            sample({ primitiveSubmittedVertices: 12, primitiveOverflowCount: 3, spriteSubmittedVertices: 456 }),
        );

        expect(sampler.formatRendererDiagnosticsLabel()).toBe('Prim    12v ov   3|Spr   456v ov   0');
    });

    it('rebuilds the label when any single count changes between calls', () => {
        const sampler = new TimingSampler();

        sampler.sample(sample());
        expect(sampler.formatRendererDiagnosticsLabel()).toBe('Prim     0v ov   0|Spr     0v ov   0');

        const changes: [Partial<OverlayTimingSnapshot>, string][] = [
            [{ primitiveSubmittedVertices: 7 }, 'Prim     7v ov   0|Spr     0v ov   0'],
            [{ primitiveOverflowCount: 2 }, 'Prim     0v ov   2|Spr     0v ov   0'],
            [{ spriteSubmittedVertices: 9 }, 'Prim     0v ov   0|Spr     9v ov   0'],
            [{ spriteOverflowCount: 4 }, 'Prim     0v ov   0|Spr     0v ov   4'],
        ];

        for (const [override, expected] of changes) {
            sampler.sample(sample(override));
            expect(sampler.formatRendererDiagnosticsLabel()).toBe(expected);
            sampler.sample(sample());
            expect(sampler.formatRendererDiagnosticsLabel()).toBe('Prim     0v ov   0|Spr     0v ov   0');
        }
    });
});
