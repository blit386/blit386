/**
 * Unit tests for the shared UI theme's slot allocation. `applyTheme()` is pure aside from
 * mutating the `palette` it is given and the module-level `T` singleton, so every case here
 * uses a small fake palette instead of a real `blit386` one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Color32 } from 'blit386';

import {
    applyTheme,
    BUTTON_LOOK,
    litRimColor,
    T,
    THEME_DEFAULT_START_SLOT,
    THEME_OVERLAY_AUDIO_METER_STYLE,
    THEME_OVERLAY_STYLE,
    THEME_PANEL_OFFSET,
    THEME_TEXT_OFFSET,
} from '../ui-theme.js';

/**
 * A minimal fake palette: just enough surface for applyTheme() to write into (`size`,
 * `set(slot, color)`, `setNamed(name, slot)`).
 *
 * @param {number} [size] - Palette slot count.
 * @returns {{ size: number, slots: Map<number, unknown>, named: Map<string, number>,
 *   set: (slot: number, color: unknown) => void, setNamed: (name: string, slot: number) => void }}
 */
function createFakePalette(size = 256) {
    const slots = new Map();
    const named = new Map();

    return {
        size,
        slots,
        named,
        set(slot, color) {
            slots.set(slot, color);
        },
        get(slot) {
            return slots.get(slot);
        },
        setNamed(name, slot) {
            named.set(name, slot);
        },
    };
}

describe('applyTheme', () => {
    it('installs the twelve theme colors starting at the default slot 240', () => {
        const palette = createFakePalette();
        const theme = applyTheme(palette);

        assert.equal(THEME_DEFAULT_START_SLOT, 240);
        assert.equal(theme.bg, 240);
        assert.equal(theme.buttonHover, 251);
        assert.equal(palette.slots.size, 12);
    });

    it('returns exactly the twelve documented color keys', () => {
        const palette = createFakePalette();
        const theme = applyTheme(palette);

        assert.deepEqual(Object.keys(theme).sort(), [
            'accent',
            'bg',
            'border',
            'button',
            'buttonHover',
            'dim',
            'header',
            'info',
            'panel',
            'shadow',
            'text',
            'warm',
        ]);
    });

    it('points the overlay styles at the slots the default applyTheme() writes', () => {
        const theme = applyTheme(createFakePalette());

        assert.deepEqual(THEME_OVERLAY_STYLE, {
            barPaletteIndex: theme.text,
            textPaletteIndex: theme.shadow,
            gapPaletteIndex: theme.bg,
        });
        assert.deepEqual(THEME_OVERLAY_AUDIO_METER_STYLE, {
            levelBarPaletteIndex: theme.accent,
            trackPaletteIndex: theme.bg,
            warningPaletteIndex: theme.header,
            clipPaletteIndex: theme.warm,
        });
    });

    it('shifts the whole block when a custom startSlot is passed', () => {
        const palette = createFakePalette();
        const theme = applyTheme(palette, 100);

        assert.equal(theme.bg, 100);
        assert.equal(theme.panel, 100 + THEME_PANEL_OFFSET);
        assert.equal(theme.text, 100 + THEME_TEXT_OFFSET);
        assert.equal(theme.buttonHover, 111);
    });

    it('throws when startSlot is not an integer', () => {
        const palette = createFakePalette();

        assert.throws(() => applyTheme(palette, 10.5), /startSlot must be an integer/);
    });

    it('throws when startSlot is less than 1', () => {
        const palette = createFakePalette();

        assert.throws(() => applyTheme(palette, 0), /startSlot must be an integer/);
    });

    it('throws when the 12-slot block would not fit in the palette', () => {
        const palette = createFakePalette(10);

        assert.throws(() => applyTheme(palette, 1), /do not fit in a palette of size 10/);
    });

    it("fits exactly when the block ends on the palette's last slot", () => {
        const palette = createFakePalette(252);

        // 12 colors starting at 240 fill slots 240..251 - the last slot of a 252-size palette.
        assert.doesNotThrow(() => applyTheme(palette, 240));
    });

    it('registers a named alias for every color', () => {
        const palette = createFakePalette();

        applyTheme(palette);

        assert.equal(palette.named.get('ui_bg'), 240);
        assert.equal(palette.named.get('ui_button_hover'), 251);
    });

    it('returns a fresh copy, not the live T singleton', () => {
        const palette = createFakePalette();
        const theme = applyTheme(palette);

        assert.notStrictEqual(theme, T);

        theme.bg = 999;

        assert.notEqual(T.bg, 999);
    });

    it('a later call overwrites the module-level T singleton in place', () => {
        const palette = createFakePalette();

        applyTheme(palette, 50);
        assert.equal(T.bg, 50);

        applyTheme(palette, 150);
        assert.equal(T.bg, 150);
    });
});

