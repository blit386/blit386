/**
 * Palette indexing for {@link SpriteSheet}: the registry of indexized sheets that
 * `BT.spritesRefresh` walks, RGBA-to-index mapping, palette color discovery for
 * `loadColorsIntoPalette`, and the used-index scan behind the dev overlay.
 */

import { markIndexUsed } from '../core/RenderPaletteUsage';
import { assertDimensions } from '../utils/AssetLimits';
import { Color32 } from '../utils/Color32';
import { spriteColorNotInPaletteError } from '../utils/errorMessages';
import type { Rect2i } from '../utils/Rect2i';
import type { Palette } from './Palette';
import { MAX_PALETTE_SIZE, TRANSPARENT_PALETTE_INDEX } from './Palette';
import type { SpriteSheet } from './SpriteSheet';

/** Reused per-call bitmask of sheet indices seen while scanning a source rect. */
const MARK_INDICES_IN_RECT_SCRATCH = new Uint8Array(MAX_PALETTE_SIZE);

/** Depth or array-layer count for a 2-D GPU texture descriptor. */
const TEXTURE_LAYER_COUNT = 1;

/** RGBA byte stride per pixel when reading decoded image data. */
const RGBA_BYTES_PER_PIXEL = 4;

/**
 * Every live indexized sheet, for `BT.spritesRefresh`. Held through `WeakRef` so a
 * sheet the game drops without calling `destroy()` can still be garbage-collected -
 * except while hot reload is active, when the strong `hotReloadRegistry` keeps every
 * loaded sheet until `destroy()`. `indexedRefs` maps each sheet to its one ref, so
 * unregistering is O(1).
 */
const indexedSheets = new Set<WeakRef<SpriteSheet>>();

/** Maps each registered sheet to its entry in `indexedSheets`. */
const indexedRefs = new WeakMap<SpriteSheet, WeakRef<SpriteSheet>>();

/**
 * Adds a sheet to the indexized-sheet registry. Idempotent.
 *
 * Internal - called by {@link SpriteSheet.indexize}.
 *
 * @param sheet - Sheet that has just been indexized.
 */
export function registerIndexedSheet(sheet: SpriteSheet): void {
    if (indexedRefs.has(sheet)) {
        return;
    }

    // Drop refs to collected sheets here too, so a game that never refreshes doesn't grow the set.
    for (const stale of indexedSheets) {
        if (!stale.deref()) {
            indexedSheets.delete(stale);
        }
    }

    const ref = new WeakRef(sheet);

    indexedRefs.set(sheet, ref);
    indexedSheets.add(ref);
}

/**
 * Removes a sheet from the indexized-sheet registry. No-op when it is not registered.
 *
 * Internal - called by {@link SpriteSheet.destroy} and by `BT.spritesRefresh` when a
 * sheet can no longer be re-mapped.
 *
 * @param sheet - Sheet to forget.
 */
export function unregisterIndexedSheet(sheet: SpriteSheet): void {
    const ref = indexedRefs.get(sheet);

    if (ref) {
        indexedSheets.delete(ref);
        indexedRefs.delete(sheet);
    }
}

/**
 * Returns every indexized sheet that is still alive and not destroyed, drawn or not,
 * dropping entries whose sheet has been garbage-collected.
 *
 * Internal - used by `BT.spritesRefresh`.
 *
 * @returns Live registered sheets, in registration order.
 */
export function getIndexedSheets(): SpriteSheet[] {
    const live: SpriteSheet[] = [];

    for (const ref of indexedSheets) {
        const sheet = ref.deref();

        if (sheet) {
            live.push(sheet);
        } else {
            indexedSheets.delete(ref);
        }
    }

    return live;
}

/**
 * Tells whether a channel is a whole number in 0-255, so it packs into a lookup key without collisions.
 *
 * @param value - Channel value to check.
 * @returns `true` for an integer from 0 to 255.
 */
function isByte(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 255;
}

/**
 * Maps retained RGBA bytes to palette indices for one sprite sheet.
 *
 * @param w - Image width in pixels.
 * @param h - Image height in pixels.
 * @param rgba - RGBA byte buffer (`w * h * 4` bytes).
 * @param palette - Active palette used for color lookup.
 * @param imageSrc - Source label for error messages.
 * @returns Palette index per pixel (`w * h` bytes).
 */
