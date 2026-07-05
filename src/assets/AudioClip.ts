/**
 * Decoded audio asset backed by a Web Audio `AudioBuffer`.
 *
 * `AudioClip` is responsible for:
 * - streaming a download over `fetch`, reporting byte-accurate progress when
 *   the response carries a `Content-Length`
 * - decoding the downloaded bytes against the engine's registered decode
 *   `AudioContext` (see `audioDecodeContext.ts`)
 * - caching resolved clips by their winning source URL and deduplicating
 *   concurrent requests for the same URL
 * - falling back through an ordered list of candidate URLs so a caller can
 *   offer alternate containers/codecs for browsers that cannot decode the
 *   first choice
 *
 * Playback (voices, buses) is added in a later phase; this class only covers
 * loading, caching, and releasing decoded buffers.
 */

import { getAudioDecodeContext, notifyAudioClipUnload } from '../audio/audioDecodeContext';
import {
    audioClipDecodeError,
    audioClipHttpError,
    audioClipNetworkError,
    audioClipNotReadyError,
} from '../utils/errorMessages';

/** Phase reported by {@link AudioClipProgressCallback} during a load. */
export type AudioClipLoadPhase = 'download' | 'decoding';

/**
 * Progress snapshot reported to an {@link AudioClipLoadOptions.onProgress} callback.
 */
export interface AudioClipProgress {
    /** Which stage of the load this snapshot reports. */
    phase: AudioClipLoadPhase;

    /**
     * Fraction complete in `[0, 1]`, or `null` when the phase can't report a
     * determinate fraction (unknown `Content-Length`, or the atomic decode step).
     */
    ratio: number | null;
}

/** Callback invoked with {@link AudioClipProgress} snapshots during a load. */
export type AudioClipProgressCallback = (progress: AudioClipProgress) => void;

/** Options accepted by {@link AudioClip.load} and {@link AudioClip.loadAll}. */
export interface AudioClipLoadOptions {
    /**
     * Called with download and decode progress snapshots.
     *
     * When a URL is already cached or shares an in-flight load with another
     * caller, no further progress events fire for this call - only the
     * caller that started the load receives its events.
     */
    onProgress?: AudioClipProgressCallback;
}

/** Maximum time to wait on a `fetch` (including body streaming) before aborting it as a network error. */
const DOWNLOAD_TIMEOUT_MS = 15_000;

/** Resolved clips keyed by their winning source URL. */
const resolvedClips = new Map<string, AudioClip>();

/** In-flight load promises keyed by the URL currently being fetched, for dedup. */
const inFlightLoads = new Map<string, Promise<AudioClip>>();

/**
 * Decoded audio asset with its winning source URL and buffer-derived metadata.
 *
 * Construct instances with {@link AudioClip.load} or {@link AudioClip.loadAll};
 * there is no public constructor.
 */
export class AudioClip {
    /** Source URL this clip was decoded from - the winning entry when loaded from a fallback list. */
    public readonly url: string;

    /** Duration in seconds, read from the decoded buffer at load time. */
    public readonly duration: number;

    /** Sample rate in Hz, read from the decoded buffer at load time. */
    public readonly sampleRate: number;

    /** Decoded audio data, or `null` after {@link unload}. */
    private decodedBuffer: AudioBuffer | null;

    /**
     * Creates an `AudioClip` from an already-decoded buffer.
     * Use {@link AudioClip.load} or {@link AudioClip.loadAll} to construct instances.
     *
     * @param url - Winning source URL the buffer was decoded from.
     * @param buffer - Decoded audio buffer.
     */
    private constructor(url: string, buffer: AudioBuffer) {
        this.url = url;
        this.duration = buffer.duration;
        this.sampleRate = buffer.sampleRate;
        this.decodedBuffer = buffer;
    }

    /**
     * Returns the decoded audio buffer.
     *
     * @returns The decoded buffer, or `null` after {@link unload}.
     */
    get buffer(): AudioBuffer | null {
        return this.decodedBuffer;
    }

