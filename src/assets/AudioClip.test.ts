// @vitest-environment happy-dom

/**
 * Unit tests for {@link AudioClip}.
 *
 * Exercises the load pipeline end to end:
 * - resolved-cache and in-flight dedup behavior (single fetch/decode across
 *   concurrent and repeated calls, referential equality of the returned clip)
 * - fallback-list resolution (first decodable URL wins and is recorded,
 *   later candidates are never fetched once one succeeds, and the granular
 *   decode/format error survives when every candidate fails) and the
 *   empty-list guard
 * - byte-accurate download progress with and without `Content-Length`, and a
 *   single indeterminate decode report
 * - the four failure categories: network/CORS, HTTP status, decode, and
 *   "audio isn't ready" (no decode context registered), plus the download
 *   timeout aborting a stalled fetch with the same network error
 * - unload() releasing the buffer, clearing the cache, invoking the
 *   voice-stop hook, and idempotency
 *
 * `fetch` is stubbed via `vi.stubGlobal`; the decode `AudioContext` uses the
 * Phase 1 Web Audio mock (`webaudio-mock.ts`) registered through the Phase 1
 * decode-context registry, so the suite stays deterministic and does not
 * depend on network or real Web Audio decoding.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockAudioContext, type MockAudioContext } from '../__test__/webaudio-mock';
import { setAudioClipUnloadHandler, setAudioDecodeContext } from '../audio/audioDecodeContext';
import { AudioClip, type AudioClipProgress } from './AudioClip';
import type { SynthParams } from './synth/SynthParams';

/**
 * Builds a mocked `fetch` response for the download pipeline.
 *
 * @param opts               - Response configuration.
 * @param opts.ok            - Whether the response reports success. Defaults to `true`.
 * @param opts.status        - HTTP status code. Defaults to `200`.
 * @param opts.contentLength - `Content-Length` header value; omit to simulate a missing header.
 * @param opts.chunks        - Body chunks streamed via a fake `ReadableStream` reader.
 * @param opts.arrayBufferBytes - Byte length returned by the `arrayBuffer()` fallback path.
 * @returns Response stub accepted by the `fetch` mock.
 */
function mockAudioFetchResponse({
    ok = true,
    status = 200,
    contentLength,
    chunks,
    arrayBufferBytes = 4,
}: {
    ok?: boolean;
    status?: number;
    contentLength?: number;
    chunks?: Uint8Array[];
    arrayBufferBytes?: number;
} = {}) {
    const headers = {
        // Real `Headers.get` is case-insensitive; normalize so the mock matches that behavior.
        get: (name: string) =>
            name.toLowerCase() === 'content-length' && contentLength !== undefined ? String(contentLength) : null,
    };

    type ChunkReadResult = { done: true } | { done: false; value: Uint8Array };

    let body: { getReader: () => { read: () => Promise<ChunkReadResult> } } | null = null;

    if (chunks) {
        let index = 0;

        body = {
            getReader: () => ({
                read: () => {
                    // eslint-disable-next-line security/detect-object-injection -- index is a bounded local counter
                    const value = chunks[index];

                    if (value === undefined) {
                        return Promise.resolve({ done: true } as const);
                    }

                    index += 1;

                    return Promise.resolve({ done: false, value } as const);
                },
            }),
        };
    }

    return {
        ok,
        status,
        headers,
        body,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(arrayBufferBytes)),
    };
}

