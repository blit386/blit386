/**
 * Unit tests for the splash palette ramp and its blackened companion.
 */

import { describe, expect, it } from 'vitest';

import { Color32 } from '../utils/Color32';
import { RAMP_FIRST_SLOT, RAMP_LAST_SLOT, RAMP_PALETTE_SIZE, RAMP_STEPS } from './constants';
import { createBlackened, createRamp } from './ramp';

describe('createRamp', () => {
    it('produces a palette sized for slot 0 plus every ramp step', () => {
        const palette = createRamp();

        expect(palette.size).toBe(RAMP_PALETTE_SIZE);
        expect(RAMP_LAST_SLOT - RAMP_FIRST_SLOT + 1).toBe(RAMP_STEPS);
        expect(RAMP_PALETTE_SIZE).toBeGreaterThan(RAMP_LAST_SLOT);
    });

    it('leaves slot 0 transparent', () => {
        const palette = createRamp();

        expect(palette.get(0).a).toBe(0);
    });

    it('lands exactly on the endpoints by default', () => {
        const palette = createRamp();
        const first = palette.get(RAMP_FIRST_SLOT);
        const last = palette.get(RAMP_LAST_SLOT);

        expect([first.r, first.g, first.b]).toEqual([0, 0, 0]);
        expect([last.r, last.g, last.b]).toEqual([255, 255, 255]);
    });

    it('lands exactly on custom endpoints', () => {
        const palette = createRamp(new Color32(8, 4, 16), new Color32(250, 240, 200));
        const first = palette.get(RAMP_FIRST_SLOT);
        const last = palette.get(RAMP_LAST_SLOT);

        expect([first.r, first.g, first.b]).toEqual([8, 4, 16]);
        expect([last.r, last.g, last.b]).toEqual([250, 240, 200]);
    });

    it('increases monotonically from dark to light', () => {
        const palette = createRamp();

        for (let slot = RAMP_FIRST_SLOT; slot < RAMP_LAST_SLOT; slot++) {
            expect(palette.get(slot + 1).r).toBeGreaterThanOrEqual(palette.get(slot).r);
        }
    });

    it('steps evenly in encoded values, so artwork lands on the step it was drawn as', () => {
        const palette = createRamp();

        // Even spacing in encoded sRGB: step n sits at n / 15 of the way to 255.
        // A linear-light ramp would put step 1 at 73 and leave nothing below it,
        // which is where shadow detail in the logo artwork lives.
        for (let step = 0; step < RAMP_STEPS; step++) {
            const expected = Math.round((step / (RAMP_STEPS - 1)) * 255);

            expect(palette.get(RAMP_FIRST_SLOT + step).r).toBe(expected);
        }
    });

    it('keeps the first step close to black rather than jumping into the midtones', () => {
        const palette = createRamp();

        expect(palette.get(RAMP_FIRST_SLOT + 1).r).toBeLessThan(32);
    });

    it('makes every entry opaque', () => {
        const palette = createRamp();

        for (let slot = RAMP_FIRST_SLOT; slot <= RAMP_LAST_SLOT; slot++) {
            expect(palette.get(slot).a).toBe(255);
        }
    });
});

describe('createBlackened', () => {
    it('returns a same-sized palette with every opaque slot at black', () => {
        const source = createRamp();
        const black = createBlackened(source);

        expect(black.size).toBe(source.size);
        expect(black.get(0).a).toBe(0);

        for (let slot = 1; slot < source.size; slot++) {
            const color = black.get(slot);

            expect([color.r, color.g, color.b]).toEqual([0, 0, 0]);
            expect(color.a).toBe(255);
        }
    });

    it('does not mutate the source palette', () => {
        const source = createRamp();

        createBlackened(source);

        expect(source.get(RAMP_LAST_SLOT).r).toBe(255);
    });
});
