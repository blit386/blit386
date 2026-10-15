/**
 * Per-pixel diff of two equal-size RGBA buffers. Any channel difference counts: the captures
 * are palette-indexed renders, so there is no antialiasing noise to tolerate.
 */

const CHANNELS = 4;

/**
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} a
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} b
 * @returns {{ changed: number, data: Uint8ClampedArray }}
 */
function diffPixels(a, b) {
    if (a.width !== b.width || a.height !== b.height) {
        throw new Error(`diff: size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    }

    const data = new Uint8ClampedArray(a.data.length);
    let changed = 0;

    for (let offset = 0; offset < a.data.length; offset += CHANNELS) {
        const same =
            a.data[offset] === b.data[offset] &&
            a.data[offset + 1] === b.data[offset + 1] &&
            a.data[offset + 2] === b.data[offset + 2] &&
            a.data[offset + 3] === b.data[offset + 3];

        if (!same) {
            changed += 1;
            data[offset] = 255;
            data[offset + 2] = 255;
            data[offset + 3] = 255;
        }
    }

    return { changed, data };
}

/**
 * Decode an image URL into RGBA pixels through a canvas. Browser only.
 *
 * @param {string} url
 * @returns {Promise<{ width: number, height: number, data: Uint8ClampedArray }>}
 */
async function loadPixels(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`${response.status} for ${url}`);
    }

    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');

    context.drawImage(bitmap, 0, 0);

    return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

export { diffPixels, loadPixels };
