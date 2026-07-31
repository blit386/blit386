import { describe, expect, it } from 'vitest';

import { Color32 } from '../utils/Color32';
import { Palette } from './Palette';
import {
    CycleEffect,
    FadeEffect,
    FadeRangeEffect,
    FlashEffect,
    PaletteEffectManager,
    paletteSwap,
} from './PaletteEffect';

/** Creates a 16-entry palette with distinct colors for testing. */
function makeTestPalette(): Palette {
    const p = new Palette(16);

    for (let i = 1; i < 16; i++) {
        p.set(i, new Color32(i * 16, i * 8, i * 4));
    }

    return p;
}

/** Palette slot indices 1..15 (slot 0 is reserved for transparency). */
const NON_TRANSPARENT_SLOTS = Array.from({ length: 15 }, (_, index) => index + 1);

/** Fills every non-transparent slot in `palette` with `color`. */
function fillNonTransparentSlots(palette: Palette, color: Color32): void {
    NON_TRANSPARENT_SLOTS.forEach((slot) => {
        palette.set(slot, color);
    });
}

/** Asserts every non-transparent slot in `palette` matches the given RGB. */
function expectNonTransparentSlotsRgb(palette: Palette, r: number, g: number, b: number): void {
    NON_TRANSPARENT_SLOTS.forEach((slot) => {
        expect(palette.getRef(slot).r).toBe(r);
        expect(palette.getRef(slot).g).toBe(g);
        expect(palette.getRef(slot).b).toBe(b);
    });
}

/** Creates a controllable time provider for deterministic tests. */
function makeTimeClock() {
    let now = 1000;

    return {
        provider: () => now,
        advance: (ms: number) => {
            now += ms;
        },
    };
}

describe('PaletteEffectManager', () => {
    it('starts with zero active effects', () => {
        const clock = makeTimeClock();
        const manager = new PaletteEffectManager(clock.provider);

        expect(manager.activeCount).toBe(0);
    });

    it('tracks added effects', () => {
        const clock = makeTimeClock();
        const manager = new PaletteEffectManager(clock.provider);
        const effect: { update: () => boolean } = { update: () => true };

        manager.add(effect);

        expect(manager.activeCount).toBe(1);
    });

    it('removes completed effects after update', () => {
        const clock = makeTimeClock();
        const manager = new PaletteEffectManager(clock.provider);
        let callCount = 0;

        manager.add({
            update: () => {
                callCount++;

                return callCount < 2; // Complete on second call.
            },
        });

        const palette = makeTestPalette();

        clock.advance(16);
        manager.update(palette);

        expect(manager.activeCount).toBe(1);

        clock.advance(16);
        manager.update(palette);

        expect(manager.activeCount).toBe(0);
    });

    it('clear removes all effects', () => {
        const clock = makeTimeClock();
        const manager = new PaletteEffectManager(clock.provider);

        manager.add({ update: () => true });
        manager.add({ update: () => true });

        expect(manager.activeCount).toBe(2);

        manager.clear();

        expect(manager.activeCount).toBe(0);
    });

    it('marks palette dirty after update with active effects', () => {
        const clock = makeTimeClock();
        const manager = new PaletteEffectManager(clock.provider);
        const palette = makeTestPalette();

        manager.add({ update: () => true });
        palette.clearDirty();

        clock.advance(16);
        manager.update(palette);

        expect(palette.isDirty).toBe(true);
    });

    it('skips first-frame delta (delta is 0 on first call)', () => {
        const clock = makeTimeClock();
        const manager = new PaletteEffectManager(clock.provider);
        const palette = makeTestPalette();
        let receivedDelta = -1;

        manager.add({
            update: (_p, deltaMs) => {
                receivedDelta = deltaMs;

                return false;
            },
        });

        manager.update(palette);

        expect(receivedDelta).toBe(0);
    });

    it('computes correct delta between frames', () => {
        const clock = makeTimeClock();
        const manager = new PaletteEffectManager(clock.provider);
        const palette = makeTestPalette();
        const deltas: number[] = [];

        manager.add({
            update: (_p, deltaMs) => {
                deltas.push(deltaMs);

                return deltas.length < 3;
            },
        });

        manager.update(palette); // First call: delta = 0.

        clock.advance(16);
        manager.update(palette); // delta = 16.

        clock.advance(33);
        manager.update(palette); // delta = 33.

        expect(deltas).toEqual([0, 16, 33]);
    });

    it('supports multiple simultaneous effects', () => {
        const clock = makeTimeClock();
        const manager = new PaletteEffectManager(clock.provider);
        const palette = makeTestPalette();
        let aRan = false;
        let bRan = false;

        manager.add({
            update: () => {
                aRan = true;

                return true;
            },
        });
        manager.add({
            update: () => {
                bRan = true;

                return true;
            },
        });

        clock.advance(16);
        manager.update(palette);

        expect(aRan).toBe(true);
        expect(bRan).toBe(true);
        expect(manager.activeCount).toBe(2);
    });
});

