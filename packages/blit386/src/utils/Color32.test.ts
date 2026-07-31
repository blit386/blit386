/**
 * Unit tests for {@link Color32} and its small helper exports.
 *
 * Covers byte clamping, constructor normalization, shared color singletons,
 * factory methods, packing and unpacking, hex parsing, arithmetic helpers,
 * interpolation, cloning, equality, and normalized float conversion behavior.
 */

import { describe, expect, it } from 'vitest';

import { clampByte, Color32, INV_255 } from './Color32';

describe('clampByte', () => {
    it('passes through values in valid range', () => {
        expect(clampByte(0)).toBe(0);
        expect(clampByte(128)).toBe(128);
        expect(clampByte(255)).toBe(255);
    });

    it('clamps negative values to 0', () => {
        expect(clampByte(-1)).toBe(0);
        expect(clampByte(-1000)).toBe(0);
    });

    it('clamps values above 255 to 255', () => {
        expect(clampByte(256)).toBe(255);
        expect(clampByte(9999)).toBe(255);
    });

    it('truncates floats to integers', () => {
        expect(clampByte(128.7)).toBe(128);
        expect(clampByte(0.9)).toBe(0);
        expect(clampByte(254.999)).toBe(254);
    });
});

describe('Color32 constructor', () => {
    it('defaults to white (255, 255, 255, 255)', () => {
        const c = new Color32();

        expect(c.r).toBe(255);
        expect(c.g).toBe(255);
        expect(c.b).toBe(255);
        expect(c.a).toBe(255);
    });

    it('clamps values outside the 0-255 range', () => {
        const c = new Color32(-10, 300, 128, 500);

        expect(c.r).toBe(0);
        expect(c.g).toBe(255);
        expect(c.b).toBe(128);
        expect(c.a).toBe(255);
    });

    it('truncates float values to integers', () => {
        const c = new Color32(100.9, 200.1, 50.5, 128.7);

        expect(c.r).toBe(100);
        expect(c.g).toBe(200);
        expect(c.b).toBe(50);
        expect(c.a).toBe(128);
    });
});

describe('static color getters', () => {
    it('white returns (255, 255, 255, 255)', () => {
        const w = Color32.white;

        expect(w.r).toBe(255);
        expect(w.g).toBe(255);
        expect(w.b).toBe(255);
        expect(w.a).toBe(255);
    });

    it('black returns (0, 0, 0, 255)', () => {
        const b = Color32.black;

        expect(b.r).toBe(0);
        expect(b.g).toBe(0);
        expect(b.b).toBe(0);
        expect(b.a).toBe(255);
    });

    it('transparent returns (0, 0, 0, 0)', () => {
        const t = Color32.transparent;

        expect(t.r).toBe(0);
        expect(t.g).toBe(0);
        expect(t.b).toBe(0);
        expect(t.a).toBe(0);
    });

    it('red returns (255, 0, 0, 255)', () => {
        const c = Color32.red;

        expect(c.r).toBe(255);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });

    it('green returns (0, 255, 0, 255)', () => {
        const c = Color32.green;

        expect(c.r).toBe(0);
        expect(c.g).toBe(255);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });

    it('blue returns (0, 0, 255, 255)', () => {
        const c = Color32.blue;

        expect(c.r).toBe(0);
        expect(c.g).toBe(0);
        expect(c.b).toBe(255);
        expect(c.a).toBe(255);
    });

    it('yellow returns (255, 255, 0, 255)', () => {
        const c = Color32.yellow;

        expect(c.r).toBe(255);
        expect(c.g).toBe(255);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });

    it('cyan returns (0, 255, 255, 255)', () => {
        const c = Color32.cyan;

        expect(c.r).toBe(0);
        expect(c.g).toBe(255);
        expect(c.b).toBe(255);
        expect(c.a).toBe(255);
    });

    it('magenta returns (255, 0, 255, 255)', () => {
        const c = Color32.magenta;

        expect(c.r).toBe(255);
        expect(c.g).toBe(0);
        expect(c.b).toBe(255);
        expect(c.a).toBe(255);
    });

    it('all color singletons are frozen', () => {
        expect(Object.isFrozen(Color32.white)).toBe(true);
        expect(Object.isFrozen(Color32.black)).toBe(true);
        expect(Object.isFrozen(Color32.transparent)).toBe(true);
        expect(Object.isFrozen(Color32.red)).toBe(true);
        expect(Object.isFrozen(Color32.green)).toBe(true);
        expect(Object.isFrozen(Color32.blue)).toBe(true);
        expect(Object.isFrozen(Color32.yellow)).toBe(true);
        expect(Object.isFrozen(Color32.cyan)).toBe(true);
        expect(Object.isFrozen(Color32.magenta)).toBe(true);
    });

    it('each preset getter yields the same singleton on repeated reads', () => {
        expect(Color32.white).toBe(Color32.white);
        expect(Color32.black).toBe(Color32.black);
        expect(Color32.transparent).toBe(Color32.transparent);
        expect(Color32.red).toBe(Color32.red);
        expect(Color32.green).toBe(Color32.green);
        expect(Color32.blue).toBe(Color32.blue);
        expect(Color32.yellow).toBe(Color32.yellow);
        expect(Color32.cyan).toBe(Color32.cyan);
        expect(Color32.magenta).toBe(Color32.magenta);
    });

    it('gray(128) returns (128, 128, 128, 255)', () => {
        const g = Color32.gray(128);

        expect(g.r).toBe(128);
        expect(g.g).toBe(128);
        expect(g.b).toBe(128);
        expect(g.a).toBe(255);
    });

    it('gray(0) returns black-like gray', () => {
        const g = Color32.gray(0);

        expect(g.r).toBe(0);
        expect(g.g).toBe(0);
        expect(g.b).toBe(0);
        expect(g.a).toBe(255);
    });
});

