/**
 * Unit tests for the generated splash logo data module.
 *
 * Guards the invariants `SpriteSheet.fromIndexedPixels` depends on: one byte per
 * pixel, and every index inside the splash ramp.
 */

import { describe, expect, it } from 'vitest';

import { RAMP_LAST_SLOT } from './constants';
import { LOGO_HEIGHT, LOGO_PIXELS, LOGO_WIDTH } from './logoData';

describe('logoData', () => {
    it('holds exactly one byte per pixel', () => {
        expect(LOGO_PIXELS.length).toBe(LOGO_WIDTH * LOGO_HEIGHT);
    });

    it('has non-zero dimensions', () => {
        expect(LOGO_WIDTH).toBeGreaterThan(0);
        expect(LOGO_HEIGHT).toBeGreaterThan(0);
    });

    it('keeps every index inside the splash ramp', () => {
        for (const index of LOGO_PIXELS) {
            expect(Number.isInteger(index)).toBe(true);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThanOrEqual(RAMP_LAST_SLOT);
        }
    });

    it('draws something other than an empty rectangle', () => {
        expect(LOGO_PIXELS.some((index) => index > 0)).toBe(true);
    });
});
