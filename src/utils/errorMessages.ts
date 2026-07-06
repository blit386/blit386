/**
 * Shared user-facing error message strings for the BLIT386 bootstrap and runtime paths.
 *
 * Imported by {@link Bootstrap} and runtime/asset code so user-facing strings
 * stay centralized and consistent.
 */

import { buildPathHint, extractExtension } from './urlHints';

/**
 * Returns the canvas-not-found error message for the given canvas element ID.
 *
 * @param canvasID - The canvas element ID that was searched for.
 * @returns User-facing error string.
 */
export function CANVAS_NOT_FOUND_MESSAGE(canvasID: string): string {
    return `Can't find the canvas on the page. Make sure your HTML has a <canvas id='${canvasID}'> element.`;
}

/**
 * Generic engine initialization failure message.
 *
 * Shown when the engine returns false for any reason not covered by a more
 * specific GPU failure message.
 */
export const INIT_FAILED_MESSAGE =
    'Something went wrong starting the engine. Check the browser console (press F12) for details.';

/**
 * Friendly message for a WebGPU adapter failure.
 *
 * Shown when `requestAdapter()` resolves to null (hardware acceleration
 * disabled, drivers too old, or running in a VM / remote desktop).
 */
export const WEBGPU_ADAPTER_MESSAGE =
    "Your computer's graphics card couldn't start WebGPU. Try updating your browser, or check that hardware acceleration is enabled.";

/**
 * Friendly message for a WebGPU device failure.
 *
 * Shown when `requestDevice()` rejects (GPU resource exhaustion or a
 * transient driver error).
 */
export const WEBGPU_DEVICE_MESSAGE =
    "Couldn't connect to the graphics card. Try closing other tabs or restarting the browser.";

/**
 * Friendly message for the overlay setup path when the rendering backend is unavailable.
 *
 * Shown when overlay initialization runs before a backend has been selected.
 */
export const OVERLAY_NO_BACKEND =
    "Couldn't start the overlay because the rendering backend isn't ready yet. Try initializing the engine before creating the overlay.";

/**
 * Returns the error message for a render dimension that is not a positive whole-number pixel size.
 *
 * @param field - Hardware settings field that contains the invalid size.
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @returns User-facing error string.
 */
export function renderDimensionInvalidError(field: string, size: string): string {
    return (
        `${field} must use whole-number pixel dimensions greater than 0 (got ${size}). ` +
        'Update configure() to return a positive integer width and height'
    );
}

/**
 * Returns the error message for a render dimension whose width or height exceeds engine limits.
 *
 * @param field - Hardware settings field that contains the invalid size.
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @param maxWidth - Maximum accepted width in pixels.
 * @param maxHeight - Maximum accepted height in pixels.
 * @returns User-facing error string.
 */
export function renderDimensionTooLargeError(field: string, size: string, maxWidth: number, maxHeight: number): string {
    return (
        `${field} is too large (got ${size}). ` + `Use a size no larger than ${maxWidth}x${maxHeight} in configure()`
    );
}

/**
 * Returns the error message for a render dimension whose total pixel area exceeds engine limits.
 *
 * @param field - Hardware settings field that contains the invalid size.
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @param maxPixels - Maximum accepted total pixels.
 * @returns User-facing error string.
 */
export function renderDimensionAreaTooLargeError(field: string, size: string, maxPixels: number): string {
    return `${field} uses too many pixels (got ${size}). Use a size with ${maxPixels.toLocaleString('en-US')} total pixels or fewer`;
}

/**
 * Returns the error message for a render dimension that exceeds the active WebGPU texture limit.
 *
 * @param field - Hardware settings field that contains the invalid size.
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @param maxTextureDimension2D - WebGPU adapter/device texture dimension limit.
 * @returns User-facing error string.
 */
export function renderDimensionGPULimitError(field: string, size: string, maxTextureDimension2D: number): string {
    return (
        `${field} is too large for this graphics card (got ${size}). ` +
        `Use a width and height of ${maxTextureDimension2D} pixels or fewer`
    );
}

/**
 * Returns the error message for an `audioVoices` hardware setting outside the supported range.
 *
 * @param value - Invalid `audioVoices` value.
 * @returns User-facing error string.
 */
export function audioVoicesRangeError(value: number): string {
    return (
        `audioVoices must be a whole number from 1 to 64 (got ${value}). ` +
        'Update configure() to return a valid voice count'
    );
}

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
 * Returns the error message when indexed pixel dimensions overflow safe allocation limits.
 *
 * @param size - Invalid size formatted as `WIDTHxHEIGHT`.
 * @returns User-facing error string.
 */