describe('named color registry', () => {
    it('resolves required CSS level 1 names', () => {
        expect(Color32.resolveNamedColor('black')?.isEqual(Color32.black)).toBe(true);
        expect(Color32.resolveNamedColor('white')?.isEqual(Color32.white)).toBe(true);
        expect(Color32.resolveNamedColor('red')?.isEqual(Color32.red)).toBe(true);
        expect(Color32.resolveNamedColor('green')?.isEqual(Color32.green)).toBe(true);
        expect(Color32.resolveNamedColor('blue')?.isEqual(Color32.blue)).toBe(true);
        expect(Color32.resolveNamedColor('yellow')?.isEqual(Color32.yellow)).toBe(true);
        expect(Color32.resolveNamedColor('cyan')?.isEqual(Color32.cyan)).toBe(true);
        expect(Color32.resolveNamedColor('magenta')?.isEqual(Color32.magenta)).toBe(true);
    });

    it('resolves gray and grey to the same singleton', () => {
        const gray = Color32.resolveNamedColor('gray');
        const grey = Color32.resolveNamedColor('grey');

        expect(gray).toBeDefined();
        expect(gray).toBe(grey);
        expect(gray?.isEqual(Color32.gray(128))).toBe(true);
    });

    it('resolves common extra names', () => {
        expect(
            Color32.resolveNamedColor('cornflowerblue')?.isEqual(Color32.fromRGBAUnchecked(100, 149, 237, 255)),
        ).toBe(true);
        expect(Color32.resolveNamedColor('tomato')?.isEqual(Color32.fromRGBAUnchecked(255, 99, 71, 255))).toBe(true);
    });

    it('normalizes lookup names with trim + lowercase', () => {
        const color = Color32.resolveNamedColor('  CoRnFlOwErBlUe  ');
        expect(color?.isEqual(Color32.fromRGBAUnchecked(100, 149, 237, 255))).toBe(true);
    });

    it('returns same instance on repeated lookups', () => {
        expect(Color32.resolveNamedColor('turquoise')).toBe(Color32.resolveNamedColor('turquoise'));
    });

    it('returns undefined for unknown names', () => {
        expect(Color32.resolveNamedColor('this-color-does-not-exist')).toBeUndefined();
    });

    it('throws on empty lookup name', () => {
        expect(() => Color32.resolveNamedColor('   ')).toThrow('Color name cannot be empty.');
    });

    it('registerColor stores frozen singleton and normalizes the key', () => {
        const source = new Color32(1, 2, 3, 4);
        // cspell:ignore mycustomcolor
        Color32.registerColor('  MyCustomColor  ', source);

        try {
            const resolved = Color32.resolveNamedColor('mycustomcolor');
            expect(resolved).toBeDefined();
            expect(resolved).not.toBe(source);
            expect(resolved?.isEqual(source)).toBe(true);
            expect(Object.isFrozen(resolved)).toBe(true);
        } finally {
            Color32.unregisterColor('mycustomcolor');
        }
    });

    it('registerColor throws on duplicates (including built-ins)', () => {
        expect(() => Color32.registerColor('RED', new Color32(1, 1, 1))).toThrow(
            "Named color 'red' is already registered.",
        );
    });

    it('registerColor throws on empty names', () => {
        expect(() => Color32.registerColor('   ', new Color32(1, 2, 3))).toThrow('Color name cannot be empty.');
    });

    it('updateColor replaces existing entries with frozen singleton', () => {
        Color32.registerColor('updatablecolor', new Color32(10, 20, 30, 40));

        try {
            const updatedSource = new Color32(200, 201, 202, 203);
            Color32.updateColor('  UpdatableColor  ', updatedSource);

            const resolved = Color32.resolveNamedColor('updatablecolor');
            expect(resolved?.isEqual(updatedSource)).toBe(true);
            expect(resolved).not.toBe(updatedSource);
            expect(Object.isFrozen(resolved)).toBe(true);
        } finally {
            Color32.unregisterColor('updatablecolor');
        }
    });

    it('updateColor throws when entry is missing', () => {
        expect(() => Color32.updateColor('not-registered', new Color32(1, 2, 3))).toThrow(
            "Named color 'not-registered' is not registered.",
        );
    });

    it('updateColor on one alias keeps both gray/grey aliases in sync', () => {
        const originalGray = Color32.resolveNamedColor('gray');
        if (originalGray === undefined) {
            throw new Error('built-in gray must be registered');
        }

        try {
            Color32.updateColor('grey', new Color32(200, 200, 200, 255));

            const gray = Color32.resolveNamedColor('gray');
            const grey = Color32.resolveNamedColor('grey');

            expect(gray).toBeDefined();
            expect(grey).toBeDefined();
            expect(gray?.isEqual(new Color32(200, 200, 200, 255))).toBe(true);
            expect(grey?.isEqual(new Color32(200, 200, 200, 255))).toBe(true);
            expect(gray).toBe(grey);
            expect(Object.isFrozen(gray)).toBe(true);
        } finally {
            Color32.updateColor('gray', originalGray);
        }
    });

    it('unregisterColor removes entries', () => {
        // cspell:ignore deleteme
        Color32.registerColor('deleteme', new Color32(8, 9, 10, 255));

        try {
            expect(Color32.resolveNamedColor('deleteme')).toBeDefined();
            Color32.unregisterColor('deleteme');
            expect(Color32.resolveNamedColor('deleteme')).toBeUndefined();
        } finally {
            if (Color32.resolveNamedColor('deleteme') !== undefined) {
                Color32.unregisterColor('deleteme');
            }
        }
    });

    it('unregisterColor throws when entry is missing', () => {
        expect(() => Color32.unregisterColor('not-registered')).toThrow(
            "Named color 'not-registered' is not registered.",
        );
    });
});

