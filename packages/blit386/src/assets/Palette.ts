/**
 * Palette asset implementation for palette-first rendering.
 *
 * The class stores mutable indexed {@link Color32} entries, supports named
 * index aliases, handles serialization, and exposes fixed-layout conversion
 * helpers used by the GPU palette uniform upload path ({@link Palette.toFloat32Array},
 * {@link Palette.isDirty}).
 */

import { Color32 } from '../utils/Color32';
import {
    hudRangeError,
    hudStartSlotError,
    paletteIndexNegativeError,
    paletteIndexOutOfRangeError,
} from '../utils/errorMessages';
import { HUD_SLOTS } from './palettes/hudData';
import { C64_HEX, CGA_HEX, GAMEBOY_HEX, NES_HEX, PICO8_HEX, VGA_HEX } from './palettes/presetData';

/** Uniform-buffer slot count used by the renderer regardless of active palette size. */
const GPU_SIZE = 256;

/** Number of normalized floats stored per palette color in GPU upload buffers. */
const GPU_FLOATS_PER_COLOR = 4;

/**
 * Number of bytes per palette color in packed RGB byte arrays.
 *
 * Used by {@link Palette.fromUint8Array} and {@link Palette.toUint8Array}.
 * Alpha is excluded from the packed format; it is always inferred as fully opaque.
 */
const RGB_BYTES_PER_COLOR = 3;

/**
 * JSON-serializable palette payload.
 *
 * `colors` stores `#RRGGBBAA` values and `names` maps friendly aliases to
 * palette indices.
 */
type Serialized = {
    colors: string[];
    names?: Record<string, number>;
    size: number;
};

/**
 * Checks whether a palette size is one of the supported indexed formats.
 *
 * @param size – Candidate palette size.
 * @returns `true` when the size is supported.
 */
function isValidSize(size: number): boolean {
    // Supported palette sizes exposed by the public API.
    const validSizes = [2, 4, 16, 32, 64, 128, 256] as const;

    return validSizes.includes(size as (typeof validSizes)[number]);
}

/**
 * Validates a palette size and throws for unsupported values.
 *
 * @param size – Palette size to validate.
 * @throws Error if the size is not one of the supported indexed formats.
 */
function validateSize(size: number): void {
    if (!isValidSize(size)) {
        throw new Error(`A palette can hold 2, 4, 16, 32, 64, 128, or 256 colors. Got ${size}.`);
    }
}

/**
 * Reads a preset or serialized hex color string at a known index.
 *
 * @param hexColors – Source hex color collection.
 * @param index – Entry index to read.
 * @param context – Human-readable context for thrown errors.
 * @returns Hex color string.
 * @throws Error if the requested entry is missing.
 */
function readHexColor(hexColors: readonly string[], index: number, context: string): string {
    // eslint-disable-next-line security/detect-object-injection -- Index is validated by the preset/serialization loops before access
    const hex = hexColors[index];

    if (hex === undefined) {
        throw new Error(`${context} color ${index} is missing`);
    }

    return hex;
}

/**
 * Reads a byte from a typed array and throws if it is unexpectedly missing.
 *
 * @param data – Source byte array.
 * @param index – Byte index to read.
 * @returns Byte value.
 * @throws Error if the requested byte is missing.
 */
function readByte(data: Uint8Array, index: number): number {
    // eslint-disable-next-line security/detect-object-injection -- Index is derived from validated RGB triplet offsets
    const value = data[index];

    if (value === undefined) {
        throw new Error(`Palette byte ${index} is missing`);
    }

    return value;
}

/**
 * Creates a palette preset from hex color data.
 *
 * Index `0` remains the reserved transparent entry. Preset data therefore
 * begins at index `1`.
 *
 * @param hexColors – Preset color data in `RRGGBB` format.
 * @param size – Palette size to construct.
 * @returns New palette populated with the preset colors.
 */
function createPreset(hexColors: readonly string[], size: number): Palette {
    const palette = new Palette(size);

    for (let i = 1; i < Math.min(size, hexColors.length); i++) {
        palette.set(i, Color32.fromHex(readHexColor(hexColors, i, 'Palette preset')));
    }

    return palette;
}

