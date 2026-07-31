/**
 * Unit tests for {@link Palette}.
 *
 * Covers supported palette sizes, transparent index behavior, named entries,
 * cloning and copying semantics, serialization, preset factories, and the
 * fixed-size GPU upload format required by the palette rendering pipeline.
 */
import { describe, expect, it } from 'vitest';

import { Color32 } from '../utils/Color32';
import { Palette } from './Palette';

describe('Palette', () => {
    /** Verifies that every supported indexed palette size constructs cleanly. */
    it('constructs all valid palette sizes', () => {
        expect(new Palette(2).size).toBe(2);
        expect(new Palette(4).size).toBe(4);
        expect(new Palette(16).size).toBe(16);
        expect(new Palette(32).size).toBe(32);
        expect(new Palette(64).size).toBe(64);
        expect(new Palette(128).size).toBe(128);
        expect(new Palette(256).size).toBe(256);
    });

    it('rejects invalid palette sizes', () => {
        expect(() => new Palette(3)).toThrow('A palette can hold 2, 4, 16, 32, 64, 128, or 256 colors. Got 3.');
    });

    /** Confirms that palette entry zero remains the reserved transparent slot. */
    it('keeps index 0 transparent and rejects opaque writes there', () => {
        const palette = new Palette(16);

        expect(palette.get(0).isEqual(Color32.transparent)).toBe(true);
        expect(() => palette.set(0, Color32.red)).toThrow(
            'Slot 0 is always see-through (transparent). Put solid colors in slot 1 or higher.',
        );

        palette.set(0, new Color32(12, 34, 56, 0));

        expect(palette.get(0).isEqual(Color32.transparent)).toBe(true);

        // get() returns a clone, so mutating the result must not change the stored entry.
        const copy = palette.get(0);
        copy.r = 99;
        expect(palette.get(0).isEqual(Color32.transparent)).toBe(true);
    });

    it('sets and gets entries within range and throws out of range', () => {
        const palette = new Palette(16);
        const color = new Color32(10, 20, 30, 255);

        palette.set(5, color);

        expect(palette.get(5).isEqual(color)).toBe(true);
        expect(palette.get(5)).not.toBe(color);
        expect(() => palette.get(16)).toThrow('The color number 16 is too big');
        expect(() => palette.set(-1, color)).toThrow('0 or higher');
    });

    it('get() returns a defensive copy - mutating the result does not change the stored entry', () => {
        const palette = new Palette(16);

        palette.set(3, new Color32(10, 20, 30, 255));

        const copy = palette.get(3);
        copy.r = 99;
        copy.g = 99;
        copy.b = 99;

        expect(palette.get(3).isEqual(new Color32(10, 20, 30, 255))).toBe(true);
    });

    it('supports named indices and named color lookups', () => {
        const palette = new Palette(16);
        const color = new Color32(99, 88, 77, 255);

        palette.set(3, color);
        palette.setNamed('uiAccent', 3);

        expect(palette.getNamed('uiAccent')).toBe(3);
        expect(palette.getNamedColor('uiAccent').isEqual(color)).toBe(true);
        expect(() => palette.getNamed('missing')).toThrow(
            "There's no color named 'missing' in this palette. Did you call palette.setNamed('missing', someIndex) first?",
        );
    });

    it('finds exact matching colors and returns -1 when absent', () => {
        const palette = new Palette(16);
        const color = new Color32(40, 50, 60, 255);

        palette.set(7, color);

        expect(palette.findColor(color)).toBe(7);
        expect(palette.findColor(Color32.blue)).toBe(-1);
    });

    it('clones palettes without sharing mutable entries', () => {
        const palette = new Palette(16);

        palette.set(2, new Color32(1, 2, 3, 255));
        palette.setNamed('player', 2);

        const clone = palette.clone();

        clone.get(2).r = 99;
        clone.setNamed('enemy', 4);

        expect(palette.get(2).r).toBe(1);
        expect(palette.getNamed('player')).toBe(2);
        expect(() => palette.getNamed('enemy')).toThrow();
    });

    it('copies entries and names from another palette', () => {
        const source = new Palette(16);
        const target = new Palette(16);

        source.set(4, new Color32(9, 8, 7, 255));
        source.setNamed('wall', 4);
        target.set(4, new Color32(1, 1, 1, 255));

        target.copyFrom(source);

        expect(target.get(4).isEqual(source.get(4))).toBe(true);
        expect(target.get(4)).not.toBe(source.get(4));
        expect(target.getNamed('wall')).toBe(4);
    });

    it('roundtrips through JSON serialization', () => {
        const palette = new Palette(16);

        palette.set(1, new Color32(11, 22, 33, 255));
        palette.setNamed('primary', 1);

        const restored = Palette.fromJSON(palette.toJSON());

        expect(restored.size).toBe(16);
        expect(restored.get(1).isEqual(new Color32(11, 22, 33, 255))).toBe(true);
        expect(restored.getNamed('primary')).toBe(1);
        expect(restored.get(0).isEqual(Color32.transparent)).toBe(true);
    });

    it('rejects invalid JSON payloads', () => {
        expect(() => Palette.fromJSON({ colors: ['#000000ff'] })).toThrow(
            "This doesn't look like a valid palette file. It needs 'colors' and 'size' fields.",
        );
        expect(() => Palette.fromJSON({ size: 16 })).toThrow(
            "This doesn't look like a valid palette file. It needs 'colors' and 'size' fields.",
        );
        expect(() => Palette.fromJSON({ colors: ['#00000000'], size: 16 })).toThrow(
            'Palette JSON color count 1 does not match size 16',
        );
    });

    it('rejects missing JSON color entries and invalid named indices', () => {
        const invalidColors = new Array<string>(16);

        invalidColors[0] = '#00000000';
        invalidColors[1] = '#ffffff00';

        expect(() => Palette.fromJSON({ colors: invalidColors, size: 16 })).toThrow('Palette JSON color 2 is missing');
        expect(() =>
            Palette.fromJSON({ colors: new Array(16).fill('#00000000'), names: { bad: 16 }, size: 16 }),
        ).toThrow('The color number 16 is too big');
    });

    it('roundtrips through raw RGB bytes', () => {
        const palette = new Palette(16);

        palette.set(1, new Color32(1, 2, 3, 255));
        palette.set(15, new Color32(250, 251, 252, 255));

        const restored = Palette.fromUint8Array(palette.toUint8Array());

        expect(restored.size).toBe(16);
        expect(restored.get(1).isEqual(new Color32(1, 2, 3, 255))).toBe(true);
        expect(restored.get(15).isEqual(new Color32(250, 251, 252, 255))).toBe(true);
        expect(restored.get(0).isEqual(Color32.transparent)).toBe(true);
    });

    it('rejects invalid raw RGB byte payloads', () => {
        expect(() => Palette.fromUint8Array(new Uint8Array([1, 2, 3, 4]))).toThrow(
            'Palette byte array length 4 is not divisible by 3',
        );
        expect(() => Palette.fromUint8Array(new Uint8Array(48), 32)).toThrow(
            'Palette byte array length 48 does not match palette size 32',
        );
        expect(() => Palette.fromUint8Array(new Uint8Array(9))).toThrow(
            'A palette can hold 2, 4, 16, 32, 64, 128, or 256 colors. Got 3.',
        );
    });

    it('copies between different palette sizes predictably', () => {
        const source = new Palette(16);
        const target = new Palette(32);
        const smallTarget = new Palette(4);

        source.set(1, new Color32(10, 20, 30, 255));
        source.set(15, new Color32(200, 210, 220, 255));
        source.setNamed('first', 1);
        source.setNamed('last', 15);

        target.copyFrom(source);
        smallTarget.copyFrom(source);

        expect(target.get(1).isEqual(new Color32(10, 20, 30, 255))).toBe(true);
        expect(target.get(15).isEqual(new Color32(200, 210, 220, 255))).toBe(true);
        expect(target.get(16).isEqual(Color32.transparent)).toBe(true);
        expect(target.getNamed('last')).toBe(15);

        expect(smallTarget.get(1).isEqual(new Color32(10, 20, 30, 255))).toBe(true);
        expect(() => smallTarget.getNamed('last')).toThrow(
            "There's no color named 'last' in this palette. Did you call palette.setNamed('last', someIndex) first?",
        );
    });

    it('always produces a 256-entry float buffer for GPU upload', () => {
        const palette = new Palette(16);

        palette.set(1, new Color32(255, 128, 0, 255));

        const floats = palette.toFloat32Array();

        expect(floats).toHaveLength(256 * 4);
        expect(floats[4]).toBe(1);
        expect(floats[5]).toBeCloseTo(128 / 255);
        expect(floats[6]).toBe(0);
        expect(floats[7]).toBe(1);
        expect(floats[16 * 4]).toBe(0);
        expect(floats[16 * 4 + 3]).toBe(0);
    });

    it('returns a readable debug string', () => {
        const palette = new Palette(16);

        palette.setNamed('accent', 1);

        expect(palette.toString()).toBe('Palette(size=16, colors=16, names=1)');
    });

    it('exposes built-in preset palettes', () => {
        expect(Palette.vga().size).toBe(256);
        expect(Palette.c64().size).toBe(16);
        expect(Palette.cga().size).toBe(16);
        expect(Palette.gameboy().size).toBe(4);
        expect(Palette.pico8().size).toBe(16);
        expect(Palette.nes().size).toBe(64);
        expect(Palette.c64().findColor(Color32.fromHex('#813338'))).toBe(2);
        expect(Palette.vga().get(0).isEqual(Color32.transparent)).toBe(true);
        expect(Palette.gameboy().get(1).isEqual(Color32.fromHex('#306230'))).toBe(true);
        expect(Palette.nes().get(1).isEqual(Color32.fromHex('#0000fc'))).toBe(true);
        expect(Palette.pico8().get(12).isEqual(Color32.fromHex('#29adff'))).toBe(true);
    });
});