export function assetIndexedPixelOverflowError(size: string): string {
    return `The indexed sprite size ${size} is too large to load safely. Use smaller width and height values`;
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
 * Returns the error message when an embedded `.btfont` texture URI is not a PNG data URI.
 *
 * @returns User-facing error string.
 */
export function btfontEmbeddedTextureFormatError(): string {
    return (
        'Embedded font textures must use a PNG data URI (data:image/png;base64,...). ' +
        'Use a relative PNG path in the texture field, or re-export the font with --embed'
    );
}

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
 * Returns the "no active palette" error message used whenever a palette must
 * be set before an operation can proceed.
 *
 * @returns User-facing error string.
 */
export function noActivePaletteError(): string {
    return 'No palette set yet. Call BT.paletteSet(somePalette) before drawing or running palette effects.';
}

/**
 * Returns the error message for a palette index that is negative or not a
 * whole number.
 *
 * @param index - The invalid index value that was supplied.
 * @returns User-facing error string.
 */
export function paletteIndexNegativeError(index: number): string {
    return `The color number must be a whole number that's 0 or higher (got ${index}).`;
}

/**
 * Returns the error message for a palette index that exceeds the palette size.
 *
 * @param index - The out-of-range index that was supplied.
 * @param size - The number of colors in the active palette.
 * @returns User-facing error string.
 */
export function paletteIndexOutOfRangeError(index: number, size: number): string {
    return `The color number ${index} is too big for this palette. The palette has ${size} colors, so use a number from 0 to ${size - 1}.`;
}

/**
 * Returns the error message when `applyHUD` is called with `startSlot` less than 1.
 *
 * @param startSlot - The invalid start slot value that was supplied.
 * @returns User-facing error string.
 */
export function hudStartSlotError(startSlot: number): string {
    return `HUD preset slots start from 1 (slot 0 is always transparent). Got ${startSlot}.`;
}

/**
 * Returns the error message when the HUD preset slots would exceed the palette size.
 *
 * @param startSlot - The requested start slot.
 * @param count - Number of HUD slots needed.
 * @param size - The palette size.
 * @returns User-facing error string.
 */
export function hudRangeError(startSlot: number, count: number, size: number): string {
    return (
        `HUD preset needs ${count} slots starting at ${startSlot}, ` +
        `but this palette only has ${size} entries (max slot: ${size - 1}).`
    );
}

/**
 * Returns the error message for a sprite pixel whose color is absent from the
 * active palette.
 *
 * @param x - Pixel x coordinate within the source image.
 * @param y - Pixel y coordinate within the source image.
 * @param src - Source image label (e.g. `'sheet.png'` or `(unnamed)`).
 * @param hex - The color that was not found, as a lowercase hex string.
 * @returns User-facing error string.
 */
export function spriteColorNotInPaletteError(x: number, y: number, src: string, hex: string): string {
    return (
        `The pixel at (${x}, ${y}) in ${src} has the color ${hex}, but that color isn't in your palette.` +
        ` Either add ${hex} to the palette, or change that pixel in the image.`
    );
}

/**
 * Returns the error message shown when a sprite sheet has not been indexized
 * before use.
 *
 * @returns User-facing error string.
 */
export function spriteNotIndexizedError(): string {
    return (
        "This sprite sheet hasn't been prepared yet. Use SpriteSheet.loadIndexed(...) for one-step setup," +
        ' or call sheet.indexize(palette) after BT.paletteSet.'
    );
}

/** Audio file extensions considered normal in {@link buildAudioClipExtensionHint}. */
const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.webm', '.aac', '.flac']);

/**
 * Suggests a common audio extension when a URL's extension does not look like
 * an audio file.
 *
 * @param url - Original URL string.
 * @returns Hint text, or an empty string when no hint applies.
 */
function buildAudioClipExtensionHint(url: string): string {
    const extension = extractExtension(url);
    let hint = '';

    if (extension !== '' && !AUDIO_EXTENSIONS.has(extension)) {
        hint = `The extension '${extension}' does not look like an audio file. Try .mp3, .ogg, or .wav`;
    }

    return hint;
}

/**
 * Combines the path and extension hints for a failing audio clip URL.
 *
 * @param url - Failing audio clip path.
 * @returns Combined hint text (or an empty string when no hint applies).
 */
function buildAudioClipHints(url: string): string {
    const hints: string[] = [];
    const pathHint = buildPathHint(url, 'audio');
    const extensionHint = buildAudioClipExtensionHint(url);

    if (pathHint) {
        hints.push(pathHint);
    }

    if (extensionHint) {
        hints.push(extensionHint);
    }

    return hints.length > 0 ? ` ${hints.join(' ')}` : '';
}

/**
 * Returns the error message for a network- or CORS-level audio fetch failure,
 * where the request itself never completed.
 *
 * @param url - Audio file path or URL that failed to load.
 * @returns User-facing error string.
 */
export function audioClipNetworkError(url: string): string {
    return (
        `Couldn't reach the audio file '${url}'. Check your internet connection and confirm the path is correct. ` +
        "If it's hosted on another domain, make sure that server allows cross-origin (CORS) requests" +
        buildAudioClipHints(url)
    );
}

/**
 * Returns the error message for an audio fetch that completed with a
 * non-successful HTTP status.
 *
 * @param url - Audio file path or URL that failed to load.
 * @param status - HTTP status code from the fetch response.
 * @returns User-facing error string.
 */
export function audioClipHttpError(url: string, status: number): string {
    const statusMessage =
        status === 404
            ? `Can't find the audio file '${url}'. Check that the file exists and the path is spelled correctly`
            : `The server had a problem loading the audio file '${url}' (status ${status}). Try refreshing the page`;

    return statusMessage + buildAudioClipHints(url);
}

/**
 * Returns the error message for an audio file that downloaded successfully
 * but could not be decoded.
 *
 * @param url - Audio file path or URL that failed to decode.
 * @returns User-facing error string.
 */
export function audioClipDecodeError(url: string): string {
    return (
        `Couldn't decode the audio file '${url}'. Your browser probably doesn't support this container or codec ` +
        '(well-supported formats are MP3, OGG Vorbis, and WAV). Try re-exporting to one of those, ' +
        'or pass an array of URLs to AudioClip.load() so it can fall back to another format'
    );
}

/**
 * Returns the error message shown when an `AudioClip` load is attempted
 * before the engine has registered a decode audio context.
 *
 * @returns User-facing error string.
 */
export function audioClipNotReadyError(): string {
    return (
        "Audio isn't ready yet. Make sure the engine has finished starting (BT.init() has resolved) " +
        'before loading an AudioClip'
    );
}

/** Waveform names listed in {@link audioClipSynthInvalidWaveformError}. */
const SYNTH_WAVEFORM_NAMES = 'sine, square, triangle, sawtooth, noise';

/**
 * Returns the error message for a `SynthParams.waveform` that is not a supported waveform name.
 *
 * @param waveform - Invalid waveform value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthInvalidWaveformError(waveform: string): string {
    return `AudioClip.synth() got an unsupported waveform '${waveform}'. Use one of: ${SYNTH_WAVEFORM_NAMES}`;
}

/**
 * Returns the error message for a `SynthParams.duration` that is not a positive number.
 *
 * @param duration - Invalid duration value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthNonPositiveDurationError(duration: number): string {
    return `AudioClip.synth() needs duration greater than 0 seconds (got ${duration}). Set duration to a positive number.`;
}

/**
 * Returns the error message for a target sample rate that is not a positive number.
 *
 * Surfaces only if the registered decode context reports an invalid sample rate - this should
 * never happen with a real `AudioContext`, but is validated the same way any other boundary
 * value is.
 *
 * @param sampleRate - Invalid sample rate value that was read from the decode context.
 * @returns User-facing error string.
 */
export function audioClipSynthNonPositiveSampleRateError(sampleRate: number): string {
    return (
        `AudioClip.synth() needs a positive sample rate (got ${sampleRate}). ` +
        'Make sure the engine has finished starting before calling AudioClip.synth().'
    );
}

/**
 * Returns the error message for a `SynthParams.frequency` that is not a positive number.
 *
 * @param frequency - Invalid frequency value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthNonPositiveFrequencyError(frequency: number): string {
    return `AudioClip.synth() needs frequency greater than 0 Hz (got ${frequency}). Set frequency to a positive number.`;
}

/**
 * Returns the error message for a `SynthParams` numeric field that must be 0 or greater.
 *
 * Shared by envelope timings (`envelope.attack`, `envelope.decay`, `envelope.release`) and
 * vibrato parameters (`vibrato.rate`, `vibrato.depth`).
 *
 * @param field - Dotted field path that failed validation (for example `'envelope.attack'`).
 * @param value - Invalid negative value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthNonNegativeFieldError(field: string, value: number): string {
    return `AudioClip.synth() needs ${field} to be 0 or greater (got ${value}). Use a non-negative number.`;
}

/**
 * Returns the error message for a `SynthEnvelope.sustain` outside the [0, 1] range.
 *
 * @param sustain - Invalid sustain value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthSustainRangeError(sustain: number): string {
    return `AudioClip.synth() needs envelope.sustain between 0 and 1 (got ${sustain}). Use a value in that range.`;
}

/**
 * Returns the error message for a `SynthParams` numeric field that must fall within [0, 1].
 *
 * Shared by `noiseMix` and `dutyCycle`.
 *
 * @param field - Field name that failed validation (for example `'noiseMix'`).
 * @param value - Invalid value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthUnitRangeFieldError(field: string, value: number): string {
    return `AudioClip.synth() needs ${field} between 0 and 1 (got ${value}). Use a value in that range.`;
}

/**
 * Returns the error message for a `SynthPitchSweep.toFrequency` that is not a positive number.
 *
 * @param toFrequency - Invalid target frequency value that was supplied.
 * @returns User-facing error string.
 */
export function audioClipSynthPitchSweepFrequencyError(toFrequency: number): string {
    return (
        `AudioClip.synth() needs pitch sweep toFrequency greater than 0 Hz (got ${toFrequency}). ` +
        'Set pitchSweep.toFrequency to a positive number.'
    );
}
