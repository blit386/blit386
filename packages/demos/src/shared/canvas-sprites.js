/**
 * Shared helpers for demos that draw their sprite art on an offscreen canvas
 * at startup instead of loading a PNG file.
 *
 * The recipe (used by the Sprites and Animation demos) goes:
 *
 *   1. Draw shapes onto an OffscreenCanvas with normal browser drawing calls.
 *   2. registerCanvasColors() - read the pixels back and give every unique
 *      color its own palette slot, so the engine can look each pixel up.
 *   3. canvasToImage() - turn the canvas into an Image the engine can upload
 *      to the GPU as a SpriteSheet.
 *
 * Both demos used to carry identical private copies of these two functions;
 * they now import this one file instead.
 */

import { Color32 } from 'blit386';

/**
 * Turns an offscreen canvas into a loaded HTMLImageElement.
 * The browser needs an Image object before SpriteSheet can upload it to the GPU.
 *
 * @param {OffscreenCanvas} canvas
 * @returns {Promise<HTMLImageElement>}
 */
async function canvasToImage(canvas) {
    // convertToBlob() packs the canvas pixels into a PNG file held in memory,
    // and createObjectURL() gives that in-memory file a temporary URL an
    // Image element can load from - no server round trip involved.
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const url = URL.createObjectURL(blob);

    try {
        // Image loading is callback-based, so we wrap it in a Promise:
        // resolve when the image finishes loading, reject if it fails.
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    } finally {
        // The temporary URL holds the PNG bytes alive - release it now that
        // the image has its own copy of the pixels.
        URL.revokeObjectURL(url);
    }
}

/**
 * Scans canvas pixels and registers every unique opaque color into the palette.
 * Transparent pixels (alpha 0) are skipped - they map to slot 0 at draw time.
 * Call this only after the canvas holds exact, flat colors (no anti-aliased
 * blends), so the number of unique colors stays small and predictable.
 *
 * @param {import('blit386').Palette} palette - The palette to write into.
 * @param {OffscreenCanvasRenderingContext2D} ctx - The canvas to scan.
 * @param {number} w - Canvas width in pixels.
 * @param {number} h - Canvas height in pixels.
 * @param {number} startSlot - First palette slot to fill.
 * @returns {Color32[]} The registered colors, in the order their slots were filled.
 */
function registerCanvasColors(palette, ctx, w, h, startSlot) {
    // getImageData() hands back every pixel as four numbers in a row:
    // red, green, blue, alpha (opacity), then the next pixel's four, and so on.
    const data = ctx.getImageData(0, 0, w, h).data;

    // "seen" remembers which colors already have a slot, so each unique color
    // is registered exactly once no matter how many pixels use it.
    const seen = new Map();
    const colors = [];

    // Step through the data four numbers (one pixel) at a time.
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        // Fully transparent pixels carry no color worth registering.
        if (a === 0) {
            continue;
        }

        // Build a text key like "85,153,238" so the Map can tell colors apart.
        const key = `${r},${g},${b}`;

        if (!seen.has(key)) {
            // A brand-new color: give it the next free slot and remember it.
            const slot = startSlot + colors.length;
            seen.set(key, slot);
            const color = new Color32(r, g, b, 255);
            palette.set(slot, color);
            colors.push(color);
        }
    }

    return colors;
}

export { canvasToImage, registerCanvasColors };