describe('fromRGBAUnchecked', () => {
    it('creates color without clamping', () => {
        const c = Color32.fromRGBAUnchecked(100, 150, 200, 250);

        expect(c.r).toBe(100);
        expect(c.g).toBe(150);
        expect(c.b).toBe(200);
        expect(c.a).toBe(250);
    });

    it('does not clamp out-of-range values', () => {
        const c = Color32.fromRGBAUnchecked(300, -10, 999, 0);

        expect(c.r).toBe(300);
        expect(c.g).toBe(-10);
        expect(c.b).toBe(999);
        expect(c.a).toBe(0);
    });
});

describe('fromUint32', () => {
    it('unpacks ABGR correctly', () => {
        // ABGR: A=255, B=0, G=0, R=255 -> opaque red
        const packed = (255 << 24) | 255;
        const c = Color32.fromUint32(packed >>> 0);

        expect(c.r).toBe(255);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });

    it('roundtrips with toUint32', () => {
        const original = new Color32(64, 128, 192, 240);
        const packed = original.toUint32();
        const unpacked = Color32.fromUint32(packed);

        expect(unpacked.r).toBe(64);
        expect(unpacked.g).toBe(128);
        expect(unpacked.b).toBe(192);
        expect(unpacked.a).toBe(240);
    });
});

