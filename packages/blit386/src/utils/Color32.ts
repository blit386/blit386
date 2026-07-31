/**
 * 32-bit RGBA color with 8-bit channels.
 *
 * The type provides cached singleton colors, packing and conversion helpers,
 * and a mix of allocation-free and convenience APIs for renderer code.
 */

/** Reciprocal of 255 used for fast byte-to-float normalization. */
export const INV_255 = 1 / 255;

/** Precomputed lookup table for byte-to-hex conversion. */
const HEX_TABLE: string[] = new Array(256);

/** Strict hex token validator used for exact substring checks in fromHex parsing. */
const HEX_TOKEN_PATTERN = /^[0-9A-Fa-f]+$/;

for (let i = 0; i < 256; i++) {
    // eslint-disable-next-line security/detect-object-injection
    HEX_TABLE[i] = i.toString(16).padStart(2, '0');
}

/**
 * Mutable 32-bit RGBA color value with 8-bit channels.
 *
 * @since 0.1.0
 */
export class Color32 {
    /** The cached singleton for white color. */
    private static readonly _white: Color32 = Object.freeze(Color32.fromRGBAUnchecked(255, 255, 255, 255));

    /** The cached singleton for black color. */
    private static readonly _black: Color32 = Object.freeze(Color32.fromRGBAUnchecked(0, 0, 0, 255));

    /** The cached singleton for transparent color. */
    private static readonly _transparent: Color32 = Object.freeze(Color32.fromRGBAUnchecked(0, 0, 0, 0));

    /** The cached singleton for red color. */
    private static readonly _red: Color32 = Object.freeze(Color32.fromRGBAUnchecked(255, 0, 0, 255));

    /** The cached singleton for green color. */
    private static readonly _green: Color32 = Object.freeze(Color32.fromRGBAUnchecked(0, 255, 0, 255));

    /** The cached singleton for blue color. */
    private static readonly _blue: Color32 = Object.freeze(Color32.fromRGBAUnchecked(0, 0, 255, 255));

    /** The cached singleton for yellow color. */
    private static readonly _yellow: Color32 = Object.freeze(Color32.fromRGBAUnchecked(255, 255, 0, 255));

    /** The cached singleton for cyan color. */
    private static readonly _cyan: Color32 = Object.freeze(Color32.fromRGBAUnchecked(0, 255, 255, 255));

    /** Cached singleton for magenta color. */
    private static readonly _magenta: Color32 = Object.freeze(Color32.fromRGBAUnchecked(255, 0, 255, 255));

    /** Internal named-color registry used by string color resolution. */
    private static readonly namedColors: Map<string, Color32> = Color32.createNamedMap();

    /** Red channel (0-255). */
    public r: number;

    /** Green channel (0-255). */
    public g: number;

    /** Blue channel (0-255). */
    public b: number;

    /** Alpha channel (0-255). */
    public a: number;

    /**
     * Creates a clamped 8-bit RGBA color.
     *
     * @param r - Red channel (0-255, defaults to 255).
     * @param g - Green channel (0-255, defaults to 255).
     * @param b - Blue channel (0-255, defaults to 255).
     * @param a - Alpha channel (0-255, defaults to 255 = opaque).
     */
    constructor(r: number = 255, g: number = 255, b: number = 255, a: number = 255) {
        // Clamp and truncate to integer using optimized clampByte helper.
        this.r = clampByte(r);
        this.g = clampByte(g);
        this.b = clampByte(b);
        this.a = clampByte(a);
    }

    /**
     * Pure white color (255, 255, 255, 255).
     * Cached frozen singleton - do not modify.
     * @returns The shared white Color32 instance.
     */
    static get white(): Color32 {
        return Color32._white;
    }

    /**
     * Pure black color (0, 0, 0, 255).
     * Cached frozen singleton - do not modify.
     * @returns The shared black Color32 instance.
     */
    static get black(): Color32 {
        return Color32._black;
    }

    /**
     * Fully transparent color (0, 0, 0, 0).
     * Cached frozen singleton - do not modify.
     * @returns The shared transparent Color32 instance.
     */
    static get transparent(): Color32 {
        return Color32._transparent;
    }

