/**
 * Audio clip loading, bus, voice, and music messages.
 */

import { buildPathHint, extractExtension } from '../urlHints';

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
 * Error message shown when an `AudioClip` load is attempted
 * before the engine has registered a decode audio context.
 */
export const AUDIO_CLIP_NOT_READY_MESSAGE =
    "Audio isn't ready yet. Make sure the engine has finished starting (BT.init() has resolved) " +
    'before loading an AudioClip';

/**
 * Returns the error message for an invalid `loopStart`/`loopEnd` pair passed to
 * `BT.musicPlay`.
 *
 * Covers both failure shapes: only one of the pair given, or a pair that fails
 * `0 <= loopStart < loopEnd <= duration`. `loopStart`/`loopEnd` are `undefined` when missing
 * entirely, so the message still shows the caller exactly what was supplied.
 *
 * @param loopStart - Supplied loop region start in seconds, or `undefined` if omitted.
 * @param loopEnd - Supplied loop region end in seconds, or `undefined` if omitted.
 * @param duration - Duration in seconds of the buffer being played.
 * @returns User-facing error string.
 */
export function musicLoopRangeError(
    loopStart: number | undefined,
    loopEnd: number | undefined,
    duration: number,
): string {
    return (
        `BT.musicPlay() got an invalid loop region (loopStart=${loopStart}, loopEnd=${loopEnd}) for a ${duration}s track. ` +
        'Provide both loopStart and loopEnd together, with 0 <= loopStart < loopEnd <= the track duration, ' +
        'or omit both and use loop instead'
    );
}

/**
 * Returns the error message for a non-finite volume passed to a `BT` audio volume call.
 *
 * @param api - Public call that rejected the value, for example `BT.audioVolumeSet`.
 * @param volume - The rejected value (`NaN`, `Infinity`, or `-Infinity`).
 * @returns User-facing error string.
 */
export function audioVolumeNotFiniteError(api: string, volume: number): string {
    return `${api}() needs a finite number such as 0.5, but got ${volume}. Pass a number between 0 and 1`;
}

/**
 * Returns the error message for a non-finite numeric option passed to a `BT` sound call.
 *
 * @param api - The `BT` method the caller used, such as `BT.soundPlay`.
 * @param option - The option name, such as `pitch` or `pan`.
 * @param value - The rejected value.
 * @returns User-facing error string.
 */
export function audioOptionNotFiniteError(api: string, option: string, value: number): string {
    return `${api}() needs a finite number for ${option}, but got ${value}. Pass a number such as 1, or leave ${option} out for the default`;
}

/**
 * Returns the error message for a `BT.soundPlay` start time that is not a finite, non-negative number.
 *
 * @param atTime - The rejected start time.
 * @returns User-facing error string.
 */
export function audioStartTimeInvalidError(atTime: number): string {
    return `BT.soundPlay() needs atTime to be a finite number that is 0 or more, but got ${atTime}. Pass a time on the audio clock such as 0.5, or leave atTime out to start now`;
}

/**
 * Returns the error message for a non-finite fade time passed to a `BT` audio fade.
 *
 * @param fadeMs - The rejected fade duration in milliseconds.
 * @returns User-facing error string.
 */
export function audioFadeNotFiniteError(fadeMs: number): string {
    return `The audio fade time needs to be a finite number of milliseconds, but got ${fadeMs}. Pass a number such as 300, or leave fadeMs out for an immediate change`;
}