describe('fromHex', () => {
    const invalidHexMessage =
        "isn't a valid hex color. Use a format like '#FF0000' (red), '#00FF00' (green), or '#0000FF' (blue). You can also use short form like '#F00'.";

    it('parses #RGB shorthand (expands nibbles)', () => {
        const c = Color32.fromHex('#F00');
        expect(c.r).toBe(255);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });

    it('parses #RGBA shorthand', () => {
        const c = Color32.fromHex('#F008');

        expect(c.r).toBe(255);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
        expect(c.a).toBe(136); // 0x8 * 17 = 136
    });

    it('parses #RRGGBB format', () => {
        const c = Color32.fromHex('#1A2B3C');

        expect(c.r).toBe(0x1a);
        expect(c.g).toBe(0x2b);
        expect(c.b).toBe(0x3c);
        expect(c.a).toBe(255);
    });

    it('parses #RRGGBBAA format', () => {
        const c = Color32.fromHex('#1A2B3C80');

        expect(c.r).toBe(0x1a);
        expect(c.g).toBe(0x2b);
        expect(c.b).toBe(0x3c);
        expect(c.a).toBe(0x80);
    });

    it('parses without leading #', () => {
        const c = Color32.fromHex('FF8000');

        expect(c.r).toBe(255);
        expect(c.g).toBe(128);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });

    it('throws on invalid hex string', () => {
        expect(() => Color32.fromHex('#XYZ')).toThrow(invalidHexMessage);
        expect(() => Color32.fromHex('#12')).toThrow(invalidHexMessage);
        expect(() => Color32.fromHex('#123456789')).toThrow(invalidHexMessage);
    });

    it('throws the beginner-friendly message for invalid 6-digit format', () => {
        expect(() => Color32.fromHex('#GGGGGG')).toThrow(invalidHexMessage);
    });

    it('throws when a 6-digit token contains trailing non-hex characters', () => {
        expect(() => Color32.fromHex('#12345Z')).toThrow(invalidHexMessage);
    });

    it('throws the beginner-friendly message for invalid 8-digit alpha', () => {
        expect(() => Color32.fromHex('#112233GG')).toThrow(invalidHexMessage);
    });

    it('throws when 8-digit alpha contains a non-hex character', () => {
        expect(() => Color32.fromHex('#1122334Z')).toThrow(invalidHexMessage);
    });

    it('throws the beginner-friendly message for invalid 4-digit shorthand alpha', () => {
        expect(() => Color32.fromHex('#FFFZ')).toThrow(invalidHexMessage);
    });
});

describe('fromFloat', () => {
    it('converts normalized floats to byte values', () => {
        const c = Color32.fromFloat(1.0, 0.5, 0.0);

        expect(c.r).toBe(255);
        expect(c.g).toBe(127);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });

    it('supports explicit alpha', () => {
        const c = Color32.fromFloat(0.0, 0.0, 0.0, 0.5);

        expect(c.r).toBe(0);
        expect(c.a).toBe(127);
    });

    it('clamps values outside 0.0-1.0 via constructor', () => {
        const c = Color32.fromFloat(2.0, -1.0, 0.5);

        expect(c.r).toBe(255);
        expect(c.g).toBe(0);
        expect(c.b).toBe(127);
    });
});

describe('fromHSL', () => {
    it('converts red (0, 100, 50) to (255, 0, 0, 255)', () => {
        const c = Color32.fromHSL(0, 100, 50);

        expect(c.r).toBe(255);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });

    it('converts green (120, 100, 50) to (0, 255, 0, 255)', () => {
        const c = Color32.fromHSL(120, 100, 50);

        expect(c.r).toBe(0);
        expect(c.g).toBe(255);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });

    it('converts gray (0, 0, 50) to ~(127, 127, 127, 255)', () => {
        const c = Color32.fromHSL(0, 0, 50);

        expect(c.r).toBe(127);
        expect(c.g).toBe(127);
        expect(c.b).toBe(127);
        expect(c.a).toBe(255);
    });

    it('supports custom alpha', () => {
        const c = Color32.fromHSL(0, 100, 50, 128);

        expect(c.r).toBe(255);
        expect(c.a).toBe(128);
    });
});

describe('toFloat32Array', () => {
    it('returns 4-element Float32Array with values in [0, 1]', () => {
        const c = new Color32(255, 0, 128, 255);
        const arr = c.toFloat32Array();

        expect(arr).toBeInstanceOf(Float32Array);
        expect(arr.length).toBe(4);
        expect(arr[0]).toBeCloseTo(1.0, 3);
        expect(arr[1]).toBeCloseTo(0.0, 3);
        expect(arr[2]).toBeCloseTo(128 / 255, 3);
        expect(arr[3]).toBeCloseTo(1.0, 3);
    });

    it('returns all zeros for transparent black', () => {
        const c = new Color32(0, 0, 0, 0);
        const arr = c.toFloat32Array();

        expect(arr[0]).toBeCloseTo(0.0, 5);
        expect(arr[1]).toBeCloseTo(0.0, 5);
        expect(arr[2]).toBeCloseTo(0.0, 5);
        expect(arr[3]).toBeCloseTo(0.0, 5);
    });
});