    /**
     * Pure red color (255, 0, 0, 255).
     * Cached frozen singleton - do not modify.
     * @returns The shared red Color32 instance.
     */
    static get red(): Color32 {
        return Color32._red;
    }

    /**
     * Pure green color (0, 255, 0, 255).
     * Cached frozen singleton - do not modify.
     * @returns The shared green Color32 instance.
     */
    static get green(): Color32 {
        return Color32._green;
    }

    /**
     * Pure blue color (0, 0, 255, 255).
     * Cached frozen singleton - do not modify.
     * @returns The shared blue Color32 instance.
     */
    static get blue(): Color32 {
        return Color32._blue;
    }

    /**
     * Yellow color (255, 255, 0, 255).
     * Cached frozen singleton - do not modify.
     * @returns The shared yellow Color32 instance.
     */
    static get yellow(): Color32 {
        return Color32._yellow;
    }

    /**
     * Cyan color (0, 255, 255, 255).
     * Cached frozen singleton - do not modify.
     * @returns The shared cyan Color32 instance.
     */
    static get cyan(): Color32 {
        return Color32._cyan;
    }

    /**
     * Magenta color (255, 0, 255, 255).
     * Cached frozen singleton - do not modify.
     * @returns The shared magenta Color32 instance.
     */
    static get magenta(): Color32 {
        return Color32._magenta;
    }

    /**
     * Perceived (Rec. 601) luminance of this color, ignoring alpha.
     *
     * @returns Luminance value in range 0-255 using 0.299*R + 0.587*G + 0.114*B.
     */
    get luminance(): number {
        return this.r * 0.299 + this.g * 0.587 + this.b * 0.114;
    }

    /**
     * Creates a grayscale color with equal RGB values.
     *
     * @param value - Brightness level (0-255).
     * @returns Opaque gray color.
     */
    static gray(value: number): Color32 {
        return new Color32(value, value, value, 255);
    }

    /**
     * Linearly interpolates between two colors.
     * Each RGBA channel is interpolated independently. `t` is clamped to [0, 1].
     *
     * @param a - Color at t = 0.
     * @param b - Color at t = 1.
     * @param t - Interpolation factor (0.0 = `a`, 1.0 = `b`).
     * @returns New color blended between `a` and `b`.
     */
    static lerp(a: Color32, b: Color32, t: number): Color32 {
        return a.lerp(b, t);
    }

    /**
     * Registers a named color in the global color registry.
     * Name matching is case-insensitive and trims surrounding whitespace.
     *
     * @param name - Named color key (for example `cornflowerblue`).
     * @param color - Color value to store for that name.
     * @throws Error when name is empty after normalization or already exists.
     */
    static registerColor(name: string, color: Color32): void {
        const normalizedName = Color32.normalizeColorName(name);

        if (Color32.namedColors.has(normalizedName)) {
            throw new Error(`Named color '${normalizedName}' is already registered.`);
        }

        Color32.namedColors.set(normalizedName, Color32.freezeSingleton(color));
    }

    /**
     * Updates an existing named color in the global color registry.
     * Name matching is case-insensitive and trims surrounding whitespace.
     * All alias keys that share the same object reference are updated in sync.
     *
     * @param name - Existing named color key (or any alias).
     * @param color - Replacement color value.
     * @throws Error when name is empty after normalization or not registered.
     */
    static updateColor(name: string, color: Color32): void {
        const normalizedName = Color32.normalizeColorName(name);
        const current = Color32.namedColors.get(normalizedName);

        if (current === undefined) {
            throw new Error(`Named color '${normalizedName}' is not registered.`);
        }

        const frozen = Color32.freezeSingleton(color);

        for (const [key, value] of Color32.namedColors) {
            if (value === current) {
                Color32.namedColors.set(key, frozen);
            }
        }
    }

