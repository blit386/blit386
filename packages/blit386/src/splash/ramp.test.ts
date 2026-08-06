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

    it('steps evenly in linear light, not in encoded values', () => {
        const palette = createRamp();
        // The midpoint of a linear-light black-to-white ramp encodes to roughly
        // 0.5 ^ (1 / 2.2) * 255, well above the encoded midpoint of 128.
        const midpoint = palette.get(RAMP_FIRST_SLOT + Math.floor(RAMP_STEPS / 2) - 1);

        expect(midpoint.r).toBeGreaterThan(150);
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