describe('writeToFloat32Array', () => {
    it('writes normalized values at default offset 0', () => {
        const c = new Color32(255, 128, 0, 255);
        const buf = new Float32Array(4);

        c.writeToFloat32Array(buf);

        expect(buf[0]).toBeCloseTo(1.0, 3);
        expect(buf[1]).toBeCloseTo(128 / 255, 3);
        expect(buf[2]).toBeCloseTo(0.0, 3);
        expect(buf[3]).toBeCloseTo(1.0, 3);
    });

    it('writes at the specified offset', () => {
        const buf = new Float32Array(8);
        const c = new Color32(64, 128, 192, 255);

        c.writeToFloat32Array(buf, 4);

        expect(buf[0]).toBe(0);
        expect(buf[4]).toBeCloseTo(64 / 255, 3);
        expect(buf[5]).toBeCloseTo(128 / 255, 3);
        expect(buf[6]).toBeCloseTo(192 / 255, 3);
        expect(buf[7]).toBeCloseTo(1.0, 3);
    });
});

describe('toFloatRGBA', () => {
    it('returns the object with normalized r, g, b, a', () => {
        const c = new Color32(255, 0, 128, 64);
        const f = c.toFloatRGBA();

        expect(f.r).toBeCloseTo(1.0, 3);
        expect(f.g).toBeCloseTo(0.0, 3);
        expect(f.b).toBeCloseTo(128 / 255, 3);
        expect(f.a).toBeCloseTo(64 / 255, 3);
    });

    it('returns all ones for white', () => {
        const f = new Color32(255, 255, 255, 255).toFloatRGBA();

        expect(f.r).toBeCloseTo(1.0, 5);
        expect(f.g).toBeCloseTo(1.0, 5);
        expect(f.b).toBeCloseTo(1.0, 5);
        expect(f.a).toBeCloseTo(1.0, 5);
    });
});

describe('toUint32', () => {
    it('packs in ABGR format', () => {
        const c = new Color32(255, 0, 0, 255);
        const packed = c.toUint32();

        expect(packed & 0xff).toBe(255); // R
        expect((packed >>> 8) & 0xff).toBe(0); // G
        expect((packed >>> 16) & 0xff).toBe(0); // B
        expect((packed >>> 24) & 0xff).toBe(255); // A
    });

    it('roundtrips with fromUint32', () => {
        const c = new Color32(12, 34, 56, 78);
        const roundtripped = Color32.fromUint32(c.toUint32());

        expect(roundtripped.r).toBe(12);
        expect(roundtripped.g).toBe(34);
        expect(roundtripped.b).toBe(56);
        expect(roundtripped.a).toBe(78);
    });
});

describe('toHex', () => {
    it('returns #rrggbbaa format', () => {
        const c = new Color32(255, 128, 0, 255);

        expect(c.toHex()).toBe('#ff8000ff');
    });

    it('pads single-digit hex values with zero', () => {
        const c = new Color32(0, 0, 0, 0);

        expect(c.toHex()).toBe('#00000000');
    });

    it('handles white correctly', () => {
        const c = new Color32(255, 255, 255, 255);

        expect(c.toHex()).toBe('#ffffffff');
    });
});

describe('toCSS', () => {
    it('returns rgba() string with alpha as 0.0-1.0', () => {
        const c = new Color32(255, 128, 0, 255);

        expect(c.toCSS()).toBe('rgba(255, 128, 0, 1.000)');
    });

    it('formats zero alpha correctly', () => {
        const c = new Color32(0, 0, 0, 0);

        expect(c.toCSS()).toBe('rgba(0, 0, 0, 0.000)');
    });

    it('formats half alpha correctly', () => {
        const c = new Color32(100, 200, 50, 128);
        const css = c.toCSS();

        expect(css).toMatch(/^rgba\(100, 200, 50, 0\.50[0-9]\)$/);
    });
});

describe('toString', () => {
    it('returns Color32(r, g, b, a) format', () => {
        const c = new Color32(10, 20, 30, 40);

        expect(c.toString()).toBe('Color32(10, 20, 30, 40)');
    });

    it('works for default white', () => {
        expect(new Color32().toString()).toBe('Color32(255, 255, 255, 255)');
    });
});

describe('isEqual', () => {
    it('returns true for identical colors', () => {
        const a = new Color32(10, 20, 30, 40);
        const b = new Color32(10, 20, 30, 40);

        expect(a.isEqual(b)).toBe(true);
    });

    it('returns false for different colors', () => {
        const a = new Color32(10, 20, 30, 40);
        const b = new Color32(10, 20, 30, 41);

        expect(a.isEqual(b)).toBe(false);
    });

    it('returns false for null or undefined', () => {
        const a = new Color32(10, 20, 30, 40);

        expect(a.isEqual(null as unknown as Color32)).toBe(false);
        expect(a.isEqual(undefined as unknown as Color32)).toBe(false);
    });
});