    /**
     * Removes a named color from the global color registry.
     * Name matching is case-insensitive and trims surrounding whitespace.
     * All alias keys that share the same object reference are removed in sync.
     *
     * @param name - Existing named color key (or any alias).
     * @throws Error when name is empty after normalization or not registered.
     */
    static unregisterColor(name: string): void {
        const normalizedName = Color32.normalizeColorName(name);
        const current = Color32.namedColors.get(normalizedName);

        if (current === undefined) {
            throw new Error(`Named color '${normalizedName}' is not registered.`);
        }

        const keysToDelete: string[] = [];

        for (const [key, value] of Color32.namedColors) {
            if (value === current) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            Color32.namedColors.delete(key);
        }
    }

    /**
     * Looks up a named color from the global registry.
     * Name matching is case-insensitive and trims surrounding whitespace.
     *
     * @param name - Named color key to resolve.
     * @returns Frozen singleton color, or `undefined` when the name is unknown.
     */
    static resolveNamedColor(name: string): Color32 | undefined {
        const normalizedName = Color32.normalizeColorName(name);
        return Color32.namedColors.get(normalizedName);
    }

    /**
     * Creates a color without clamping or validation.
     *
     * Intended for trusted hot paths where channel values are already known to
     * be valid byte-range numbers.
     *
     * @param r - Red channel (must be integer 0-255).
     * @param g - Green channel (must be integer 0-255).
     * @param b - Blue channel (must be integer 0-255).
     * @param a - Alpha channel (must be integer 0-255).
     * @returns New Color32 with the specified values.
     */
    static fromRGBAUnchecked(r: number, g: number, b: number, a: number): Color32 {
        const color = Object.create(Color32.prototype) as Color32;

        color.r = r;
        color.g = g;
        color.b = b;
        color.a = a;

        return color;
    }

    /**
     * Creates a color from a packed 32-bit unsigned integer (ABGR format).
     * Inverse of toUint32().
     *
     * @param uint32 - Packed color value (A << 24 | B << 16 | G << 8 | R).
     * @returns New color unpacked from the integer.
     */
    static fromUint32(uint32: number): Color32 {
        return Color32.fromRGBAUnchecked(
            uint32 & 0xff, // R.
            (uint32 >>> 8) & 0xff, // G.
            (uint32 >>> 16) & 0xff, // B.
            (uint32 >>> 24) & 0xff, // A.
        );
    }

    /**
     * Parses a CSS-style hex color string.
     * Supports `#RGB`, `#RGBA`, `#RRGGBB`, and `#RRGGBBAA`.
     *
     * @param hex - Hex color string with or without leading #.
     * @returns Parsed color.
     * @throws Error if the hex string format is invalid.
     */
    static fromHex(hex: string): Color32 {
        // Skip # if present (charCode 35 = '#').
        const start = hex.charCodeAt(0) === 35 ? 1 : 0;
        const len = hex.length - start;

        let r: number;
        let g: number;
        let b: number;
        let a: number = 255;

        if (len === 6 || len === 8) {
            // Parse RGB as a single integer, then extract bytes (reduces parseInt calls).
            const rgb = parseHexToken(hex, start, 6);

            r = (rgb >> 16) & 0xff;
            g = (rgb >> 8) & 0xff;
            b = rgb & 0xff;

            if (len === 8) {
                a = parseHexToken(hex, start + 6, 2);
            }
        } else if (len === 3 || len === 4) {
            // Parse RGB as a single integer, then extract nibbles and expand to bytes.
            // For a short hex, each digit represents a nibble that expands: F -> FF (0xF * 17 = 0xFF).
            const rgb = parseHexToken(hex, start, 3);

            r = ((rgb >> 8) & 0xf) * 17;
            g = ((rgb >> 4) & 0xf) * 17;
            b = (rgb & 0xf) * 17;

            if (len === 4) {
                const parsedA = parseHexToken(hex, start + 3, 1);

                a = parsedA * 17;
            }
        } else {
            throwInvalidHex(hex);
        }

        // Validation passed, use unchecked factory.
        return Color32.fromRGBAUnchecked(r, g, b, a);
    }