describe('Palette dirty flag', () => {
    it('starts clean after construction', () => {
        expect(new Palette(16).isDirty).toBe(false);
    });

    it('becomes dirty after set()', () => {
        const palette = new Palette(16);

        palette.set(1, new Color32(255, 0, 0, 255));

        expect(palette.isDirty).toBe(true);
    });

    it('clearDirty() resets the flag', () => {
        const palette = new Palette(16);

        palette.set(1, new Color32(255, 0, 0, 255));
        palette.clearDirty();

        expect(palette.isDirty).toBe(false);
    });

    it('becomes dirty after copyFrom()', () => {
        const src = new Palette(16);
        const dest = new Palette(16);

        dest.copyFrom(src);

        expect(dest.isDirty).toBe(true);
    });

    it('clone() returns a non-dirty palette regardless of source state', () => {
        const palette = new Palette(16);

        palette.set(1, new Color32(255, 0, 0, 255));

        expect(palette.isDirty).toBe(true);
        expect(palette.clone().isDirty).toBe(false);
    });

    it('setting index 0 to transparent does not mark dirty', () => {
        const palette = new Palette(16);

        palette.set(0, new Color32(0, 0, 0, 0));

        expect(palette.isDirty).toBe(false);
    });

    it('remains dirty through multiple set() calls until cleared', () => {
        const palette = new Palette(16);

        palette.set(1, new Color32(255, 0, 0, 255));
        palette.set(2, new Color32(0, 255, 0, 255));
        palette.set(3, new Color32(0, 0, 255, 255));
        palette.clearDirty();

        expect(palette.isDirty).toBe(false);

        palette.set(4, new Color32(255, 255, 0, 255));

        expect(palette.isDirty).toBe(true);
    });
});

