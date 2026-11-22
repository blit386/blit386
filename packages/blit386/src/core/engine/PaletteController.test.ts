/**
 * Unit tests for `src/core/engine/PaletteController.ts`, driven through `BTAPI`: palette exposure fades, flashes,
 * splash palette capture, and effect ranges.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { activeEffectCount, resetSingleton } from '../../__test__/btapiFixtures';
import { Palette } from '../../assets/Palette';
import { PaletteEffectManager } from '../../assets/PaletteEffect';
import { registerIndexedSheet, type SpriteSheet, unregisterIndexedSheet } from '../../assets/SpriteSheet';
import { HANDOFF_FADE_MS } from '../../splash';
import { RAMP_PALETTE_SIZE } from '../../splash/constants';
import { Color32 } from '../../utils/Color32';
import {
    PALETTE_EFFECT_SLOT_ZERO_MESSAGE,
    paletteEffectEndOutOfRangeError,
    paletteFlashColorError,
} from '../../utils/errorMessages';
import { BTAPI } from '../BTAPI';

describe('BTAPI.paletteFadeExposure', () => {
    afterEach(() => {
        BTAPI.instance.palettes.paletteClearEffects();
    });

    it('registers an effect when a palette is active', () => {
        BTAPI.instance.palettes.setPalette(new Palette(16));
        BTAPI.instance.palettes.paletteClearEffects();

        BTAPI.instance.palettes.paletteFadeExposure(new Palette(16), 500);

        expect(activeEffectCount()).toBe(1);
    });

    it('accepts a highlight lead and easing curve', () => {
        BTAPI.instance.palettes.setPalette(new Palette(16));
        BTAPI.instance.palettes.paletteClearEffects();

        expect(() =>
            BTAPI.instance.palettes.paletteFadeExposure(new Palette(16), 500, {
                highlightLead: 0.75,
                easing: 'ease-out',
            }),
        ).not.toThrow();
    });

    it('throws for a non-finite duration', () => {
        BTAPI.instance.palettes.setPalette(new Palette(16));

        expect(() => BTAPI.instance.palettes.paletteFadeExposure(new Palette(16), NaN)).toThrow(/paletteFadeExposure/);
    });
});

describe('BTAPI.paletteFlash (BT-759)', () => {
    afterEach(() => {
        BTAPI.instance.palettes.paletteClearEffects();
    });

    it.each([null, undefined, 'white'])('rejects %s as the color at the call, not on a later tick', (color) => {
        BTAPI.instance.palettes.setPalette(new Palette(16));
        BTAPI.instance.palettes.paletteClearEffects();

        expect(() => BTAPI.instance.palettes.paletteFlash(color as unknown as Color32, 100)).toThrow(
            paletteFlashColorError(color),
        );
        expect(activeEffectCount()).toBe(0);
    });
});

describe('BTAPI splash palette capture', () => {
    let now = 0;

    /**
     * Replaces the private effect manager with one on a fake clock, and installs
     * a palette as if the splash owned it.
     *
     * @param splashPalette - Palette standing in for the splash's own ramp.
     */
    function armWithSplashPalette(splashPalette: Palette): void {
        now = 0;

        (BTAPI.instance as unknown as { paletteEffects: PaletteEffectManager }).paletteEffects =
            new PaletteEffectManager(() => now);
        (BTAPI.instance as unknown as { palette: Palette | null }).palette = splashPalette;

        BTAPI.instance.palettes.beginPaletteCapture();
    }

    /**
     * Reads the palette the renderer would resolve indices through.
     *
     * @returns The engine's active palette, bypassing the capture indirection.
     */
    function renderPalette(): Palette | null {
        return (BTAPI.instance as unknown as { palette: Palette | null }).palette;
    }

    /**
     * Runs the effect manager forward on the fake clock.
     *
     * The manager reports a zero delta on its first update after an idle gap, so
     * this primes it before stepping.
     *
     * @param ms - Milliseconds to advance.
     */
    function advanceEffects(ms: number): void {
        const manager = (BTAPI.instance as unknown as { paletteEffects: PaletteEffectManager }).paletteEffects;
        const palette = renderPalette();

        if (!palette) {
            return;
        }

        now += ms;
        manager.update(palette);
    }

    afterEach(() => {
        BTAPI.instance.palettes.paletteClearEffects();
        (BTAPI.instance as unknown as { palettes: { isCapturingPalette: boolean } }).palettes.isCapturingPalette =
            false;
        (BTAPI.instance as unknown as { palettes: { pendingPalette: Palette | null } }).palettes.pendingPalette = null;
    });

    it('defers a paletteSet made while capture is armed', () => {
        const splashPalette = new Palette(RAMP_PALETTE_SIZE);

        armWithSplashPalette(splashPalette);

        const gamePalette = new Palette(16);
        gamePalette.set(1, Color32.red);

        BTAPI.instance.palettes.setPalette(gamePalette);

        expect(renderPalette()).toBe(splashPalette);
    });

    it('shows the game its own palette while capture is armed', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        expect(BTAPI.instance.palettes.getPalette()).toBeNull();

        const gamePalette = new Palette(16);

        BTAPI.instance.palettes.setPalette(gamePalette);

        expect(BTAPI.instance.palettes.getPalette()).toBe(gamePalette);
    });

    it('installs the captured palette blackened at handoff', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        const gamePalette = new Palette(16);
        gamePalette.set(1, Color32.white);

        BTAPI.instance.palettes.setPalette(gamePalette);
        BTAPI.instance.palettes.endPaletteCapture();

        const live = renderPalette();

        expect(live).toBe(gamePalette);
        expect(live?.get(1).r).toBe(0);
    });

    it('installs the captured palette immediately when reduced motion is preferred', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        const gamePalette = new Palette(16);
        gamePalette.set(1, Color32.white);

        BTAPI.instance.palettes.setPalette(gamePalette);
        BTAPI.instance.palettes.endPaletteCapture(true);

        const live = renderPalette();

        expect(live).toBe(gamePalette);
        expect(live?.get(1).r).toBe(255);
        expect(activeEffectCount()).toBe(0);
    });

    it('snaps the splash palette to black immediately when the game never set one and reduced motion is preferred', () => {
        const splashPalette = new Palette(RAMP_PALETTE_SIZE);
        splashPalette.set(16, Color32.white);

        armWithSplashPalette(splashPalette);

        BTAPI.instance.palettes.endPaletteCapture(true);

        expect(splashPalette.get(16).r).toBe(0);
        expect(activeEffectCount()).toBe(0);
    });

    it('lands exactly on the captured colors once the handoff fade completes', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        const gamePalette = new Palette(16);
        gamePalette.set(1, Color32.white);
        gamePalette.set(2, new Color32(40, 60, 80));

        BTAPI.instance.palettes.setPalette(gamePalette);
        BTAPI.instance.palettes.endPaletteCapture();

        advanceEffects(HANDOFF_FADE_MS);

        expect([gamePalette.get(1).r, gamePalette.get(1).g, gamePalette.get(1).b]).toEqual([255, 255, 255]);
        expect([gamePalette.get(2).r, gamePalette.get(2).g, gamePalette.get(2).b]).toEqual([40, 60, 80]);
    });

    it('applies paletteSet immediately again after handoff', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        BTAPI.instance.palettes.setPalette(new Palette(16));
        BTAPI.instance.palettes.endPaletteCapture();

        const later = new Palette(16);

        BTAPI.instance.palettes.setPalette(later);

        expect(renderPalette()).toBe(later);
    });

    it('fades the splash palette to black when the game never set one', () => {
        const splashPalette = new Palette(RAMP_PALETTE_SIZE);
        splashPalette.set(16, Color32.white);

        armWithSplashPalette(splashPalette);

        BTAPI.instance.palettes.endPaletteCapture();

        advanceEffects(HANDOFF_FADE_MS);

        expect(splashPalette.get(16).r).toBe(0);
    });

    it('reindexes sprites against the captured game palette, not the splash ramp', () => {
        const splashPalette = new Palette(RAMP_PALETTE_SIZE);

        armWithSplashPalette(splashPalette);

        const gamePalette = new Palette(16);
        const reindexize = vi.fn();
        const mockSheet = { isIndexed: () => true, reindexize } as unknown as SpriteSheet;

        BTAPI.instance.palettes.setPalette(gamePalette);
        registerIndexedSheet(mockSheet);
        BTAPI.instance.palettes.spritesRefresh();

        expect(reindexize).toHaveBeenCalledWith(gamePalette);
        expect(reindexize).not.toHaveBeenCalledWith(splashPalette);
        unregisterIndexedSheet(mockSheet);
    });

    it('drops palette effects started during capture', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        const gamePalette = new Palette(16);
        gamePalette.set(1, Color32.white);

        BTAPI.instance.palettes.setPalette(gamePalette);
        BTAPI.instance.palettes.paletteFade(new Palette(16), 1000);
        BTAPI.instance.palettes.endPaletteCapture();

        // Only the handoff fade survives.
        expect(activeEffectCount()).toBe(1);
    });
});