    /**
     * Creates a color from normalized float components in the `0.0-1.0` range.
     *
     * @param r - Red channel (0.0-1.0).
     * @param g - Green channel (0.0-1.0).
     * @param b - Blue channel (0.0-1.0).
     * @param a - Alpha channel (0.0-1.0, defaults to 1.0).
     * @returns New color converted from float values.
     */
    static fromFloat(r: number, g: number, b: number, a: number = 1): Color32 {
        return new Color32(r * 255, g * 255, b * 255, a * 255);
    }

    /**
     * Creates a color from HSL values.
     *
     * @param h - Hue in degrees (0-360).
     * @param s - Saturation as percentage (0-100).
     * @param l - Lightness as percentage (0-100).
     * @param a - Alpha channel (0-255, defaults to 255).
     * @returns New color converted from HSL values.
     */
    static fromHSL(h: number, s: number, l: number, a: number = 255): Color32 {
        const hNorm = h / 360;
        const sNorm = s / 100;
        const lNorm = l / 100;

        let r, g, b;

        if (sNorm === 0) {
            r = g = b = lNorm;
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                let tc = t;
                if (tc < 0) {
                    tc += 1;
                }

                if (tc > 1) {
                    tc -= 1;
                }

                if (tc < 1 / 6) {
                    return p + (q - p) * 6 * tc;
                }

                if (tc < 1 / 2) {
                    return q;
                }

                if (tc < 2 / 3) {
                    return p + (q - p) * (2 / 3 - tc) * 6;
                }

                return p;
            };

            const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
            const p = 2 * lNorm - q;

            r = hue2rgb(p, q, hNorm + 1 / 3);
            g = hue2rgb(p, q, hNorm);
            b = hue2rgb(p, q, hNorm - 1 / 3);
        }