    /**
     * Loads an audio clip from a single URL, or from an ordered list of
     * candidate URLs.
     *
     * A single URL runs the download+decode pipeline directly, sharing the
     * per-URL cache and in-flight dedup described on {@link AudioClip}. A URL
     * array tries each candidate in order and resolves with the first one
     * that downloads and decodes successfully - useful for offering a
     * browser-friendly fallback (for example `['music.ogg', 'music.mp3']`)
     * when a container or codec isn't universally supported. If every
     * candidate fails, the error from the last candidate is thrown.
     *
     * @param url - Single audio URL, or an ordered list of fallback URLs.
     * @param options - Optional load options (progress reporting).
     * @returns Loaded clip, cached under its winning source URL.
     * @throws Error if the URL (or every URL in the list) fails to load or decode.
     */
    static async load(url: string | string[], options?: AudioClipLoadOptions): Promise<AudioClip> {
        return Array.isArray(url) ? AudioClip.loadFallbackList(url, options) : AudioClip.loadSingle(url, options);
    }

    /**
     * Loads multiple audio clips concurrently.
     *
     * Mirrors {@link AssetLoader.loadImages}: fans out over `Promise.all` so
     * every entry starts loading immediately rather than one at a time. Each
     * entry is resolved the same way as {@link AudioClip.load}.
     *
     * @param urls - Array of clip requests; each entry is a single URL or a fallback list.
     * @param options - Optional load options applied to every entry.
     * @returns Loaded clips in the same order as `urls`.
     * @throws Error if any requested clip fails to load.
     */
    static async loadAll(urls: Array<string | string[]>, options?: AudioClipLoadOptions): Promise<AudioClip[]> {
        return Promise.all(urls.map((url) => AudioClip.load(url, options)));
    }

    /**
     * Checks if a clip is already loaded and cached under `url`.
     *
     * @param url - Winning source URL to check.
     * @returns `true` if a clip is already cached and ready to use.
     */
    static isLoaded(url: string): boolean {
        return resolvedClips.has(url);
    }

    /**
     * Returns a previously loaded clip from the cache without starting a new request.
     *
     * @param url - Winning source URL of the cached clip.
     * @returns The cached clip, or `null` if not loaded.
     */
    static getClip(url: string): AudioClip | null {
        return resolvedClips.get(url) ?? null;
    }

    /**
     * Clears the resolved-clip cache. In-flight requests aren't aborted and
     * may repopulate the cache once complete.
     *
     * Primarily intended for tests or explicit asset-lifecycle resets. Does
     * not call {@link unload} on cached clips - their buffers stay decoded
     * until each clip is unloaded explicitly.
     */
    static clear(): void {
        resolvedClips.clear();
        inFlightLoads.clear();
    }

    /**
     * Loads a single URL with cache reuse and in-flight dedup.
     *
     * @param url - Audio URL to load.
     * @param options - Optional load options (progress reporting).
     * @returns Loaded clip, cached under `url`.
     */
    private static async loadSingle(url: string, options?: AudioClipLoadOptions): Promise<AudioClip> {
        const cached = resolvedClips.get(url);

        if (cached) {
            return cached;
        }

        const inFlight = inFlightLoads.get(url);

        if (inFlight) {
            return inFlight;
        }

        const promise = AudioClip.fetchAndDecode(url, options?.onProgress).then((buffer) => {
            const clip = new AudioClip(url, buffer);

            resolvedClips.set(url, clip);

            return clip;
        });

        inFlightLoads.set(url, promise);

        try {
            return await promise;
        } finally {
            inFlightLoads.delete(url);
        }
    }