describe('clone', () => {
    it('creates an independent copy', () => {
        const original = new Color32(10, 20, 30, 40);
        const copy = original.clone();

        expect(copy.r).toBe(10);
        expect(copy.g).toBe(20);
        expect(copy.b).toBe(30);
        expect(copy.a).toBe(40);
    });

    it("modifying clone doesn't affect the original", () => {
        const original = new Color32(10, 20, 30, 40);
        const copy = original.clone();

        copy.r = 255;

        expect(original.r).toBe(10);
    });
});

describe('withAlpha', () => {
    it('changes alpha only, preserving RGB', () => {
        const c = new Color32(10, 20, 30, 255);
        const result = c.withAlpha(128);

        expect(result.r).toBe(10);
        expect(result.g).toBe(20);
        expect(result.b).toBe(30);
        expect(result.a).toBe(128);
    });

    it('clamps alpha value', () => {
        const c = new Color32(10, 20, 30, 255);

        expect(c.withAlpha(-10).a).toBe(0);
        expect(c.withAlpha(300).a).toBe(255);
    });

    it('does not modify the original', () => {
        const c = new Color32(10, 20, 30, 255);

        c.withAlpha(0);
        expect(c.a).toBe(255);
    });
});

describe('withRGB', () => {
    it('changes RGB and keeps alpha', () => {
        const c = new Color32(10, 20, 30, 128);
        const result = c.withRGB(100, 200, 50);

        expect(result.r).toBe(100);
        expect(result.g).toBe(200);
        expect(result.b).toBe(50);
        expect(result.a).toBe(128);
    });

    it('clamps RGB values via constructor', () => {
        const c = new Color32(10, 20, 30, 128);
        const result = c.withRGB(-5, 300, 100);

        expect(result.r).toBe(0);
        expect(result.g).toBe(255);
        expect(result.b).toBe(100);
    });
});

describe('invert', () => {
    it('inverts RGB channels (255 - value), keeps alpha', () => {
        const c = new Color32(0, 100, 255, 128);
        const inv = c.invert();

        expect(inv.r).toBe(255);
        expect(inv.g).toBe(155);
        expect(inv.b).toBe(0);
        expect(inv.a).toBe(128);
    });

    it('double invert returns original values', () => {
        const c = new Color32(42, 99, 200, 180);
        const doubleInv = c.invert().invert();

        expect(doubleInv.r).toBe(42);
        expect(doubleInv.g).toBe(99);
        expect(doubleInv.b).toBe(200);
        expect(doubleInv.a).toBe(180);
    });
});

describe('lerp', () => {
    it('returns this color at t=0', () => {
        const a = new Color32(0, 0, 0, 255);
        const b = new Color32(255, 255, 255, 255);

        const result = a.lerp(b, 0);

        expect(result.r).toBe(0);
        expect(result.g).toBe(0);
        expect(result.b).toBe(0);
    });

    it('returns other color at t=1', () => {
        const a = new Color32(0, 0, 0, 255);
        const b = new Color32(255, 255, 255, 255);
        const result = a.lerp(b, 1);

        expect(result.r).toBe(255);
        expect(result.g).toBe(255);
        expect(result.b).toBe(255);
    });

    it('returns midpoint at t=0.5', () => {
        const a = new Color32(0, 0, 0, 0);
        const b = new Color32(200, 100, 50, 254);
        const result = a.lerp(b, 0.5);

        expect(result.r).toBe(100);
        expect(result.g).toBe(50);
        expect(result.b).toBe(25);
        expect(result.a).toBe(127);
    });

    it('clamps t outside [0, 1]', () => {
        const a = new Color32(100, 100, 100, 255);
        const b = new Color32(200, 200, 200, 255);

        expect(a.lerp(b, -5).r).toBe(100);
        expect(a.lerp(b, 10).r).toBe(200);
    });
});