/**
 * Mutable palette of indexed {@link Color32} entries.
 *
 * The palette is the central color authority for all rendering:
 * - **Index 0 is always transparent.** It is initialized with `Color32.transparent`
 *   and cannot be set to an opaque color. The primitive and sprite shaders discard
 *   any fragment whose palette index resolves to alpha 0.
 * - **Variable sizes:** valid sizes are `2, 4, 16, 32, 64, 128, 256`. The active size
 *   determines the range for `set()` / `get()` and named-color lookups.
 * - **Fixed GPU layout:** `toFloat32Array()` always outputs `256 * 4` floats so the
 *   renderer can upload a stable 4 KB uniform block regardless of palette size.
 *   Slots beyond the active size are padded with transparent black.
 * - **Named aliases:** optional string tags map human-readable names to indices,
 *   e.g. `setNamed('player', 3)`. They carry no runtime cost when unused.
 * - **Mutable by design:** palette-effect features modify entries in place.
 *   Use `clone()` when a snapshot is needed before modification.
 *
 * @since 1.0.3
 */
export class Palette {
    /** Number of usable palette entries. */
    public readonly size: number;

    /** Indexed color entries. Index `0` is always transparent. */
    private readonly colors: Color32[];

    /** Optional human-readable aliases for palette indices. */
    private readonly namedIndices = new Map<string, number>();

    /**
     * True when colors have been mutated since the last GPU upload.
     *
     * Set by {@link set} and {@link copyFrom}. Cleared by {@link clearDirty} after
     * the renderer has uploaded the updated palette uniform buffer. Not set by the
     * constructor – initial upload is always triggered by {@link IRenderer.setPalette}.
     */
    private _isDirty: boolean = false;

    /**
     * Creates a new palette with the requested indexed size.
     *
     * @param size – Palette size. Must be one of `2, 4, 16, 32, 64, 128, 256`.
     */
    constructor(size: number = GPU_SIZE) {
        validateSize(size);

        this.size = size;
        this.colors = [Color32.transparent, ...Array.from({ length: size - 1 }, () => Color32.black.clone())];
    }

    /**
     * True when colors have been mutated since the last GPU upload.
     *
     * The renderer checks this flag each frame and re-uploads the palette uniform
     * buffer when it is set, then calls {@link clearDirty} to reset it. Palette
     * animation works automatically – no per-frame {@link BT.paletteSet} required.
     *
     * @returns `true` if any color has been written via {@link set} or {@link copyFrom}
     *   since the last call to {@link clearDirty}.
     */
    public get isDirty(): boolean {
        return this._isDirty;
    }

    /**
     * Reconstructs a palette from JSON data produced by {@link Palette.toJSON}.
     *
     * @param data – Serialized palette payload.
     * @returns Reconstructed palette.
     * @throws Error if the payload shape or size is invalid.
     */
    public static fromJSON(data: object): Palette {
        const json = data as Partial<Serialized>;
        const { colors, names, size } = json;

        if (Array.isArray(colors) && typeof size === 'number') {
            if (colors.length === size) {
                const palette = new Palette(size);
                const nameEntries = names ? Object.entries(names) : [];
                const colorSlotCount = colors.length - 1;

                for (let step = 0; step < colorSlotCount + nameEntries.length; step++) {
                    if (step < colorSlotCount) {
                        const index = step + 1;

                        palette.set(index, Color32.fromHex(readHexColor(colors, index, 'Palette JSON')));
                    } else {
                        const nameIndex = step - colorSlotCount;

                        // eslint-disable-next-line security/detect-object-injection -- nameIndex is bounded by the combined loop length
                        const nameEntry = nameEntries[nameIndex];

                        if (nameEntry) {
                            palette.setNamed(nameEntry[0], nameEntry[1]);
                        }
                    }
                }

                return palette;
            }

            throw new Error(`Palette JSON color count ${colors.length} does not match size ${size}`);
        }

        throw new Error("This doesn't look like a valid palette file. It needs 'colors' and 'size' fields.");
    }

