/**
 * `.btfont` loading and glyph validation messages, plus the system font.
 */

/**
 * Returns the error message when a `.btfont` JSON payload is too large to parse safely.
 *
 * @param byteLength - UTF-8 byte length of the JSON text.
 * @param maxBytes - Maximum accepted JSON size in bytes.
 * @returns User-facing error string.
 */
export function btfontJsonTooLargeError(byteLength: number, maxBytes: number): string {
    return (
        `This font file is too large to load safely (${byteLength.toLocaleString('en-US')} bytes). ` +
        `Use a .btfont file of ${maxBytes.toLocaleString('en-US')} bytes or fewer, ` +
        'or move large textures to a separate PNG file'
    );
}

/**
 * Error message when an embedded `.btfont` texture URI is not a PNG data URI.
 */
export const BTFONT_EMBEDDED_TEXTURE_FORMAT_MESSAGE =
    'Embedded font textures must use a PNG data URI (data:image/png;base64,...). ' +
    'Use a relative PNG path in the texture field, or re-export the font with --embed';

/**
 * Returns the error message when an embedded `.btfont` texture payload exceeds the size cap.
 *
 * @param payloadLength - Base64 payload length in characters (after the data-URI prefix).
 * @param maxPayloadBytes - Maximum accepted embedded texture payload size.
 * @returns User-facing error string.
 */
export function btfontEmbeddedTextureTooLargeError(payloadLength: number, maxPayloadBytes: number): string {
    return (
        `The embedded font texture is too large (${payloadLength.toLocaleString('en-US')} characters of base64 data). ` +
        `Keep embedded textures under ${maxPayloadBytes.toLocaleString('en-US')} bytes, ` +
        'or save the atlas as a separate PNG file and reference it by path'
    );
}

/**
 * Returns the error message when a `.btfont` texture path leads to a different origin than the font file.
 *
 * @param textureUrl - Texture URL as the font would have requested it.
 * @returns User-facing error string.
 */
export function btfontTextureOtherOriginError(textureUrl: string): string {
    return (
        `The font texture '${textureUrl}' is on a different site than the font file, so it was not loaded. ` +
        'Put the PNG next to the .btfont file and use a relative path in the texture field'
    );
}

/**
 * Returns the error message when a `.btfont` file defines too many glyphs.
 *
 * @param count - Number of glyph entries found.
 * @param maxGlyphs - Maximum accepted glyph count.
 * @returns User-facing error string.
 */
export function btfontGlyphCountTooLargeError(count: number, maxGlyphs: number): string {
    return (
        `This font defines too many glyphs (${count.toLocaleString('en-US')}). ` +
        `Use ${maxGlyphs.toLocaleString('en-US')} glyphs or fewer`
    );
}

/**
 * Returns a human-readable label for a `.btfont` glyph metric key.
 *
 * @param metricKey - `.btfont` metric key (for example `w` or `adv`).
 * @returns Label text for error messages.
 */
function getBtfontMetricLabel(metricKey: string): string {
    switch (metricKey) {
        case 'adv':
            return 'advance width (adv)';
        case 'h':
            return 'height (h)';
        case 'ox':
            return 'horizontal offset (ox)';
        case 'oy':
            return 'vertical offset (oy)';
        case 'w':
            return 'width (w)';
        case 'x':
            return 'horizontal position (x)';
        case 'y':
            return 'vertical position (y)';
        default:
            return metricKey;
    }
}

/**
 * Returns the error message when a glyph entry is not a metric object.
 *
 * @param charLabel - Character label used in the message.
 * @returns User-facing error string.
 */
export function btfontGlyphEntryNotObjectError(charLabel: string): string {
    return (
        `The '${charLabel}' glyph in this font file is invalid. ` +
        'Each glyph must be an object with x, y, w, h, ox, oy, and adv fields'
    );
}

/**
 * Returns the error message when a glyph metric is not a whole number.
 *
 * @param charLabel - Character label used in the message.
 * @param metricKey - `.btfont` metric key (for example `w` or `adv`).
 * @param value - Invalid metric value.
 * @returns User-facing error string.
 */
export function btfontGlyphMetricNotIntegerError(charLabel: string, metricKey: string, value: number): string {
    const label = getBtfontMetricLabel(metricKey);

    return (
        `The '${charLabel}' glyph has an invalid ${label} (got ${value}). ` +
        'Use a whole number for every glyph metric in the .btfont file'
    );
}

/**
 * Returns the error message when a glyph position is negative.
 *
 * @param charLabel - Character label used in the message.
 * @returns User-facing error string.
 */
export function btfontGlyphNegativePositionError(charLabel: string): string {
    return (
        `The '${charLabel}' glyph has a negative position in the texture atlas. ` +
        'Use 0 or greater for x and y in the .btfont file'
    );
}

/**
 * Returns the error message when a glyph width or height is negative.
 *
 * @param charLabel - Character label used in the message.
 * @returns User-facing error string.
 */
export function btfontGlyphNegativeSizeError(charLabel: string): string {
    return `The '${charLabel}' glyph has a negative width or height. Use 0 or greater for w and h in the .btfont file`;
}

/**
 * Returns the error message when a glyph advance width is negative.
 *
 * @param charLabel - Character label used in the message.
 * @returns User-facing error string.
 */
export function btfontGlyphNegativeAdvanceError(charLabel: string): string {
    return `The '${charLabel}' glyph has a negative advance width. Use 0 or greater for adv in the .btfont file`;
}

/**
 * Returns the error message when a glyph is larger than the engine allows.
 *
 * @param charLabel - Character label used in the message.
 * @param width - Glyph width in pixels.
 * @param height - Glyph height in pixels.
 * @param maxWidth - Maximum accepted width in pixels.
 * @param maxHeight - Maximum accepted height in pixels.
 * @returns User-facing error string.
 */
export function btfontGlyphSizeTooLargeError(
    charLabel: string,
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number,
): string {
    return (
        `The '${charLabel}' glyph is too large (${width}x${height}). ` +
        `Use a glyph size no larger than ${maxWidth}x${maxHeight} pixels`
    );
}

/**
 * Returns the error message when a glyph rectangle falls outside the font texture.
 *
 * @param charLabel - Character label used in the message.
 * @param x - Glyph X position in the atlas.
 * @param y - Glyph Y position in the atlas.
 * @param width - Glyph width in pixels.
 * @param height - Glyph height in pixels.
 * @param atlasWidth - Texture atlas width in pixels.
 * @param atlasHeight - Texture atlas height in pixels.
 * @returns User-facing error string.
 */
export function btfontGlyphOutsideAtlasError(
    charLabel: string,
    x: number,
    y: number,
    width: number,
    height: number,
    atlasWidth: number,
    atlasHeight: number,
): string {
    return (
        `The '${charLabel}' glyph rectangle (${x}, ${y}, ${width}x${height}) is outside the ` +
        `${atlasWidth}x${atlasHeight} font texture. Move the glyph inside the atlas image`
    );
}

/**
 * Returns the error message when a glyph area is too large to render safely.
 *
 * @param charLabel - Character label used in the message.
 * @returns User-facing error string.
 */
export function btfontGlyphAreaTooLargeError(charLabel: string): string {
    return `The '${charLabel}' glyph covers too many pixels to render safely. Use a smaller glyph rectangle`;
}

/**
 * Error message shown when `BT.systemFont` is read before the
 * engine has finished creating it.
 */
export const SYSTEM_FONT_NOT_READY_MESSAGE =
    "BT.systemFont isn't ready yet. Make sure the engine has finished starting " +
    '(BT.init() has resolved) before reading it.';