    /**
     * Tries each URL in `urls` in order, resolving with the first clip that
     * downloads and decodes successfully.
     *
     * @param urls - Ordered list of candidate URLs.
     * @param options - Optional load options (progress reporting).
     * @returns Loaded clip for the first candidate that succeeded.
     * @throws Error from the last candidate when every candidate fails, or when `urls` is empty.
     */
    private static async loadFallbackList(urls: string[], options?: AudioClipLoadOptions): Promise<AudioClip> {
        let lastError: unknown = new Error('AudioClip.load() received an empty URL list');

        for (const candidate of urls) {
            try {
                return await AudioClip.loadSingle(candidate, options);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError;
    }

    /**
     * Downloads and decodes `url` against the registered decode context.
     *
     * Checks for a registered decode context before attempting a fetch, so a
     * clip requested before the engine has started fails fast with a clear
     * message instead of an obscure network error. Decoding is atomic from
     * the caller's perspective - `decodeAudioData` reports no intermediate
     * progress, so exactly one `'decoding'` snapshot fires before it starts.
     * It runs correctly whether the decode context is suspended (locked,
     * pre-unlock) or running - only real-time playback needs an unlocked context.
     *
     * @param url - Audio URL to download and decode.
     * @param onProgress - Optional progress callback.
     * @returns Decoded audio buffer.
     * @throws Error if no decode context is registered, the download fails, or decoding fails.
     */
    private static async fetchAndDecode(url: string, onProgress?: AudioClipProgressCallback): Promise<AudioBuffer> {
        const decodeContext = getAudioDecodeContext();

        if (decodeContext === null) {
            throw new Error(audioClipNotReadyError());
        }

        const audioData = await AudioClip.download(url, onProgress);

        onProgress?.({ phase: 'decoding', ratio: null });

        try {
            return await decodeContext.decodeAudioData(audioData);
        } catch {
            throw new Error(audioClipDecodeError(url));
        }
    }

    /**
     * Downloads `url`, distinguishing a rejected fetch (network/CORS) from an
     * HTTP error status.
     *
     * Aborts the request after {@link DOWNLOAD_TIMEOUT_MS} so a stalled
     * connection can never hang {@link AudioClip.load} indefinitely; a timeout
     * surfaces the same network error as any other rejected fetch. The
     * timeout is always cleared once the request settles, however it settles.
     *
     * @param url - Audio URL to download.
     * @param onProgress - Optional progress callback.
     * @returns Downloaded bytes, ready for `decodeAudioData`.
     * @throws Error if the fetch rejects or times out, the stream fails, or the response status is not ok.
     */
    private static async download(url: string, onProgress?: AudioClipProgressCallback): Promise<ArrayBuffer> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

        try {
            let response: Response;

            try {
                response = await fetch(url, { signal: controller.signal });
            } catch {
                throw new Error(audioClipNetworkError(url));
            }

            if (!response.ok) {
                throw new Error(audioClipHttpError(url, response.status));
            }

            try {
                return await AudioClip.readResponseBody(response, onProgress);
            } catch {
                throw new Error(audioClipNetworkError(url));
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Reads a response body into an `ArrayBuffer`, reporting byte-accurate
     * download progress when `Content-Length` is present.
     *
     * Falls back to `response.arrayBuffer()` with a single indeterminate
     * progress report when the length is missing, non-numeric, or the
     * response has no body reader to stream from.
     *
     * @param response - Successful fetch response.
     * @param onProgress - Optional progress callback.
     * @returns Downloaded bytes.
     */
    private static async readResponseBody(
        response: Response,
        onProgress?: AudioClipProgressCallback,
    ): Promise<ArrayBuffer> {
        const contentLengthHeader = response.headers.get('content-length');
        const contentLength = contentLengthHeader !== null ? Number(contentLengthHeader) : Number.NaN;
        const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null;

        if (totalBytes === null || response.body === null) {
            onProgress?.({ phase: 'download', ratio: null });

            return response.arrayBuffer();
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytesReceived = 0;

        for (;;) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            chunks.push(value);
            bytesReceived += value.byteLength;

            onProgress?.({ phase: 'download', ratio: bytesReceived / totalBytes });
        }

        return AudioClip.concatChunks(chunks, bytesReceived);
    }

    /**
     * Concatenates streamed body chunks into a single `ArrayBuffer`.
     *
     * @param chunks - Chunks read from the response body stream, in order.
     * @param totalBytes - Combined byte length of `chunks`.
     * @returns Backing buffer of a `Uint8Array` holding all chunks in order.
     */
    private static concatChunks(chunks: Uint8Array[], totalBytes: number): ArrayBuffer {
        const merged = new Uint8Array(totalBytes);
        let offset = 0;

        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
        }

        return merged.buffer;
    }

    /**
     * Releases the decoded buffer, removes this clip from the resolved cache,
     * and stops and invalidates any voice still playing this buffer via the
     * registered `AudioClip` unload hook (see `audioDecodeContext.ts`).
     *
     * Safe to call more than once - the second and later calls are a no-op.
     */
    unload(): void {
        if (this.decodedBuffer === null) {
            return;
        }

        const releasedBuffer = this.decodedBuffer;

        this.decodedBuffer = null;

        if (resolvedClips.get(this.url) === this) {
            resolvedClips.delete(this.url);
        }

        notifyAudioClipUnload(releasedBuffer);
    }
}