describe('applyTheme nine-slices', () => {
    it('maps the panel art onto the theme slots and follows a moved startSlot', () => {
        for (const startSlot of [THEME_DEFAULT_START_SLOT, 100]) {
            applyTheme(createFakePalette(), startSlot);

            // indexedPixels is TypeScript-private but readable at runtime; row-major 14x14.
            const pixels = T.panelSlice.sheet.indexedPixels;

            assert.equal(pixels[0], 0, 'rounded corner is see-through');
            assert.equal(pixels[5], T.shadow, 'outer ring is the shadow color');
            assert.equal(pixels[14 + 5], T.border, 'inner rim is the border color');
            assert.equal(pixels[7 * 14 + 7], T.panel, 'center is the panel fill');
        }
    });

    it('builds one button nine-slice per look: hover changes the fill, held and warn change the rim', () => {
        applyTheme(createFakePalette());

        const looks = [
            [T.buttonSlices[BUTTON_LOOK.REST], T.button, T.border],
            [T.buttonSlices[BUTTON_LOOK.HOVER], T.buttonHover, T.border],
            [T.buttonSlices[BUTTON_LOOK.HELD], T.button, T.accent],
            [T.buttonSlices[BUTTON_LOOK.WARN], T.button, T.warm],
        ];

        for (const [slice, fill, rim] of looks) {
            const pixels = slice.sheet.indexedPixels;

            assert.equal(pixels[0], 0, 'rounded corner is see-through');
            assert.equal(pixels[5], T.shadow, 'outer ring is the shadow color');
            assert.equal(pixels[2 * 14 + 5], rim, "top shine is the look's rim");
            assert.equal(pixels[7 * 14 + 7], fill, "center is the look's fill");
        }
    });

    it('builds the meter trough and one fill per color role', () => {
        applyTheme(createFakePalette());

        // 9x9 art: the trough's center pixel is the panel fill, its edge-middle the rim.
        const trough = T.meterTroughSlice.sheet.indexedPixels;

        assert.equal(trough[0], 0, 'rounded corner is see-through');
        assert.equal(trough[4], T.shadow, 'outer ring is the shadow color');
        assert.equal(trough[9 + 4], T.border, 'rim is the border color');
        assert.equal(trough[4 * 9 + 4], T.panel, 'center is the panel fill');

        const roleSlots = [T.text, T.dim, T.header, T.accent, T.warm, T.info];

        assert.equal(T.meterFillSlices.size, roleSlots.length);

        for (const slot of roleSlots) {
            const fill = T.meterFillSlices.get(slot).sheet.indexedPixels;

            assert.equal(fill[9 + 4], 0, 'margin row is see-through');
            assert.equal(fill[4 * 9 + 4], slot, "center is the role's color");
        }
    });

    it('builds the tooltip nine-slice with 4x4 top corners and 4x5 bottom corners', () => {
        applyTheme(createFakePalette());

        const slice = T.tooltipSlice;

        // 9x10 art. The center left between the corners is the single pixel at (4, 4).
        assert.equal(slice.outer.width, 9);
        assert.equal(slice.outer.height, 10);
        assert.equal(slice.inner.x, 4);
        assert.equal(slice.inner.y, 4);
        assert.equal(slice.inner.width, 1);
        assert.equal(slice.inner.height, 1);

        const pixels = slice.sheet.indexedPixels;

        assert.equal(pixels[0], 0, 'top-left corner is see-through');
        assert.equal(pixels[4], T.shadow, 'top point is the shadow outline');
        assert.equal(pixels[4 * 9 + 4], T.text, 'center is the text white');
        assert.equal(pixels[9 * 9 + 4], T.shadow, 'bottom point is the shadow outline');
    });
});

describe('litRimColor', () => {
    it('brightens a fill by the step from the resting button fill to the border', () => {
        const palette = createFakePalette();
        const theme = applyTheme(palette);
        const button = palette.get(theme.button);
        const border = palette.get(theme.border);
        const rim = litRimColor(palette, new Color32(75, 210, 120));

        assert.equal(rim.r, 75 + border.r - button.r);
        assert.equal(rim.g, 210 + border.g - button.g);
        assert.equal(rim.b, 120 + border.b - button.b);
    });

    it('keeps every channel within 0-255', () => {
        const palette = createFakePalette();

        applyTheme(palette);

        const rim = litRimColor(palette, new Color32(255, 255, 255));

        assert.deepEqual([rim.r, rim.g, rim.b], [255, 255, 255]);
    });
});