describe('applyHUD', () => {
    it('fills slots 1-6 with canonical HUD colors at default startSlot', () => {
        const palette = new Palette(16);

        palette.applyHUD();

        expect(palette.get(1).isEqual(Color32.fromHex('#ffffff'))).toBe(true);
        expect(palette.get(2).isEqual(Color32.fromHex('#1e1428'))).toBe(true);
        expect(palette.get(3).isEqual(Color32.fromHex('#c8c8c8'))).toBe(true);
        expect(palette.get(4).isEqual(Color32.fromHex('#ffdc64'))).toBe(true);
        expect(palette.get(5).isEqual(Color32.fromHex('#646464'))).toBe(true);
        expect(palette.get(6).isEqual(Color32.fromHex('#6496c8'))).toBe(true);
    });

    it('fills slots at an explicit non-default startSlot', () => {
        const palette = new Palette(64);

        palette.applyHUD(10);

        expect(palette.get(10).isEqual(Color32.fromHex('#ffffff'))).toBe(true);
        expect(palette.get(15).isEqual(Color32.fromHex('#6496c8'))).toBe(true);
        expect(palette.get(9).isEqual(Color32.black)).toBe(true);
        expect(palette.get(16).isEqual(Color32.black)).toBe(true);
    });

    it('registers named aliases at the correct indices', () => {
        const palette = new Palette(16);

        palette.applyHUD(1);

        expect(palette.getNamed('hud_white')).toBe(1);
        expect(palette.getNamed('hud_bg')).toBe(2);
        expect(palette.getNamed('hud_label')).toBe(3);
        expect(palette.getNamed('hud_header')).toBe(4);
        expect(palette.getNamed('hud_dim')).toBe(5);
        expect(palette.getNamed('hud_code')).toBe(6);
    });

    it('offsets named aliases correctly when startSlot is not 1', () => {
        const palette = new Palette(64);

        palette.applyHUD(10);

        expect(palette.getNamed('hud_white')).toBe(10);
        expect(palette.getNamed('hud_code')).toBe(15);
    });

    it('does not touch slots outside the HUD range', () => {
        const palette = new Palette(16);

        palette.set(7, new Color32(1, 2, 3, 255));
        palette.applyHUD(1);

        expect(palette.get(7).isEqual(new Color32(1, 2, 3, 255))).toBe(true);
    });

    it('throws when startSlot is 0', () => {
        const palette = new Palette(16);

        expect(() => palette.applyHUD(0)).toThrow('HUD preset slots start from 1');
    });

    it('throws when startSlot is negative', () => {
        const palette = new Palette(16);

        expect(() => palette.applyHUD(-1)).toThrow('HUD preset slots start from 1');
    });

    it('throws when startSlot is fractional', () => {
        const palette = new Palette(16);

        expect(() => palette.applyHUD(1.5)).toThrow('HUD preset slots start from 1');
    });

    it('throws when startSlot is NaN', () => {
        const palette = new Palette(16);

        expect(() => palette.applyHUD(NaN)).toThrow('HUD preset slots start from 1');
    });

    it('throws when the six slots exceed the palette size', () => {
        const palette = new Palette(256);

        expect(() => palette.applyHUD(251)).toThrow('HUD preset needs 6 slots starting at 251');
    });

    it('throws immediately on a palette too small to fit the preset', () => {
        const palette = new Palette(4);

        expect(() => palette.applyHUD(1)).toThrow('HUD preset needs 6 slots');
    });

    it('re-registers aliases when called a second time at a different startSlot', () => {
        const palette = new Palette(64);

        palette.applyHUD(1);
        palette.applyHUD(20);

        expect(palette.getNamed('hud_white')).toBe(20);
        expect(palette.getNamed('hud_code')).toBe(25);
    });

    it('marks the palette dirty after applying', () => {
        const palette = new Palette(16);

        palette.clearDirty();
        palette.applyHUD(1);

        expect(palette.isDirty).toBe(true);
    });
});
