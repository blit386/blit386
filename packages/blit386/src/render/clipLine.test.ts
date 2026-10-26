import { describe, expect, it } from 'vitest';

import { walkBresenham } from '../__test__/bresenham';
import type { ClippedLine } from './clipLine';
import { clipBresenhamLine } from './clipLine';

/** Walks a clipped line the way the backends do: `steps` pixels from the clipped start and error term. */
function walkClipped(x0: number, y0: number, x1: number, y1: number, clip: ClippedLine): number[] {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = clip.err;
    let cx = clip.x;
    let cy = clip.y;
    const out: number[] = [];

    for (let i = 0; i < clip.steps; i++) {
        out.push(cx, cy);

        const e2 = err * 2;

        if (e2 > -dy) {
            err -= dy;
            cx += sx;
        }

        if (e2 < dx) {
            err += dx;
            cy += sy;
        }
    }

    return out;
}

function newClip(): ClippedLine {
    return { x: 0, y: 0, err: 0, steps: 0 };
}

describe('clipBresenhamLine', () => {
    it('matches the un-clipped pixels inside the viewport for every small line and window', () => {
        const clip = newClip();
        const range = [-6, -3, 0, 2, 5, 9, 14];
        const windows = [
            [0, 0, 7, 7],
            [2, 1, 5, 6],
            [3, 3, 3, 3],
            [-4, -2, 1, 3],
        ] as const;

        for (const [minX, minY, maxX, maxY] of windows) {
            for (const x0 of range) {
                for (const y0 of range) {
                    for (const x1 of range) {
                        for (const y1 of range) {
                            const expected = walkBresenham(x0, y0, x1, y1, { minX, minY, maxX, maxY });
                            const hit = clipBresenhamLine(x0, y0, x1, y1, minX, minY, maxX, maxY, clip);
                            const actual = hit ? walkClipped(x0, y0, x1, y1, clip) : [];

                            expect(actual, `(${x0},${y0})-(${x1},${y1}) in [${minX},${minY},${maxX},${maxY}]`).toEqual(
                                expected,
                            );
                        }
                    }
                }
            }
        }
    });

    it('matches on random long lines that cross a viewport corner', () => {
        const clip = newClip();
        let seed = 12345;
        const next = (): number => {
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0;

            return (seed >>> 8) % 400;
        };

        for (let i = 0; i < 300; i++) {
            const x0 = next() - 200;
            const y0 = next() - 200;
            const x1 = next() - 200;
            const y1 = next() - 200;

            const expected = walkBresenham(x0, y0, x1, y1, { minX: 0, minY: 0, maxX: 63, maxY: 47 });
            const hit = clipBresenhamLine(x0, y0, x1, y1, 0, 0, 63, 47, clip);

            expect(hit ? walkClipped(x0, y0, x1, y1, clip) : []).toEqual(expected);
        }
    });

    it('returns false for a line that never enters the viewport', () => {
        expect(clipBresenhamLine(-50, -50, -10, -20, 0, 0, 7, 7, newClip())).toBe(false);
    });

    it('does bounded work for a 2,000,000-pixel line', () => {
        const clip = newClip();

        expect(clipBresenhamLine(0, 0, 2_000_000, 1, 0, 0, 319, 239, clip)).toBe(true);
        expect(clip.steps).toBeLessThanOrEqual(320);
    });

    it('picks the exact first and last visible pixel on a 2,000,000,000-pixel line', () => {
        // Too long to walk, so check the contract against exact BigInt arithmetic instead of a reference walk.
        const major = 2_000_000_000n;
        const minor = 1_234_567_891n;
        const step = (j: bigint): bigint => (2n * minor * j + major - 1n) / (2n * major);
        const windows = [
            { minX: 0, minY: 0, maxX: 15, maxY: 15 },
            { minX: 1_999_999_000, minY: 1_234_567_000, maxX: 1_999_999_990, maxY: 1_234_567_800 },
            { minX: 1_000_000_000, minY: 617_283_940, maxX: 1_000_000_020, maxY: 617_283_960 },
        ];
        const clip = newClip();

        for (const { minX, minY, maxX, maxY } of windows) {
            const isInside = (j: bigint): boolean => {
                const y = step(j);

                return j >= BigInt(minX) && j <= BigInt(maxX) && y >= BigInt(minY) && y <= BigInt(maxY);
            };

            expect(clipBresenhamLine(0, 0, Number(major), Number(minor), minX, minY, maxX, maxY, clip)).toBe(true);

            const first = BigInt(clip.x);
            const last = first + BigInt(clip.steps) - 1n;

            expect(isInside(first)).toBe(true);
            expect(first === 0n || !isInside(first - 1n)).toBe(true);
            expect(isInside(last)).toBe(true);
            expect(last === major || !isInside(last + 1n)).toBe(true);
            expect(BigInt(clip.y)).toBe(step(first));
            expect(BigInt(clip.err)).toBe(major - minor - first * minor + step(first) * major);
        }
    });
});