describe('CycleEffect', () => {
    it('rotates entries forward', () => {
        const palette = makeTestPalette();
        const original1 = palette.get(1);
        const original2 = palette.get(2);
        const original3 = palette.get(3);
        const effect = new CycleEffect(1, 3, 1); // 1 step/sec

        // Advance by 1 second -> 1 full step forward.
        effect.update(palette, 1000);

        // Forward rotation: [1,2,3] -> [2,3,1]
        expect(palette.getRef(1).isEqual(original2)).toBe(true);
        expect(palette.getRef(2).isEqual(original3)).toBe(true);
        expect(palette.getRef(3).isEqual(original1)).toBe(true);
    });

    it('rotates entries backward with negative speed', () => {
        const palette = makeTestPalette();
        const original1 = palette.get(1);
        const original2 = palette.get(2);
        const original3 = palette.get(3);
        const effect = new CycleEffect(1, 3, -1); // -1 step/sec

        effect.update(palette, 1000);

        // Backward rotation: [1,2,3] -> [3,1,2]
        expect(palette.getRef(1).isEqual(original3)).toBe(true);
        expect(palette.getRef(2).isEqual(original1)).toBe(true);
        expect(palette.getRef(3).isEqual(original2)).toBe(true);
    });

    it('uses fractional accumulator for sub-frame precision', () => {
        const palette = makeTestPalette();
        const original1 = palette.get(1);
        const effect = new CycleEffect(1, 3, 2); // 2 steps/sec

        // 400ms = 0.8 steps -> no rotation yet.
        effect.update(palette, 400);

        expect(palette.getRef(1).isEqual(original1)).toBe(true);

        // 200ms more = 1.2 steps total -> 1 rotation.
        effect.update(palette, 200);

        // Should have rotated once.
        expect(palette.getRef(1).isEqual(original1)).toBe(false);
    });

    it('handles multiple rotations in a single frame', () => {
        const palette = makeTestPalette();
        const original1 = palette.get(1);
        const original2 = palette.get(2);
        const original3 = palette.get(3);
        const effect = new CycleEffect(1, 3, 1);

        // 3 seconds = 3 full rotations of 3 entries -> back to original.
        effect.update(palette, 3000);

        expect(palette.getRef(1).isEqual(original1)).toBe(true);
        expect(palette.getRef(2).isEqual(original2)).toBe(true);
        expect(palette.getRef(3).isEqual(original3)).toBe(true);
    });

    it('runs indefinitely (always returns true)', () => {
        const palette = makeTestPalette();
        const effect = new CycleEffect(1, 3, 1);

        expect(effect.update(palette, 16)).toBe(true);
        expect(effect.update(palette, 16)).toBe(true);
        expect(effect.update(palette, 10000)).toBe(true);
    });

    it('does nothing with speed=0', () => {
        const palette = makeTestPalette();
        const original1 = palette.get(1);
        const effect = new CycleEffect(1, 3, 0);

        effect.update(palette, 1000);

        expect(palette.getRef(1).isEqual(original1)).toBe(true);
    });

    it('does nothing when start >= end', () => {
        const palette = makeTestPalette();
        const original5 = palette.get(5);
        const effect = new CycleEffect(5, 5, 10);

        effect.update(palette, 1000);

        expect(palette.getRef(5).isEqual(original5)).toBe(true);
    });
});