describe('AudioClip', () => {
    let mockContext: MockAudioContext;

    beforeEach(() => {
        // Register a Phase 1 Web Audio mock context so AudioClip can decode;
        // AudioClip never constructs its own AudioContext, it only reads
        // whatever is registered here.
        const context = createMockAudioContext();

        mockContext = context as unknown as MockAudioContext;
        setAudioDecodeContext(context);
    });

    afterEach(() => {
        setAudioDecodeContext(null);
        setAudioClipUnloadHandler(() => {});
        AudioClip.clear();
        vi.unstubAllGlobals();
    });

    describe('cache management', () => {
        it('should report isLoaded as false for an unloaded URL', () => {
            expect(AudioClip.isLoaded('never-loaded.mp3')).toBe(false);
        });

        it('should return null from getClip for an unloaded URL', () => {
            expect(AudioClip.getClip('never-loaded.mp3')).toBeNull();
        });

        it('should clear the cache', () => {
            AudioClip.clear();

            expect(AudioClip.isLoaded('test.mp3')).toBe(false);
        });
    });

    describe('loading a single URL', () => {
        beforeEach(() => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse()));
        });

        it('should load and cache a clip under its URL', async () => {
            const clip = await AudioClip.load('sound.mp3');

            expect(clip.url).toBe('sound.mp3');
            expect(clip.buffer).not.toBeNull();
            expect(AudioClip.isLoaded('sound.mp3')).toBe(true);
            expect(AudioClip.getClip('sound.mp3')).toBe(clip);
        });

        it('should expose duration and sampleRate read from the decoded buffer', async () => {
            mockContext.decodeAudioDataImpl = () =>
                Promise.resolve({ duration: 2.5, sampleRate: 44100 } as unknown as AudioBuffer);

            const clip = await AudioClip.load('metadata.mp3');

            expect(clip.duration).toBe(2.5);
            expect(clip.sampleRate).toBe(44100);
        });

        it('should return the cached clip on a second call without refetching', async () => {
            const first = await AudioClip.load('cached.mp3');
            const second = await AudioClip.load('cached.mp3');

            expect(second).toBe(first);
            expect(fetch).toHaveBeenCalledOnce();
        });

        it('should deduplicate concurrent requests for the same URL', async () => {
            const [first, second] = await Promise.all([AudioClip.load('shared.mp3'), AudioClip.load('shared.mp3')]);

            expect(first).toBe(second);
            expect(fetch).toHaveBeenCalledOnce();
        });
    });

    describe('progress reporting', () => {
        it('should report a byte-accurate download ratio when Content-Length is present', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockAudioFetchResponse({
                        contentLength: 4,
                        chunks: [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
                    }),
                ),
            );

            const events: AudioClipProgress[] = [];

            await AudioClip.load('stream.mp3', { onProgress: (progress) => events.push(progress) });

            expect(events).toEqual([
                { phase: 'download', ratio: 0.5 },
                { phase: 'download', ratio: 1 },
                { phase: 'decoding', ratio: null },
            ]);
        });

        it('should report a null ratio when Content-Length is absent', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse()));

            const events: AudioClipProgress[] = [];

            await AudioClip.load('no-length.mp3', { onProgress: (progress) => events.push(progress) });

            expect(events).toEqual([
                { phase: 'download', ratio: null },
                { phase: 'decoding', ratio: null },
            ]);
        });

        it('should report exactly one indeterminate decode snapshot regardless of download shape', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    mockAudioFetchResponse({
                        contentLength: 2,
                        chunks: [new Uint8Array([1, 2])],
                    }),
                ),
            );

            const events: AudioClipProgress[] = [];

            await AudioClip.load('single-chunk.mp3', { onProgress: (progress) => events.push(progress) });

            const decodeEvents = events.filter((event) => event.phase === 'decoding');

            expect(decodeEvents).toEqual([{ phase: 'decoding', ratio: null }]);
        });
    });

    describe('fallback lists', () => {
        it('should resolve with the first URL that downloads and decodes, recording it as the winning URL', async () => {
            vi.stubGlobal(
                'fetch',
                vi
                    .fn()
                    .mockImplementation((url: string) =>
                        Promise.resolve(
                            url === 'missing.ogg'
                                ? mockAudioFetchResponse({ ok: false, status: 404 })
                                : mockAudioFetchResponse(),
                        ),
                    ),
            );

            const clip = await AudioClip.load(['missing.ogg', 'present.mp3']);

            expect(clip.url).toBe('present.mp3');
            expect(AudioClip.isLoaded('present.mp3')).toBe(true);
            expect(AudioClip.isLoaded('missing.ogg')).toBe(false);
        });

        it('should not fetch later candidates once an earlier one decodes successfully', async () => {
            const fetchMock = vi.fn().mockResolvedValue(mockAudioFetchResponse());

            vi.stubGlobal('fetch', fetchMock);

            await AudioClip.load(['first.mp3', 'second.mp3', 'third.mp3']);

            expect(fetchMock).toHaveBeenCalledOnce();
            expect(fetchMock.mock.calls[0]?.[0]).toBe('first.mp3');
        });

        it('should throw the granular decode error for the last candidate when every candidate fails to decode', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse()));
            mockContext.decodeAudioDataImpl = () => Promise.reject(new Error('unsupported codec'));

            await expect(AudioClip.load(['a.ogg', 'b.mp3'])).rejects.toThrow("Couldn't decode the audio file 'b.mp3'");
        });

        it('should throw the last error when every candidate fails over HTTP', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse({ ok: false, status: 500 })));

            await expect(AudioClip.load(['a.ogg', 'b.mp3'])).rejects.toThrow('server had a problem');
        });

        it('should throw for an empty fallback list', async () => {
            await expect(AudioClip.load([])).rejects.toThrow('empty URL list');
        });
    });

    describe('error handling', () => {
        it('should throw a network error when fetch rejects', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

            await expect(AudioClip.load('unreachable.mp3')).rejects.toThrow("Couldn't reach the audio file");
        });

        it('should abort and throw a network error when the fetch stalls past the timeout', async () => {
            vi.useFakeTimers();

            try {
                vi.stubGlobal(
                    'fetch',
                    vi.fn().mockImplementation(
                        (_url: string, init?: { signal?: AbortSignal }) =>
                            new Promise((_resolve, reject) => {
                                init?.signal?.addEventListener('abort', () => {
                                    reject(new DOMException('The operation was aborted', 'AbortError'));
                                });
                            }),
                    ),
                );

                const loadPromise = AudioClip.load('stalled.mp3');
                const rejection = expect(loadPromise).rejects.toThrow("Couldn't reach the audio file");

                // Must exceed AudioClip's internal download timeout so the abort fires.
                await vi.advanceTimersByTimeAsync(20_000);
                await rejection;
            } finally {
                vi.useRealTimers();
            }
        });

        it('should throw a not-found error for a 404 status', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse({ ok: false, status: 404 })));

            await expect(AudioClip.load('missing.mp3')).rejects.toThrow("Can't find the audio file");
        });

        it('should throw a server error for a non-404 status', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse({ ok: false, status: 500 })));

            await expect(AudioClip.load('broken.mp3')).rejects.toThrow('server had a problem');
        });

        it('should throw a decode error when decodeAudioData rejects', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse()));
            mockContext.decodeAudioDataImpl = () => Promise.reject(new Error('unsupported codec'));

            await expect(AudioClip.load('bad-codec.mp3')).rejects.toThrow("Couldn't decode the audio file");
        });

        it('should throw the not-ready error when no decode context is registered', async () => {
            setAudioDecodeContext(null);
            vi.stubGlobal('fetch', vi.fn());

            await expect(AudioClip.load('any.mp3')).rejects.toThrow("Audio isn't ready yet");
            expect(fetch).not.toHaveBeenCalled();
        });

        it('should not cache a failed load and should clear in-flight state for retries', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse({ ok: false, status: 404 })));

            await expect(AudioClip.load('retry.mp3')).rejects.toThrow();
            expect(AudioClip.isLoaded('retry.mp3')).toBe(false);

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse()));

            const clip = await AudioClip.load('retry.mp3');

            expect(clip.url).toBe('retry.mp3');
        });
    });

    describe('loadAll', () => {
        it('should load multiple clips concurrently, mixing single URLs and fallback lists', async () => {
            vi.stubGlobal(
                'fetch',
                vi
                    .fn()
                    .mockImplementation((url: string) =>
                        Promise.resolve(
                            url === 'missing.ogg'
                                ? mockAudioFetchResponse({ ok: false, status: 404 })
                                : mockAudioFetchResponse(),
                        ),
                    ),
            );

            const clips = await AudioClip.loadAll(['a.mp3', ['missing.ogg', 'b.mp3']]);

            expect(clips).toHaveLength(2);
            expect(clips[0]?.url).toBe('a.mp3');
            expect(clips[1]?.url).toBe('b.mp3');
        });
    });

    describe('unload', () => {
        beforeEach(() => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAudioFetchResponse()));
        });

        it('should release the buffer and remove the clip from the cache', async () => {
            const clip = await AudioClip.load('bye.mp3');

            clip.unload();

            expect(clip.buffer).toBeNull();
            expect(AudioClip.isLoaded('bye.mp3')).toBe(false);
        });

        it('should be idempotent', async () => {
            const clip = await AudioClip.load('bye-twice.mp3');

            clip.unload();

            expect(() => clip.unload()).not.toThrow();
        });

        it('should invoke the registered unload handler with the released buffer', async () => {
            const clip = await AudioClip.load('handler.mp3');
            const releasedBuffer = clip.buffer;
            const handler = vi.fn();

            setAudioClipUnloadHandler(handler);
            clip.unload();

            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith(releasedBuffer);
        });
    });

    describe('synth', () => {
        /**
         * Builds a valid baseline `SynthParams`, overridden per test.
         *
         * @param overrides - Fields to override on top of the baseline.
         * @returns A valid `SynthParams` value merged with `overrides`.
         */
        function buildSynthParams(overrides: Partial<SynthParams> = {}): SynthParams {
            return {
                waveform: 'sine',
                frequency: 440,
                duration: 0.25,
                seed: 1,
                ...overrides,
            };
        }

        it('should resolve an AudioClip whose buffer matches the requested duration and context sample rate', async () => {
            const clip = await AudioClip.synth(buildSynthParams({ duration: 0.5 }));

            expect(clip.sampleRate).toBe(mockContext.sampleRate);
            expect(clip.duration).toBeCloseTo(0.5, 5);
            expect(clip.buffer?.length).toBe(Math.round(0.5 * mockContext.sampleRate));
        });

        it('should reject when no decode context is registered', async () => {
            setAudioDecodeContext(null);

            await expect(AudioClip.synth(buildSynthParams())).rejects.toThrow(/isn't ready/);
        });

        it('should reject with a validation error for invalid params', async () => {
            await expect(AudioClip.synth(buildSynthParams({ duration: 0 }))).rejects.toThrow(/duration/);
        });

        it('should not populate the URL-keyed resolved cache', async () => {
            const clip = await AudioClip.synth(buildSynthParams());

            expect(AudioClip.isLoaded(clip.url)).toBe(false);
            expect(AudioClip.getClip(clip.url)).toBeNull();
        });

        it('should not dedupe repeated calls - each call renders a distinct buffer', async () => {
            const params = buildSynthParams();

            const first = await AudioClip.synth(params);
            const second = await AudioClip.synth(params);

            expect(first).not.toBe(second);
            expect(first.buffer).not.toBe(second.buffer);
        });

        it('should render identical sample data for identical params (deterministic)', async () => {
            const params = buildSynthParams({ waveform: 'noise', seed: 7 });

            const first = await AudioClip.synth(params);
            const second = await AudioClip.synth(params);

            expect(Array.from(first.buffer?.getChannelData(0) ?? [])).toEqual(
                Array.from(second.buffer?.getChannelData(0) ?? []),
            );
        });

        it('should still no-op safely on unload()', async () => {
            const clip = await AudioClip.synth(buildSynthParams());

            expect(() => {
                clip.unload();
            }).not.toThrow();
            expect(clip.buffer).toBeNull();
        });
    });
});
