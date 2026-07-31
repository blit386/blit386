// Global test setup for blit386.
// Imported by vitest.config.ts setupFiles.

import { createMockAudioContext } from './webaudio-mock';

type GlobalRecord = Record<string, unknown>;

/**
 * Installs a global stub when the name is missing in the test environment.
 *
 * @param name Global property name.
 * @param value Stub value to assign.
 */
function installGlobalIfMissing(name: string, value: unknown): void {
    /* eslint-disable security/detect-object-injection -- test setup installs known global stubs by name */
    if (typeof (globalThis as GlobalRecord)[name] === 'undefined') {
        (globalThis as unknown as GlobalRecord)[name] = value;
    }
    /* eslint-enable security/detect-object-injection */
}

/** Provide WebGPU constants that don't exist in Node.js. */
installGlobalIfMissing('GPUBufferUsage', {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
});

/** Provide GPUMapMode constants that don't exist in Node.js. */
installGlobalIfMissing('GPUMapMode', {
    READ: 0x0001,
    WRITE: 0x0002,
});

/** Provide GPUTextureUsage constants that don't exist in Node.js. */
installGlobalIfMissing('GPUTextureUsage', {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
});

/**
 * The fallback OffscreenCanvas returns zero-filled RGBA bytes from getImageData().
 * Zero-alpha pixels map to the transparent sentinel (index 0) in SpriteSheet.indexize().
 *
 * Tests that need specific opaque pixel colors must stub OffscreenCanvas themselves
 * (e.g. via vi.stubGlobal('OffscreenCanvas', ...)) before calling indexize().
 */
installGlobalIfMissing(
    'OffscreenCanvas',
    class {
        /** The width of the canvas. */
        public readonly width: number;

        /** The height of the canvas. */
        public readonly height: number;

        /**
         * Creates a new OffscreenCanvas stub with the specified width and height.
         *
         * @param width The width of the canvas.
         * @param height The height of the canvas.
         */
        constructor(width: number, height: number) {
            this.width = width;
            this.height = height;
        }

        /**
         * Returns a mock context for the canvas.
         *
         * @param _contextId The context ID (ignored).
         */
        getContext(_contextId: string) {
            const w = this.width;
            const h = this.height;

            return {
                drawImage: () => {},
                imageSmoothingEnabled: false,
                getImageData: (_x: number, _y: number, _w: number, _h: number) => ({
                    // 4 = bytes per RGBA pixel returned by OffscreenCanvas getImageData().
                    data: new Uint8ClampedArray(w * h * 4),
                }),
            };
        }
    },
);

/**
 * Provide `AudioContext` (and `GainNode`/`AudioParam` behavior) that doesn't exist in Node.js or happy-dom.
 * Reuses the same factory as `webaudio-mock.ts` so there is one implementation, not two; tests that need
 * call-tracking access install their own instance via `installMockAudioContext()`/`uninstallMockAudioContext()`.
 */
installGlobalIfMissing('AudioContext', function AudioContextStub() {
    return createMockAudioContext();
});
