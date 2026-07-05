/**
 * Unit tests for {@link AudioClip}.
 *
 * Exercises the load pipeline end to end:
 * - resolved-cache and in-flight dedup behavior
 * - byte-accurate download progress with and without `Content-Length`
 * - fallback-list resolution and the empty-list guard
 * - the four failure categories: network/CORS, HTTP status, decode, and
 *   "audio isn't ready" (no decode context registered)
 * - unload() releasing the buffer, clearing the cache, and idempotency
 *
 * `fetch` and the decode `AudioContext` are stubbed so the suite stays
 * deterministic and does not depend on network or real Web Audio decoding.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockAudioContext, type MockAudioContext } from '../__test__/webaudio-mock';
import { setAudioClipUnloadHandler, setAudioDecodeContext } from '../audio/audioDecodeContext';
import { AudioClip, type AudioClipProgress } from './AudioClip';

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
function createFetchResponse({
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
        get: (name: string) =>
            name === 'content-length' && contentLength !== undefined ? String(contentLength) : null,
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
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse()));
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
                    createFetchResponse({
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
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse()));

            const events: AudioClipProgress[] = [];

            await AudioClip.load('no-length.mp3', { onProgress: (progress) => events.push(progress) });

            expect(events).toEqual([
                { phase: 'download', ratio: null },
                { phase: 'decoding', ratio: null },
            ]);
        });
    });

    describe('fallback lists', () => {
        it('should resolve with the first URL that downloads and decodes', async () => {
            vi.stubGlobal(
                'fetch',
                vi
                    .fn()
                    .mockImplementation((url: string) =>
                        Promise.resolve(
                            url === 'missing.ogg'
                                ? createFetchResponse({ ok: false, status: 404 })
                                : createFetchResponse(),
                        ),
                    ),
            );

            const clip = await AudioClip.load(['missing.ogg', 'present.mp3']);

            expect(clip.url).toBe('present.mp3');
        });

        it('should throw the last error when every candidate fails', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse({ ok: false, status: 500 })));

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

        it('should throw a not-found error for a 404 status', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse({ ok: false, status: 404 })));

            await expect(AudioClip.load('missing.mp3')).rejects.toThrow("Can't find the audio file");
        });

        it('should throw a server error for a non-404 status', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse({ ok: false, status: 500 })));

            await expect(AudioClip.load('broken.mp3')).rejects.toThrow('server had a problem');
        });

        it('should throw a decode error when decodeAudioData rejects', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse()));
            mockContext.decodeAudioDataImpl = () => Promise.reject(new Error('unsupported codec'));

            await expect(AudioClip.load('bad-codec.mp3')).rejects.toThrow("Couldn't decode the audio file");
        });

        it('should not cache a failed load and should clear in-flight state for retries', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse({ ok: false, status: 404 })));

            await expect(AudioClip.load('retry.mp3')).rejects.toThrow();
            expect(AudioClip.isLoaded('retry.mp3')).toBe(false);

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse()));

            const clip = await AudioClip.load('retry.mp3');

            expect(clip.url).toBe('retry.mp3');
        });

        it('should throw the not-ready error when no decode context is registered', async () => {
            setAudioDecodeContext(null);
            vi.stubGlobal('fetch', vi.fn());

            await expect(AudioClip.load('any.mp3')).rejects.toThrow("Audio isn't ready yet");
            expect(fetch).not.toHaveBeenCalled();
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
                                ? createFetchResponse({ ok: false, status: 404 })
                                : createFetchResponse(),
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
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse()));
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
});