describe('Color32.lerp (static)', () => {
    it('matches instance lerp for representative inputs', () => {
        const a = new Color32(12, 34, 56, 78);
        const b = new Color32(200, 100, 50, 254);

        for (const t of [0, 0.25, 0.5, 0.75, 1, -1, 2]) {
            expect(Color32.lerp(a, b, t).isEqual(a.lerp(b, t))).toBe(true);
        }
    });

    it('returns a at t=0', () => {
        const a = new Color32(0, 0, 0, 255);
        const b = new Color32(255, 255, 255, 255);
        const result = Color32.lerp(a, b, 0);

        expect(result.r).toBe(0);
        expect(result.g).toBe(0);
        expect(result.b).toBe(0);
        expect(result.a).toBe(255);
    });

    it('returns b at t=1', () => {
        const a = new Color32(0, 0, 0, 255);
        const b = new Color32(255, 255, 255, 255);
        const result = Color32.lerp(a, b, 1);

        expect(result.r).toBe(255);
        expect(result.g).toBe(255);
        expect(result.b).toBe(255);
        expect(result.a).toBe(255);
    });

    it('returns midpoint at t=0.5 including alpha', () => {
        const a = new Color32(0, 0, 0, 0);
        const b = new Color32(200, 100, 50, 254);
        const result = Color32.lerp(a, b, 0.5);

        expect(result.r).toBe(100);
        expect(result.g).toBe(50);
        expect(result.b).toBe(25);
        expect(result.a).toBe(127);
    });

    it('clamps t outside [0, 1]', () => {
        const a = new Color32(100, 100, 100, 255);
        const b = new Color32(200, 200, 200, 255);

        expect(Color32.lerp(a, b, -5).r).toBe(100);
        expect(Color32.lerp(a, b, 10).r).toBe(200);
    });
});

describe('lerpInPlace', () => {
    it('modifies self and returns this', () => {
        const a = new Color32(0, 0, 0, 0);
        const b = new Color32(200, 100, 50, 254);
        const returned = a.lerpInPlace(b, 0.5);

        expect(returned).toBe(a);
        expect(a.r).toBe(100);
        expect(a.g).toBe(50);
        expect(a.b).toBe(25);
        expect(a.a).toBe(127);
    });

    it('at t=0 keeps original values', () => {
        const a = new Color32(42, 84, 126, 200);
        a.lerpInPlace(new Color32(255, 255, 255, 255), 0);

        expect(a.r).toBe(42);
        expect(a.g).toBe(84);
        expect(a.b).toBe(126);
        expect(a.a).toBe(200);
    });
});

describe('multiply', () => {
    it('performs component-wise multiply normalized by 255', () => {
        const a = new Color32(255, 128, 0, 255);
        const b = new Color32(128, 255, 255, 255);
        const result = a.multiply(b);

        // 255 * 128 / 255 = 128, 128 * 255 / 255 = 128, 0 * 255 / 255 = 0
        expect(result.r).toBe(128);
        expect(result.g).toBe(128);
        expect(result.b).toBe(0);
    });

    it('multiplying by white returns the same color', () => {
        const c = new Color32(100, 150, 200, 255);
        const result = c.multiply(new Color32(255, 255, 255, 255));

        expect(result.r).toBe(100);
        expect(result.g).toBe(150);
        expect(result.b).toBe(200);
    });

    it('multiplying by black returns black', () => {
        const c = new Color32(100, 150, 200, 255);
        const result = c.multiply(new Color32(0, 0, 0, 255));

        expect(result.r).toBe(0);
        expect(result.g).toBe(0);
        expect(result.b).toBe(0);
    });
});

describe('multiplyInPlace', () => {
    it('modifies self and returns this', () => {
        const a = new Color32(255, 128, 64, 255);
        const b = new Color32(128, 128, 128, 255);
        const returned = a.multiplyInPlace(b);

        expect(returned).toBe(a);
        expect(a.r).toBe(128);
        expect(a.g).toBe(64);
        expect(a.b).toBe(32);
    });
});

describe('add', () => {
    it('adds components and clamps to 255', () => {
        const a = new Color32(200, 100, 50, 200);
        const b = new Color32(100, 200, 50, 100);
        const result = a.add(b);

        expect(result.r).toBe(255); // 200 + 100 = 300, clamped
        expect(result.g).toBe(255); // 100 + 200 = 300, clamped
        expect(result.b).toBe(100); // 50 + 50
        expect(result.a).toBe(255); // 200 + 100 = 300, clamped
    });

    it('adding black returns the same color', () => {
        const c = new Color32(42, 84, 126, 200);
        const result = c.add(new Color32(0, 0, 0, 0));

        expect(result.r).toBe(42);
        expect(result.g).toBe(84);
        expect(result.b).toBe(126);
        expect(result.a).toBe(200);
    });
});