describe('FadeEffect', () => {
    it('reaches exact target values at completion', () => {
        const source = makeTestPalette();
        const target = new Palette(16);

        fillNonTransparentSlots(target, new Color32(255, 0, 0));

        const effect = new FadeEffect(source, target, 1000);

        // Complete the fade.
        effect.update(source, 1000);

        expectNonTransparentSlotsRgb(source, 255, 0, 0);
    });

    it('auto-removes when complete (returns false)', () => {
        const source = makeTestPalette();
        const target = new Palette(16);

        for (let i = 1; i < 16; i++) {
            target.set(i, new Color32(255, 0, 0));
        }

        const effect = new FadeEffect(source, target, 1000);

        expect(effect.update(source, 500)).toBe(true);
        expect(effect.update(source, 500)).toBe(false);
    });

    it('interpolates intermediate values correctly', () => {
        const source = new Palette(16);

        source.set(1, new Color32(0, 0, 0));

        const target = new Palette(16);

        target.set(1, new Color32(200, 100, 50));

        const effect = new FadeEffect(source, target, 1000, 'linear');

        effect.update(source, 500); // t = 0.5

        // At halfway, values should be approximately half of target.
        expect(source.getRef(1).r).toBeCloseTo(100, 0);
        expect(source.getRef(1).g).toBeCloseTo(50, 0);
        expect(source.getRef(1).b).toBeCloseTo(25, 0);
    });

    it('applies easing function', () => {
        const source = new Palette(16);

        source.set(1, new Color32(0, 0, 0));

        const target = new Palette(16);

        target.set(1, new Color32(100, 0, 0));

        const effectEaseIn = new FadeEffect(source, target, 1000, 'ease-in');

        effectEaseIn.update(source, 500); // t = 0.5, ease-in = 0.25

        // ease-in at t=0.5 -> 0.25, so r ~= 25.
        expect(source.getRef(1).r).toBeCloseTo(25, 0);
    });

    it('completes immediately with zero duration', () => {
        const source = makeTestPalette();
        const target = new Palette(16);

        for (let i = 1; i < 16; i++) {
            target.set(i, new Color32(42, 42, 42));
        }

        const effect = new FadeEffect(source, target, 0);
        const result = effect.update(source, 0);

        expect(result).toBe(false);
        expect(source.getRef(1).r).toBe(42);
    });

    it('preserves index 0 as transparent', () => {
        const source = makeTestPalette();
        const target = new Palette(16);

        // Set non-zero entries to white (index 0 stays transparent by Palette rules).
        for (let i = 1; i < 16; i++) {
            target.set(i, new Color32(255, 255, 255));
        }

        const effect = new FadeEffect(source, target, 1000);

        effect.update(source, 1000);

        // Index 0 should remain transparent (unmodified by the fade loop starting at 1).
        expect(source.getRef(0).a).toBe(0);
    });
});