describe('BTAPI palette effect ranges', () => {
    beforeEach(() => {
        resetSingleton();
        (BTAPI.instance as unknown as { palette: Palette | null }).palette = Palette.pico8();
    });

    afterEach(() => {
        resetSingleton();
    });

    const slotZero = PALETTE_EFFECT_SLOT_ZERO_MESSAGE;

    function snapshot(): string {
        const palette = (BTAPI.instance as unknown as { palette: Palette }).palette;

        return Array.from({ length: palette.size }, (_, i) => palette.get(i).toHex()).join(',');
    }

    it('paletteCycle rejects slot 0 at the call', () => {
        expect(() => BTAPI.instance.palettes.paletteCycle(0, 3, 1)).toThrow(slotZero);
        expect(activeEffectCount()).toBe(0);
    });

    it('paletteCycle rejects an end past the palette size at the call', () => {
        expect(() => BTAPI.instance.palettes.paletteCycle(1, 16, 1)).toThrow(paletteEffectEndOutOfRangeError(16, 16));
        expect(() => BTAPI.instance.palettes.paletteCycle(1, 40, 1)).toThrow(paletteEffectEndOutOfRangeError(40, 16));
        expect(activeEffectCount()).toBe(0);
    });

    it('paletteCycle accepts the last slot', () => {
        BTAPI.instance.palettes.paletteCycle(1, 15, 1);

        expect(activeEffectCount()).toBe(1);
    });

    it('paletteCycle requires an active palette', () => {
        (BTAPI.instance as unknown as { palette: Palette | null }).palette = null;

        expect(() => BTAPI.instance.palettes.paletteCycle(1, 3, 1)).toThrow(/No palette set yet/);
    });

    it('paletteFadeRange requires an active palette', () => {
        (BTAPI.instance as unknown as { palette: Palette | null }).palette = null;

        expect(() => BTAPI.instance.palettes.paletteFadeRange(1, 3, Palette.pico8(), 500)).toThrow(
            /No palette set yet/,
        );
    });

    it('paletteFadeRange rejects slot 0 at the call', () => {
        expect(() => BTAPI.instance.palettes.paletteFadeRange(0, 15, Palette.pico8(), 500)).toThrow(slotZero);
        expect(activeEffectCount()).toBe(0);
    });

    it('paletteFadeRange rejects an end past the palette size at the call', () => {
        expect(() => BTAPI.instance.palettes.paletteFadeRange(1, 16, Palette.pico8(), 500)).toThrow(
            paletteEffectEndOutOfRangeError(16, 16),
        );
        expect(activeEffectCount()).toBe(0);
    });

    it('paletteFadeRange rejects start greater than end', () => {
        expect(() => BTAPI.instance.palettes.paletteFadeRange(5, 3, Palette.pico8(), 500)).toThrow();
    });

    it('paletteSwap with slot 0 throws and leaves the palette unchanged', () => {
        const before = snapshot();

        expect(() => BTAPI.instance.palettes.paletteSwap(5, 0)).toThrow(slotZero);
        expect(() => BTAPI.instance.palettes.paletteSwap(0, 5)).toThrow(slotZero);
        expect(snapshot()).toBe(before);
    });
});