describe('addInPlace', () => {
    it('modifies self with clamping and returns this', () => {
        const a = new Color32(200, 100, 50, 128);
        const b = new Color32(100, 50, 25, 64);
        const returned = a.addInPlace(b);

        expect(returned).toBe(a);
        expect(a.r).toBe(255); // clamped
        expect(a.g).toBe(150);
        expect(a.b).toBe(75);
        expect(a.a).toBe(192);
    });
});

describe('premultiplyAlpha', () => {
    it('multiplies RGB by alpha/255', () => {
        const c = new Color32(200, 100, 50, 128);
        const pm = c.premultiplyAlpha();

        // 200 * (128/255) ~= 100, 100 * (128/255) ~= 50, 50 * (128/255) ~= 25
        expect(pm.r).toBe(100);
        expect(pm.g).toBe(50);
        expect(pm.b).toBe(25);
        expect(pm.a).toBe(128); // alpha unchanged
    });

    it('fully opaque color is unchanged', () => {
        const c = new Color32(100, 150, 200, 255);
        const pm = c.premultiplyAlpha();

        expect(pm.r).toBe(100);
        expect(pm.g).toBe(150);
        expect(pm.b).toBe(200);
    });

    it('fully transparent color zeroes RGB', () => {
        const c = new Color32(200, 150, 100, 0);
        const pm = c.premultiplyAlpha();

        expect(pm.r).toBe(0);
        expect(pm.g).toBe(0);
        expect(pm.b).toBe(0);
        expect(pm.a).toBe(0);
    });
});

describe('setRGBA', () => {
    it('sets all channels with clamping and returns this', () => {
        const c = new Color32(0, 0, 0, 0);
        const returned = c.setRGBA(300, -10, 128, 200);

        expect(returned).toBe(c);
        expect(c.r).toBe(255);
        expect(c.g).toBe(0);
        expect(c.b).toBe(128);
        expect(c.a).toBe(200);
    });

    it('truncates floats', () => {
        const c = new Color32();

        c.setRGBA(100.9, 50.1, 200.7, 128.3);

        expect(c.r).toBe(100);
        expect(c.g).toBe(50);
        expect(c.b).toBe(200);
        expect(c.a).toBe(128);
    });
});

describe('setRGBAUnchecked', () => {
    it('sets all channels without clamping and returns this', () => {
        const c = new Color32();
        const returned = c.setRGBAUnchecked(10, 20, 30, 40);

        expect(returned).toBe(c);
        expect(c.r).toBe(10);
        expect(c.g).toBe(20);
        expect(c.b).toBe(30);
        expect(c.a).toBe(40);
    });

    it('does not clamp invalid values', () => {
        const c = new Color32();

        c.setRGBAUnchecked(300, -5, 1000, 0);

        expect(c.r).toBe(300);
        expect(c.g).toBe(-5);
    });
});

describe('copyFrom', () => {
    it('copies all values from another Color32', () => {
        const source = new Color32(11, 22, 33, 44);
        const target = new Color32();
        const returned = target.copyFrom(source);

        expect(returned).toBe(target);
        expect(target.r).toBe(11);
        expect(target.g).toBe(22);
        expect(target.b).toBe(33);
        expect(target.a).toBe(44);
    });

    it("is independent after the copy (changing source doesn't affect target)", () => {
        const source = new Color32(11, 22, 33, 44);
        const target = new Color32();

        target.copyFrom(source);

        source.r = 255;

        expect(target.r).toBe(11);
    });
});

describe('luminance', () => {
    it('returns 255 for white', () => {
        const c = new Color32(255, 255, 255, 255);

        expect(c.luminance).toBeCloseTo(255, 5);
    });

    it('returns 0 for black', () => {
        const c = new Color32(0, 0, 0, 255);

        expect(c.luminance).toBeCloseTo(0, 5);
    });

    it('uses Rec.601 coefficients (green contributes most)', () => {
        const r = new Color32(255, 0, 0, 255).luminance;
        const g = new Color32(0, 255, 0, 255).luminance;
        const b = new Color32(0, 0, 255, 255).luminance;

        // Green should have the highest luminance contribution
        expect(g).toBeGreaterThan(r);
        expect(g).toBeGreaterThan(b);
        expect(r).toBeGreaterThan(b);
    });

    it('matches known Rec.601 output for a mixed color', () => {
        const c = new Color32(120, 65, 210, 255);

        expect(c.luminance).toBeCloseTo(97.975, 3);
    });
});

describe('INV_255 constant', () => {
    it('is approximately 1/255', () => {
        expect(INV_255).toBeCloseTo(1 / 255, 10);
    });
});