export function mapRgbaPixelsToIndexed(
    w: number,
    h: number,
    rgba: Uint8Array,
    palette: Palette,
    imageSrc: string,
): Uint8Array<ArrayBuffer> {
    const indexed = new Uint8Array(w * h);
    const pixelCount = w * h;

    // Packed RGB -> slot. Filled from the top slot down so the lowest matching slot wins, like
    // Palette.findColor. Only alpha 255 entries: pixel colors always have alpha 255, so findColor
    // never matched a semi-transparent entry either.
    const slotByRgb = new Map<number, number>();

    for (let slot = palette.size - 1; slot >= 0; slot--) {
        const entry = palette.getRef(slot);

        // Whole-byte channels only: a palette effect can write a fraction or an out-of-range value through
        // getRef, which the packing would turn into a false match; findColor's strict equality never matched one.
        if (entry.a === 255 && isByte(entry.r) && isByte(entry.g) && isByte(entry.b)) {
            slotByRgb.set((entry.r << 16) | (entry.g << 8) | entry.b, slot);
        }
    }

    for (let i = 0; i < pixelCount; i++) {
        const base = i * RGBA_BYTES_PER_PIXEL;
        const a = rgba[base + 3];

        if (a === 0) {
            // Index 0 is the transparent sentinel - the shader discards any pixel with rawIndex == 0.
            // eslint-disable-next-line security/detect-object-injection
            indexed[i] = 0;
            continue;
        }

        // eslint-disable-next-line security/detect-object-injection
        const r = rgba[base] ?? 0;
        const g = rgba[base + 1] ?? 0;
        const b = rgba[base + 2] ?? 0;
        const index = slotByRgb.get((r << 16) | (g << 8) | b) ?? -1;

        if (index === -1) {
            const hex =
                '#' +
                r.toString(16).padStart(2, '0') +
                g.toString(16).padStart(2, '0') +
                b.toString(16).padStart(2, '0');
            const x = i % w;
            const y = Math.floor(i / w);
            throw new Error(spriteColorNotInPaletteError(x, y, imageSrc, hex));
        }

        // eslint-disable-next-line security/detect-object-injection
        indexed[i] = index;
    }

    return indexed;
}

/**
 * Collects unique opaque RGB colors from a flat RGBA byte buffer.
 *
 * @param data - RGBA bytes in row-major order.
 * @returns Deduped opaque colors with alpha forced to 255.
 */
function collectUniqueOpaqueColors(data: Uint8Array): Color32[] {
    const seen = new Set<number>();
    const collected: Color32[] = [];

    for (let i = 0; i < data.length; i += RGBA_BYTES_PER_PIXEL) {
        const a = data[i + 3] ?? 0;

        if (a === 0) {
            continue;
        }

        // eslint-disable-next-line security/detect-object-injection
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;

        // Pack RGB into a single 24-bit integer for fast Set lookup.
        const key = (r << 16) | (g << 8) | b;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        collected.push(new Color32(r, g, b, 255));
    }

    return collected;
}

/**
 * Validates that opaque colors can be written into consecutive palette slots.
 *
 * @param collected - Colors to register.
 * @param palette - Target palette.
 * @param startSlot - First destination slot.
 * @throws RangeError when `startSlot` is invalid or the colors do not fit.
 */
function assertOpaqueColorsFitInPalette(collected: Color32[], palette: Palette, startSlot: number): void {
    if (collected.length > 0) {
        if (startSlot < TRANSPARENT_PALETTE_INDEX + 1) {
            throw new RangeError(
                `loadColorsIntoPalette: startSlot ${startSlot} is invalid (slot ${TRANSPARENT_PALETTE_INDEX} is reserved for transparency).`,
            );
        }

        const endSlot = startSlot + collected.length - 1;

        if (endSlot >= palette.size) {
            throw new RangeError(
                `loadColorsIntoPalette: ${collected.length} colors do not fit in palette size ${palette.size} starting at slot ${startSlot}.`,
            );
        }
    }
}

/**
 * Writes collected colors into consecutive palette slots.
 *
 * @param collected - Colors in write order.
 * @param palette - Target palette.
 * @param startSlot - First destination slot.
 */
function writeCollectedColors(collected: Color32[], palette: Palette, startSlot: number): void {
    collected.forEach((color, index) => {
        palette.set(startSlot + index, color);
    });
}

/**
 * Marks palette indices referenced by non-zero pixels in a source rectangle,
 * clamped to the sheet. Each unique sheet index is resolved once; does not allocate.
 *
 * @param pixels - Indexed pixel buffer for the full sheet.
 * @param sheetWidth - Sheet width in pixels.
 * @param sheetHeight - Sheet height in pixels.
 * @param srcRect - Region to scan in sheet coordinates.
 * @param paletteOffset - Palette offset applied at draw time.
 * @param usedMask - Mutable usage mask indexed by resolved palette slot.
 */