    /**
     * Creates a palette from packed RGB bytes.
     *
     * @param data – Byte array containing RGB triplets.
     * @param size – Optional explicit palette size. When omitted, it is
     * inferred from `data.length / 3`.
     * @returns Reconstructed palette.
     * @throws Error if the byte length or palette size is invalid.
     */
    public static fromUint8Array(data: Uint8Array, size?: number): Palette {
        if (data.length % RGB_BYTES_PER_COLOR !== 0) {
            throw new Error(`Palette byte array length ${data.length} is not divisible by 3`);
        }

        const inferredSize = data.length / RGB_BYTES_PER_COLOR;
        const resolvedSize = size ?? inferredSize;

        validateSize(resolvedSize);

        if (data.length !== resolvedSize * RGB_BYTES_PER_COLOR) {
            throw new Error(`Palette byte array length ${data.length} does not match palette size ${resolvedSize}`);
        }

        const palette = new Palette(resolvedSize);

        for (let i = 1; i < resolvedSize; i++) {
            const offset = i * RGB_BYTES_PER_COLOR;

            // Fully opaque alpha value applied when deserializing RGB-only byte arrays.
            const opaqueAlpha = 255;

            palette.set(
                i,
                Color32.fromRGBAUnchecked(
                    readByte(data, offset),
                    readByte(data, offset + 1),
                    readByte(data, offset + 2),
                    opaqueAlpha,
                ),
            );
        }

        return palette;
    }

    /**
     * Creates the default VGA-style 256-color palette.
     *
     * @returns New VGA preset palette.
     */
    public static vga(): Palette {
        return createPreset(VGA_HEX, 256);
    }

    /**
     * Creates the classic CGA 16-color palette.
     *
     * @returns New CGA preset palette.
     */
    public static cga(): Palette {
        return createPreset(CGA_HEX, 16);
    }

    /**
     * Creates the Commodore 64 16-color palette.
     *
     * @returns New C64 preset palette.
     */
    public static c64(): Palette {
        return createPreset(C64_HEX, 16);
    }

    /**
     * Creates a four-shade Game Boy palette.
     *
     * @returns New Game Boy preset palette.
     */
    public static gameboy(): Palette {
        return createPreset(GAMEBOY_HEX, 4);
    }

    /**
     * Creates the PICO-8 16-color palette.
     *
     * @returns New PICO-8 preset palette.
     */
    public static pico8(): Palette {
        return createPreset(PICO8_HEX, 16);
    }

    /**
     * Creates a 64-slot NES palette.
     *
     * @returns New NES preset palette.
     */
    public static nes(): Palette {
        return createPreset(NES_HEX, 64);
    }

    /**
     * Writes the six built-in HUD colors into this palette and registers their
     * named aliases (`hud_white`, `hud_bg`, `hud_label`, `hud_header`, `hud_dim`,
     * `hud_code`).
     *
     * The six slots are written contiguously starting at `startSlot`. After calling
     * this, use `palette.getNamed('hud_white')` etc. to obtain the assigned indices
     * without hardcoding numbers.
     *
     * Default colors (matching common demo usage):
     * - `hud_white`  - `#ffffff` pure white
     * - `hud_bg`     - `#1e1428` dark purple background
     * - `hud_label`  - `#c8c8c8` medium gray labels
     * - `hud_header` - `#ffdc64` golden header text
     * - `hud_dim`    - `#646464` dim gray (FPS, secondary info)
     * - `hud_code`   - `#6496c8` slate blue code snippets
     *
     * @param startSlot – First palette index to write. Must be a positive integer >= 1
     *   and leave room for all six entries within the palette size. Defaults to `1`.
     * @throws Error if `startSlot` is not an integer, is NaN, or is less than 1.
     * @throws Error if the six entries would exceed the palette size.
     */
    public applyHUD(startSlot: number = 1): void {
        if (!Number.isInteger(startSlot) || startSlot < 1) {
            throw new Error(hudStartSlotError(startSlot));
        }

        if (startSlot + HUD_SLOTS.length > this.size) {
            throw new Error(hudRangeError(startSlot, HUD_SLOTS.length, this.size));
        }

        for (const [i, { hex, name }] of HUD_SLOTS.entries()) {
            const slot = startSlot + i;

            this.set(slot, Color32.fromHex(hex));
            this.setNamed(name, slot);
        }
    }