        return new Color32(Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255), a);
    }

    /**
     * Creates the default CSS-like named-color registry.
     *
     * @returns Map of normalized names to frozen singleton Color32 values.
     */
    private static createNamedMap(): Map<string, Color32> {
        const map = new Map<string, Color32>();
        const define = (name: string, r: number, g: number, b: number, a: number = 255): void => {
            map.set(name, Object.freeze(Color32.fromRGBAUnchecked(r, g, b, a)));
        };
        const alias = (name: string, target: string): void => {
            const value = map.get(target);
            if (value === undefined) {
                throw new Error(`Named color alias target '${target}' is not registered.`);
            }
            map.set(name, value);
        };

        define('black', 0, 0, 0);
        define('white', 255, 255, 255);
        define('red', 255, 0, 0);
        define('green', 0, 255, 0);
        define('blue', 0, 0, 255);
        define('yellow', 255, 255, 0);
        define('cyan', 0, 255, 255);
        define('magenta', 255, 0, 255);
        define('gray', 128, 128, 128);
        alias('grey', 'gray');

        define('orange', 255, 165, 0);
        define('pink', 255, 192, 203);
        define('purple', 128, 0, 128);
        define('brown', 165, 42, 42);
        define('lime', 0, 255, 0);
        define('navy', 0, 0, 128);
        define('teal', 0, 128, 128);
        define('maroon', 128, 0, 0);
        define('olive', 128, 128, 0);
        define('coral', 255, 127, 80);
        define('gold', 255, 215, 0);
        define('silver', 192, 192, 192);
        define('indigo', 75, 0, 130);
        define('violet', 238, 130, 238);
        define('turquoise', 64, 224, 208);
        define('salmon', 250, 128, 114);
        define('khaki', 240, 230, 140);
        define('plum', 221, 160, 221);
        define('crimson', 220, 20, 60);
        define('tomato', 255, 99, 71);
        define('cornflowerblue', 100, 149, 237);

        return map;
    }

    /**
     * Normalizes a named-color key for case-insensitive lookups.
     *
     * @param name - Input color name.
     * @returns Trimmed lowercase name.
     * @throws Error when the normalized name is empty.
     */
    private static normalizeColorName(name: string): string {
        const normalizedName = name.trim().toLowerCase();
        if (normalizedName.length === 0) {
            throw new Error('Color name cannot be empty.');
        }

        return normalizedName;
    }

    /**
     * Clones and freezes a color so registry entries are immutable singletons.
     *
     * @param color - Source color to freeze.
     * @returns Frozen singleton copy.
     */
    private static freezeSingleton(color: Color32): Color32 {
        return Object.freeze(Color32.fromRGBAUnchecked(color.r, color.g, color.b, color.a));
    }

    /**
     * Converts color to Float32Array for WebGPU uniform buffers.
     * Values are normalized to the 0.0-1.0 range.
     *
     * Note: This allocates a new Float32Array. For hot paths, use
     * writeToFloat32Array() with a pre-allocated buffer instead.
     *
     * @returns Float32Array with [r, g, b, a] in 0.0-1.0 range.
     */
    toFloat32Array(): Float32Array {
        return new Float32Array([this.r * INV_255, this.g * INV_255, this.b * INV_255, this.a * INV_255]);
    }

    /**
     * Writes normalized color values to an existing Float32Array.
     * This avoids allocation and is preferred for render loops.
     *
     * Note: For maximum performance in tight loops, consider accessing
     * r/g/b/a directly and dividing by 255 inline to avoid method call overhead.
     *
     * @param target - The Float32Array to write to.
     * @param offset - Starting index in the array (default: 0).
     */
    writeToFloat32Array(target: Float32Array, offset: number = 0): void {
        // Using direct index assignment for the best performance.
        // This is safe: offset is truncated to integer, the target is a typed Float32Array.
        const i = offset | 0;

        // eslint-disable-next-line security/detect-object-injection
        target[i] = this.r * INV_255;
        target[i + 1] = this.g * INV_255;
        target[i + 2] = this.b * INV_255;
        target[i + 3] = this.a * INV_255;
    }

    /**
     * Converts color to normalized float values (0.0-1.0).
     * Useful for shader uniforms and GPU operations.
     *
     * Note: This allocates a new object. For hot paths, consider
     * accessing r/g/b/a directly and dividing by 255.
     *
     * @returns Object with r, g, b, a properties in 0.0-1.0 range.
     */
    toFloatRGBA(): { r: number; g: number; b: number; a: number } {
        return {
            r: this.r * INV_255,
            g: this.g * INV_255,
            b: this.b * INV_255,
            a: this.a * INV_255,
        };
    }

    /**
     * Packs color into a 32-bit unsigned integer (ABGR layout).
     *
     * @returns 32-bit color value as `(A << 24 | B << 16 | G << 8 | R)`.
     */
    toUint32(): number {
        return (this.a << 24) | (this.b << 16) | (this.g << 8) | this.r;
    }

    /**
     * Converts color to CSS hex string format.
     *
     * @returns Hex string in the format "#RRGGBBAA".
     */
    toHex(): string {
        return `#${HEX_TABLE[this.r]}${HEX_TABLE[this.g]}${HEX_TABLE[this.b]}${HEX_TABLE[this.a]}`;
    }

    /**
     * Converts color to CSS rgba() string format.
     * Useful for DOM styling and canvas operations.
     *
     * @returns CSS string in the format "rgba(r, g, b, a)" where a is 0.0-1.0.
     */
    toCSS(): string {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${(this.a * INV_255).toFixed(3)})`;
    }

    /**
     * Formats the color as a readable string.
     *
     * @returns String in format "Color32(r, g, b, a)".
     */
    toString(): string {
        return `Color32(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
    }

    /**
     * Checks if this color equals another (all channels match).
     *
     * @param other - Color to compare with.
     * @returns True if all RGBA channels are identical.
     */
    isEqual(other: Color32): boolean {
        // Simple comparison with early exit on the first mismatch.
        // Modern JS engines optimize this well.
        return (
            other !== null &&
            other !== undefined &&
            this.r === other.r &&
            this.g === other.g &&
            this.b === other.b &&
            this.a === other.a
        );
    }

    /**
     * Backward-compatible alias for {@link isEqual}.
     *
     * @deprecated Deprecated since 0.1.0 (2026-05-31). Use {@link isEqual} instead.
     * @param other - Color to compare with.
     * @returns True if all RGBA channels are identical.
     */
    equals(other: Color32): boolean {
        return this.isEqual(other);
    }

    /**
     * Creates an independent copy of this color.
     *
     * @returns New Color32 with same RGBA values.
     */
    clone(): Color32 {
        // Use unchecked factory since values are already valid.
        return Color32.fromRGBAUnchecked(this.r, this.g, this.b, this.a);
    }

    /**
     * Creates a new color with modified alpha, keeping RGB unchanged.
     *
     * @param alpha - New alpha value (0-255).
     * @returns New color with updated alpha.
     */
    withAlpha(alpha: number): Color32 {
        return Color32.fromRGBAUnchecked(this.r, this.g, this.b, clampByte(alpha));
    }

    /**
     * Creates a new color with modified RGB, keeping alpha unchanged.
     *
     * @param r - New red value (0-255).
     * @param g - New green value (0-255).
     * @param b - New blue value (0-255).
     * @returns New color with updated RGB.
     */
    withRGB(r: number, g: number, b: number): Color32 {
        return new Color32(r, g, b, this.a);
    }

    /**
     * Returns the inverted color (negative).
     * Alpha channel remains unchanged.
     *
     * @returns New color with RGB channels inverted.
     */
    invert(): Color32 {
        return Color32.fromRGBAUnchecked(255 - this.r, 255 - this.g, 255 - this.b, this.a);
    }

    /**
     * Linearly interpolates between this color and another.
     * Useful for color transitions and gradients.
     *
     * @param other - Target color to blend toward.
     * @param t - Interpolation factor (0.0 = this color, 1.0 = other color).
     * @returns New color blended between this and other.
     */
    lerp(other: Color32, t: number): Color32 {
        const tc = clampUnit(t);

        // Optimized lerp: use formula a * (1-t) + b * t to reduce operations.
        const oneMinusT = 1 - tc;

        return Color32.fromRGBAUnchecked(
            (this.r * oneMinusT + other.r * tc) | 0,
            (this.g * oneMinusT + other.g * tc) | 0,
            (this.b * oneMinusT + other.b * tc) | 0,
            (this.a * oneMinusT + other.a * tc) | 0,
        );
    }

    /**
     * Linearly interpolates this color toward another, modifying in place.
     * Use this in hot loops to avoid object allocation.
     *
     * @param other - Target color to blend toward.
     * @param t - Interpolation factor (0.0 = this color, 1.0 = other color).
     * @returns This color instance for chaining.
     */
    lerpInPlace(other: Color32, t: number): this {
        const tc = clampUnit(t);

        const oneMinusT = 1 - tc;

        this.r = (this.r * oneMinusT + other.r * tc) | 0;
        this.g = (this.g * oneMinusT + other.g * tc) | 0;
        this.b = (this.b * oneMinusT + other.b * tc) | 0;
        this.a = (this.a * oneMinusT + other.a * tc) | 0;

        return this;
    }

    /**
     * Multiplies this color by another color component-wise.
     * Useful for tinting and color modulation.
     *
     * @param other - Color to multiply with.
     * @returns New color with each channel multiplied and normalized.
     */
    multiply(other: Color32): Color32 {
        return Color32.fromRGBAUnchecked(
            (this.r * other.r * INV_255) | 0,
            (this.g * other.g * INV_255) | 0,
            (this.b * other.b * INV_255) | 0,
            (this.a * other.a * INV_255) | 0,
        );
    }

    /**
     * Multiplies this color by another color component-wise, modifying in place.
     * Use this in hot loops to avoid object allocation.
     *
     * @param other - Color to multiply with.
     * @returns This color instance for chaining.
     */
    multiplyInPlace(other: Color32): this {
        this.r = (this.r * other.r * INV_255) | 0;
        this.g = (this.g * other.g * INV_255) | 0;
        this.b = (this.b * other.b * INV_255) | 0;
        this.a = (this.a * other.a * INV_255) | 0;

        return this;
    }

    /**
     * Adds another color to this one, clamping to valid range.
     * Useful for additive blending effects.
     *
     * @param other - Color to add.
     * @returns New color with summed channels (clamped to 0-255).
     */
    add(other: Color32): Color32 {
        return new Color32(this.r + other.r, this.g + other.g, this.b + other.b, this.a + other.a);
    }

    /**
     * Adds another color to this one in place, clamping to valid range.
     * Use this in hot loops to avoid object allocation.
     *
     * @param other - Color to add.
     * @returns This color instance for chaining.
     */
    addInPlace(other: Color32): this {
        this.r = clampByte(this.r + other.r);
        this.g = clampByte(this.g + other.g);
        this.b = clampByte(this.b + other.b);
        this.a = clampByte(this.a + other.a);

        return this;
    }

    /**
     * Returns a new color with premultiplied alpha.
     * Alpha multiplies RGB channels, useful for blending operations.
     *
     * @returns New color with premultiplied alpha.
     */
    premultiplyAlpha(): Color32 {
        const alphaMul = this.a * INV_255;

        return Color32.fromRGBAUnchecked(
            (this.r * alphaMul) | 0,
            (this.g * alphaMul) | 0,
            (this.b * alphaMul) | 0,
            this.a,
        );
    }

    /**
     * Sets all RGBA channels at once, with validation.
     * Use this to reuse a Color32 instance instead of creating a new one.
     *
     * @param r - Red channel (0-255).
     * @param g - Green channel (0-255).
     * @param b - Blue channel (0-255).
     * @param a - Alpha channel (0-255).
     * @returns This color instance for chaining.
     */
    setRGBA(r: number, g: number, b: number, a: number): this {
        this.r = clampByte(r);
        this.g = clampByte(g);
        this.b = clampByte(b);
        this.a = clampByte(a);

        return this;
    }

    /**
     * Sets all RGBA channels at once without validation.
     * Use this in hot paths when values are guaranteed to be valid integers 0-255.
     *
     * WARNING: Passing invalid values will result in undefined behavior.
     *
     * @param r - Red channel (must be integer 0-255).
     * @param g - Green channel (must be integer 0-255).
     * @param b - Blue channel (must be integer 0-255).
     * @param a - Alpha channel (must be integer 0-255).
     * @returns This color instance for chaining.
     */
    setRGBAUnchecked(r: number, g: number, b: number, a: number): this {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;

        return this;
    }

    /**
     * Copies values from another Color32 instance.
     * Use this to reuse a Color32 instance instead of creating a new one.
     *
     * @param other - Color to copy from.
     * @returns This color instance for chaining.
     */
    copyFrom(other: Color32): this {
        this.r = other.r;
        this.g = other.g;
        this.b = other.b;
        this.a = other.a;

        return this;
    }
}