export function markUniqueIndicesInRect(
    pixels: Uint8Array,
    sheetWidth: number,
    sheetHeight: number,
    srcRect: Rect2i,
    paletteOffset: number,
    usedMask: Uint8Array,
): void {
    const startX = Math.max(0, srcRect.x);
    const startY = Math.max(0, srcRect.y);
    const endX = Math.min(sheetWidth, srcRect.x + srcRect.width);
    const endY = Math.min(sheetHeight, srcRect.y + srcRect.height);
    const seenSheetIndices = MARK_INDICES_IN_RECT_SCRATCH;

    seenSheetIndices.fill(0);

    const rectWidth = endX - startX;
    const pixelCount = (endY - startY) * rectWidth;

    for (let flat = 0; flat < pixelCount; flat++) {
        const y = startY + Math.floor(flat / rectWidth);
        const x = startX + (flat % rectWidth);
        const sheetIndex = pixels[y * sheetWidth + x] ?? 0;

        if (sheetIndex === TRANSPARENT_PALETTE_INDEX) {
            continue;
        }

        // eslint-disable-next-line security/detect-object-injection -- sheet indices are 0-255
        if (seenSheetIndices[sheetIndex] === 1) {
            continue;
        }

        // eslint-disable-next-line security/detect-object-injection -- sheet indices are 0-255
        seenSheetIndices[sheetIndex] = 1;

        markIndexUsed(usedMask, sheetIndex + paletteOffset);
    }
}

/**
 * Decodes an image's pixels via an off-screen canvas and returns a flat
 * RGBA byte buffer. Shared by `indexize` and `loadColorsIntoPalette`.
 *
 * @param image - Source HTML image element.
 * @param w - Image width in pixels.
 * @param h - Image height in pixels.
 * @returns Flat RGBA byte array (`w * h * RGBA_BYTES_PER_PIXEL` bytes).
 */
export function readRgbaPixels(image: HTMLImageElement, w: number, h: number): Uint8Array<ArrayBuffer> {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);

    return new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer.slice(0)) as Uint8Array<ArrayBuffer>;
}

/**
 * Creates and uploads an `r8uint` GPU texture from palette index data. Uses
 * `writeTexture` because `r8uint` does not support `copyExternalImageToTexture`.
 *
 * @param device - WebGPU device for texture creation.
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param indexedPixels - One palette index per pixel, row-major.
 * @returns The uploaded texture.
 */
export function createIndexedTexture(
    device: GPUDevice,
    width: number,
    height: number,
    indexedPixels: Uint8Array<ArrayBuffer>,
): GPUTexture {
    assertDimensions('sprite sheet texture', width, height);

    const extent = [width, height, TEXTURE_LAYER_COUNT];
    const texture = device.createTexture({
        label: 'Sprite Sheet Indexed Texture',
        size: extent,
        format: 'r8uint',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    device.queue.writeTexture({ texture }, indexedPixels, { bytesPerRow: width }, extent);

    return texture;
}

/**
 * Collects every unique opaque color in RGBA data, optionally sorts it by
 * luminance, and writes it into `palette` from `startSlot`. Backs
 * {@link SpriteSheet.loadColorsIntoPalette}.
 *
 * @param data - Flat RGBA pixel bytes.
 * @param palette - Target palette to populate.
 * @param startSlot - First palette slot to write into.
 * @param sort - `'luminance'` sorts dark to light; `'none'` keeps first-seen order.
 * @returns Registered colors in palette-write order.
 * @throws RangeError if the colors do not fit in the palette starting at `startSlot`.
 */
export function writePaletteColors(
    data: Uint8Array,
    palette: Palette,
    startSlot: number,
    sort: 'luminance' | 'none',
): Color32[] {
    const collected = collectUniqueOpaqueColors(data);

    if (sort === 'luminance') {
        collected.sort((c1, c2) => c1.luminance - c2.luminance);
    }

    // Validate the full destination range up front so a mid-loop palette.set()
    // throw (out-of-range slot, or opaque color at reserved slot 0) cannot
    // leave the palette partially mutated. All collected colors are opaque,
    // so startSlot must be at least 1.
    assertOpaqueColorsFitInPalette(collected, palette, startSlot);
    writeCollectedColors(collected, palette, startSlot);

    return collected;
}

/**
 * Returns a display label for an image, used in error messages.
 *
 * @param image - Source image, or `null` for a sheet built from raw indexed data.
 * @returns Quoted image `src` when available, otherwise `(unnamed)`.
 */
export function sourceLabel(image: HTMLImageElement | null): string {
    return image?.src ? `'${image.src}'` : '(unnamed)';
}