    /**
     * Writes a color into a palette slot.
     *
     * @param index – Palette index to overwrite.
     * @param color – Color to store.
     * @throws Error if the index is invalid or if index `0` is set opaque.
     */
    public set(index: number, color: Color32): void {
        this.assertIndexInRange(index);

        if (index === 0) {
            if (color.a !== 0) {
                throw new Error('Slot 0 is always see-through (transparent). Put solid colors in slot 1 or higher.');
            }

            this.colors[0] = Color32.transparent;
        } else {
            // eslint-disable-next-line security/detect-object-injection -- Index range is validated by assertIndexInRange above
            this.colors[index] = color.clone();
            this._isDirty = true;
        }
    }

    /**
     * Returns a copy of the color stored at a palette index.
     *
     * Returns a clone so callers cannot mutate internal state without going
     * through {@link set}, which keeps the dirty flag accurate.
     *
     * @param index – Palette index to read.
     * @returns Clone of the stored color entry.
     * @throws Error if the index is invalid.
     */
    public get(index: number): Color32 {
        this.assertIndexInRange(index);

        return this.colorAt(index).clone();
    }

    /**
     * Returns a direct reference to the internal {@link Color32} at the given index.
     *
     * Unlike {@link get}, this does **not** clone the entry. Mutations on the
     * returned object modify the palette in place without updating the dirty flag.
     * After modifying the entry, the caller **must** call {@link markDirty} so the
     * renderer knows to re-upload the palette to the GPU.
     *
     * This method exists for performance-critical paths (palette effects) where
     * per-frame cloning is unacceptable. Normal application code should prefer
     * {@link get} and {@link set} to keep the dirty flag accurate automatically.
     *
     * @param index – Palette index to access.
     * @returns Direct reference to the internal color entry.
     * @throws Error if the index is invalid.
     */
    public getRef(index: number): Color32 {
        this.assertIndexInRange(index);

        return this.colorAt(index);
    }

    /**
     * Associates a human-readable name with a palette index.
     *
     * @param name – Name to register.
     * @param index – Palette index referenced by the name.
     * @throws Error if the index is invalid.
     */
    public setNamed(name: string, index: number): void {
        this.assertIndexInRange(index);

        this.namedIndices.set(name, index);
    }

    /**
     * Looks up a previously named palette index.
     *
     * @param name – Registered color name.
     * @returns Palette index bound to the name.
     * @throws Error if the name is unknown.
     */
    public getNamed(name: string): number {
        const index = this.namedIndices.get(name);

        if (index === undefined) {
            throw new Error(
                `There's no color named '${name}' in this palette. Did you call palette.setNamed('${name}', someIndex) first?`,
            );
        }

        return index;
    }

    /**
     * Resolves a named color directly to its stored {@link Color32}.
     *
     * @param name – Registered color name.
     * @returns Color stored at the named index.
     * @throws Error if the name is unknown.
     */
    public getNamedColor(name: string): Color32 {
        return this.get(this.getNamed(name));
    }

    /**
     * Creates a deep copy of the palette, including named indices.
     *
     * The returned clone starts with a clean dirty flag regardless of the source
     * palette's state. When passed to {@link IRenderer.setPalette}, the renderer's
     * own dirty flag ensures the first upload.
     *
     * @returns Independent palette clone.
     */
    public clone(): Palette {
        const clone = new Palette(this.size);

        clone.copyFrom(this);
        clone.clearDirty();

        return clone;
    }

    /**
     * Copies colors and named indices from another palette into this one.
     *
     * Marks the palette dirty so the renderer will re-upload the uniform buffer on
     * the next frame. Entries outside the source palette range are reset to
     * transparent in the destination. Named indices that do not fit inside the
     * destination size are ignored.
     *
     * @param other – Source palette to copy from.
     */
    public copyFrom(other: Palette): void {
        const copyCount = Math.min(this.size, other.size);

        this.colors[0] = Color32.transparent;

        for (let i = 1; i < this.size; i++) {
            // eslint-disable-next-line security/detect-object-injection -- Loop bounds restrict i to valid initialized source and destination indices
            this.colors[i] = i < copyCount ? other.colorAt(i).clone() : Color32.transparent.clone();
        }

        this.copyNamedIndices(other);

        this._isDirty = true;
    }

