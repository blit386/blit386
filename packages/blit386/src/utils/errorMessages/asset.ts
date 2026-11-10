/**
 * Decoded image and indexed-buffer size messages.
 */

/**
 * Returns the error message for an asset whose width or height is not a positive whole number.
 *
 * @param context - Asset label (for example `'sprite sheet'`).
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @returns User-facing error string.
 */
export function assetDimensionInvalidError(context: string, size: string): string {
    return (
        `This ${context} must use whole-number pixel dimensions greater than 0 (got ${size}). ` +
        'Check the image file or width and height values and try again'
    );
}

/**
 * Returns the error message for an asset whose width or height exceeds engine limits.
 *
 * @param context - Asset label (for example `'sprite sheet'`).
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @param maxWidth - Maximum accepted width in pixels.
 * @param maxHeight - Maximum accepted height in pixels.
 * @returns User-facing error string.
 */
export function assetDimensionTooLargeError(
    context: string,
    size: string,
    maxWidth: number,
    maxHeight: number,
): string {
    return (
        `This ${context} is too large (got ${size}). ` +
        `Use an image no larger than ${maxWidth}x${maxHeight} pixels on each side`
    );
}

/**
 * Returns the error message for an asset whose total pixel area exceeds engine limits.
 *
 * @param context - Asset label (for example `'sprite sheet'`).
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @param maxPixels - Maximum accepted total pixels.
 * @returns User-facing error string.
 */
export function assetDimensionAreaTooLargeError(context: string, size: string, maxPixels: number): string {
    return (
        `This ${context} uses too many pixels (got ${size}). ` +
        `Use an image with ${maxPixels.toLocaleString('en-US')} total pixels or fewer`
    );
}

/**
 * Returns the error message when an indexed pixel buffer length does not match its dimensions.
 *
 * @param actualLength - Number of values supplied in the buffer.
 * @param width - Declared width in pixels.
 * @param height - Declared height in pixels.
 * @param expectedLength - Required number of values (`width * height`).
 * @returns User-facing error string.
 */
export function assetIndexedPixelLengthError(
    actualLength: number,
    width: number,
    height: number,
    expectedLength: number,
): string {
    return (
        `The pixel data has ${actualLength} values, but a ${width}x${height} sheet needs exactly ${expectedLength}. ` +
        'Make sure indexedPixels has one entry per pixel'
    );
}
