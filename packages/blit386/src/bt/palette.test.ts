// @vitest-environment happy-dom

/**
 * Unit tests for the `BT` members defined in `src/bt/palette.ts`: the active palette, palette effects, BT.random.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withErrorContainer } from '../__test__/btFacadeFixtures';
import { BT, Palette, Random } from '../BLIT386';
import { BTAPI } from '../core/BTAPI';
import { DEFAULT_CONTAINER_ID } from '../utils/BootstrapHelpers';

describe('BT.paletteCreate', () => {
    it('creates a palette with the requested size', () => {
        const palette = BT.paletteCreate(16);

        expect(palette).toBeInstanceOf(Palette);
        expect(palette.size).toBe(16);
    });
});

describe('BT.paletteSet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.setPalette', () => {
        const spy = vi.spyOn(BTAPI.instance.palettes, 'setPalette').mockReturnValue(undefined);
        const palette = new Palette(16);

        BT.paletteSet(palette);

        expect(spy).toHaveBeenCalledWith(palette);
    });

    it('shows a beginner-friendly error when passed undefined', async () => {
        await withErrorContainer(async () => {
            BT.paletteSet(undefined as never);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('BT.paletteSet expects a Palette');
        });
    });

    it('shows a beginner-friendly error when passed null', async () => {
        await withErrorContainer(async () => {
            BT.paletteSet(null as never);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('BT.paletteSet expects a Palette');
        });
    });
});

describe('BT.palette', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns palette when one is set', () => {
        const palette = new Palette(16);

        vi.spyOn(BTAPI.instance.palettes, 'getPalette').mockReturnValue(palette);

        expect(BT.palette).toBe(palette);
    });

    it('throws when no palette is set', () => {
        vi.spyOn(BTAPI.instance.palettes, 'getPalette').mockReturnValue(null);

        expect(() => BT.palette).toThrow('No palette set yet. Call BT.paletteSet');
    });
});

describe('BT.random', () => {
    it('returns the same live instance across reads', () => {
        expect(BT.random).toBeInstanceOf(Random);
        expect(BT.random).toBe(BT.random);
    });
});

describe('BT.randomSeed', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.randomSeed', () => {
        const spy = vi.spyOn(BTAPI.instance, 'randomSeed').mockReturnValue(undefined);

        BT.randomSeed(42);

        expect(spy).toHaveBeenCalledWith(42);
    });

    it('makes a fixed call sequence reproducible', () => {
        BT.randomSeed(1234);
        const first = [BT.random.next(), BT.random.int(10, 20), BT.random.float(0, 1)];

        BT.randomSeed(1234);
        const second = [BT.random.next(), BT.random.int(10, 20), BT.random.float(0, 1)];

        const expected = new Random(1234);
        const reference = [expected.next(), expected.int(10, 20), expected.float(0, 1)];

        expect(first).toEqual(reference);
        expect(second).toEqual(reference);
    });
});

describe('BT.paletteFadeExposure', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.paletteFadeExposure', () => {
        const spy = vi.spyOn(BTAPI.instance.palettes, 'paletteFadeExposure').mockReturnValue(undefined);
        const target = new Palette(16);

        BT.paletteFadeExposure(target, 500);

        expect(spy).toHaveBeenCalledWith(target, 500, undefined);
    });

    it('passes the options bag through unchanged', () => {
        const spy = vi.spyOn(BTAPI.instance.palettes, 'paletteFadeExposure').mockReturnValue(undefined);
        const target = new Palette(16);
        const options = { highlightLead: 0.8, easing: 'ease-in-out' } as const;

        BT.paletteFadeExposure(target, 500, options);

        expect(spy).toHaveBeenCalledWith(target, 500, options);
    });
});

describe('BT.randomSeed validation', () => {
    it('throws a RangeError for NaN and keeps the current stream', () => {
        BT.randomSeed(42);

        const expected = new Random(42).next();

        expect(() => BT.randomSeed(Number.NaN)).toThrow(RangeError);
        expect(BT.random.next()).toBe(expected);
    });
});