    /**
     * Clears the dirty flag after the renderer has uploaded the palette to the GPU.
     *
     * Do not call this from application code. It is part of the internal renderer
     * contract between {@link Palette} and {@link IRenderer}.
     */
    public clearDirty(): void {
        this._isDirty = false;
    }

    /**
     * Marks the palette as modified so the renderer re-uploads it on the next frame.
     *
     * Call this after mutating entries obtained via {@link getRef}. The {@link set}
     * and {@link copyFrom} methods set the dirty flag automatically; this method is
     * only needed when bypassing them for performance.
     */
    public markDirty(): void {
        this._isDirty = true;
    }

    /**
     * Serializes the palette into a JSON-friendly structure.
     *
     * @returns Plain object containing size, colors, and optional names.
     */
    public toJSON(): Serialized {
        return {
            colors: this.colors.map((color) => color.toHex()),
            names: Object.fromEntries(this.namedIndices.entries()),
            size: this.size,
        };
    }

    /**
     * Exports palette colors as packed RGB bytes.
     *
     * Alpha is intentionally omitted because palette serialization for sprite
     * indexization only needs raw RGB triplets.
     *
     * @returns Byte array with `size * 3` entries.
     */
    public toUint8Array(): Uint8Array {
        return new Uint8Array(this.colors.flatMap((color) => [color.r, color.g, color.b]));
    }

    /**
     * Converts the palette into the fixed-size GPU uniform layout.
     *
     * The returned buffer always contains `256 * 4` floats, so the renderer can
     * upload a stable 4 KB uniform block regardless of the active palette size.
     *
     * @returns Float buffer containing normalized RGBA values.
     */
    public toFloat32Array(): Float32Array {
        const floats = new Float32Array(GPU_SIZE * GPU_FLOATS_PER_COLOR);

        this.toFloat32ArrayInto(floats);

        return floats;
    }

    /**
     * Writes the palette into an existing Float32Array in the fixed-size GPU uniform layout.
     *
     * The target must be at least `256 * 4` floats long. Slots beyond the active
     * palette size are left unchanged in the target buffer. {@link toFloat32Array}
     * zero-initializes a fresh 256-slot buffer before calling this method.
     *
     * @param target – Pre-allocated float buffer to write normalized RGBA values into.
     */
    public toFloat32ArrayInto(target: Float32Array): void {
        for (let i = 0; i < this.size; i++) {
            this.colorAt(i).writeToFloat32Array(target, i * GPU_FLOATS_PER_COLOR);
        }
    }

    /**
     * Searches the palette for an exact color match.
     *
     * @param color – Color to search for.
     * @returns Matching palette index, or `-1` when no exact match exists.
     */
    public findColor(color: Color32): number {
        return this.colors.findIndex((c) => c.isEqual(color));
    }

    /**
     * Formats the palette as a short debugging string.
     *
     * @returns Human-readable summary.
     */
    public toString(): string {
        return `Palette(size=${this.size}, colors=${this.size}, names=${this.namedIndices.size})`;
    }

    /**
     * Copies named index aliases from another palette into this one.
     *
     * Aliases that reference an index outside this palette's size are ignored.
     * Clears the current named index map before copying.
     *
     * @param from – Source palette to copy named indices from.
     */
    private copyNamedIndices(from: Palette): void {
        this.namedIndices.clear();

        for (const [name, index] of from.namedIndices.entries()) {
            if (index < this.size) {
                this.namedIndices.set(name, index);
            }
        }
    }

    /**
     * Validates that a palette index is within the active palette size.
     *
     * @param index – Palette index to validate.
     * @throws Error if the index is outside the active palette size.
     */
    private assertIndexInRange(index: number): void {
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(paletteIndexNegativeError(index));
        }

        if (index >= this.size) {
            throw new Error(paletteIndexOutOfRangeError(index, this.size));
        }
    }

    /**
     * Returns a palette color after initialization checks.
     *
     * @param index – Palette index to resolve.
     * @returns Stored color instance.
     * @throws Error if the entry is unexpectedly uninitialized.
     */
    private colorAt(index: number): Color32 {
        // eslint-disable-next-line security/detect-object-injection -- Callers validate indices before lookup
        const color = this.colors[index];

        if (color === undefined) {
            throw new Error(`Palette color ${index} is not initialized`);
        }

        return color;
    }
}