describe('FadeRangeEffect', () => {
    it('only affects specified range', () => {
        const source = makeTestPalette();
        const originalOutside = source.get(1);
        const target = new Palette(16);

        for (let i = 1; i < 16; i++) {
            target.set(i, new Color32(255, 0, 0));
        }

        const effect = new FadeRangeEffect(5, 10, source, target, 1000);

        effect.update(source, 1000);

        // Index 1 should be unchanged (outside range).
        expect(source.getRef(1).isEqual(originalOutside)).toBe(true);

        // Index 5 should be at target.
        expect(source.getRef(5).r).toBe(255);
        expect(source.getRef(5).g).toBe(0);

        // Index 10 should be at target.
        expect(source.getRef(10).r).toBe(255);
    });

    it('auto-removes when complete', () => {
        const source = makeTestPalette();
        const target = new Palette(16);

        for (let i = 1; i < 16; i++) {
            target.set(i, new Color32(255, 0, 0));
        }

        const effect = new FadeRangeEffect(5, 10, source, target, 500);

        expect(effect.update(source, 250)).toBe(true);
        expect(effect.update(source, 250)).toBe(false);
    });

    it('applies easing function', () => {
        const source = new Palette(16);

        source.set(5, new Color32(0, 0, 0));

        const target = new Palette(16);

        target.set(5, new Color32(100, 0, 0));

        const effect = new FadeRangeEffect(5, 5, source, target, 1000, 'ease-out');

        effect.update(source, 500); // t = 0.5, ease-out = 0.75

        expect(source.getRef(5).r).toBeCloseTo(75, 0);
    });
});

describe('FlashEffect', () => {
    it('sets all non-zero entries to flash color', () => {
        const palette = makeTestPalette();
        const flashColor = new Color32(255, 255, 0);
        const effect = new FlashEffect(flashColor, 200);

        effect.update(palette, 0); // First frame: snapshot + apply.

        for (let i = 1; i < 16; i++) {
            expect(palette.getRef(i).r).toBe(255);
            expect(palette.getRef(i).g).toBe(255);
            expect(palette.getRef(i).b).toBe(0);
        }
    });

    it('preserves index 0 as transparent', () => {
        const palette = makeTestPalette();
        const effect = new FlashEffect(new Color32(255, 255, 255), 200);

        effect.update(palette, 0);

        expect(palette.getRef(0).a).toBe(0);
    });

    it('restores palette after duration', () => {
        const palette = makeTestPalette();
        const originalColors = Array.from({ length: 16 }, (_, index) => palette.get(index));

        const effect = new FlashEffect(new Color32(255, 0, 0), 200);

        effect.update(palette, 0); // Snapshot + flash.
        effect.update(palette, 200); // Restore.

        NON_TRANSPARENT_SLOTS.forEach((slot) => {
            // eslint-disable-next-line security/detect-object-injection -- slot is a controlled palette index
            const original = originalColors[slot];

            if (original) {
                expect(palette.getRef(slot).isEqual(original)).toBe(true);
            }
        });
    });

    it('auto-removes after restore (returns false)', () => {
        const palette = makeTestPalette();
        const effect = new FlashEffect(new Color32(255, 0, 0), 100);

        expect(effect.update(palette, 0)).toBe(true); // Flash applied.
        expect(effect.update(palette, 50)).toBe(true); // Still flashing.
        expect(effect.update(palette, 50)).toBe(false); // Restored.
    });
});

describe('paletteSwap', () => {
    it('exchanges two palette entries', () => {
        const palette = makeTestPalette();
        const color3 = palette.get(3);
        const color7 = palette.get(7);

        paletteSwap(palette, 3, 7);

        expect(palette.getRef(3).isEqual(color7)).toBe(true);
        expect(palette.getRef(7).isEqual(color3)).toBe(true);
    });

    it('marks palette dirty', () => {
        const palette = makeTestPalette();

        palette.clearDirty();
        paletteSwap(palette, 1, 2);

        expect(palette.isDirty).toBe(true);
    });

    it('is a no-op when indices are the same', () => {
        const palette = makeTestPalette();
        const original = palette.get(5);

        palette.clearDirty();
        paletteSwap(palette, 5, 5);

        expect(palette.getRef(5).isEqual(original)).toBe(true);
        expect(palette.isDirty).toBe(false);
    });
});