/**
 * Clamps a number to the 0-255 byte range and truncates to integer.
 * Optimized for the common case of color channel clamping.
 * Exported for use in other utilities that work with byte values.
 *
 * @param n - Value to clamp.
 * @returns Integer in range 0-255.
 */
export function clampByte(n: number): number {
    // Bitwise operations: if n < 0, use 0; if n > 255, use 255; else truncate n.
    // This is faster than Math.max(0, Math.min(255, n)) | 0.
    return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

/**
 * Clamps a unit interpolation factor to the closed interval [0, 1].
 *
 * @param t - Raw interpolation factor.
 * @returns Clamped factor in range 0-1.
 */
export function clampUnit(t: number): number {
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Throws a standardized beginner-friendly error for invalid hex colors.
 *
 * @param hex - Original input string.
 */
function throwInvalidHex(hex: string): never {
    throw new Error(
        `The color '${hex}' isn't a valid hex color. Use a format like '#FF0000' (red), '#00FF00' (green), or '#0000FF' (blue). You can also use short form like '#F00'.`,
    );
}

/**
 * Parses an exact-length hex substring and rejects partial/invalid tokens.
 *
 * @param hex - Original full hex string.
 * @param start - Token start index in the full string.
 * @param length - Expected token length.
 * @returns Parsed base-16 number.
 */
function parseHexToken(hex: string, start: number, length: number): number {
    const token = hex.substring(start, start + length);

    if (token.length !== length || !HEX_TOKEN_PATTERN.test(token)) {
        throwInvalidHex(hex);
    }

    return parseInt(token, 16);
}
