/**
 * Minimal ambient module declaration for `pngjs`, which ships no types of its own and has no
 * `@types` package in this monorepo. Covers only the small surface tests use (real PNG
 * encode/decode for pixel-dimension regression tests) – not a full API surface.
 */
declare module 'pngjs' {
    /** Options accepted by the `PNG` constructor. */
    interface PNGOptions {
        /** Image width in pixels. */
        width?: number;

        /** Image height in pixels. */
        height?: number;
    }

    /** Minimal typed surface of pngjs's `PNG` class used by tests. */
    export class PNG {
        /** Synchronous encode/decode helpers. */
        static readonly sync: {
            /**
             * Decodes a PNG file buffer.
             *
             * @param buffer – Raw PNG file bytes.
             * @returns Decoded image with `width`, `height`, and RGBA `data`.
             */
            read: (buffer: Buffer) => PNG;

            /**
             * Encodes a `PNG` instance to PNG file bytes.
             *
             * @param png – Image with `width`, `height`, and RGBA `data` set.
             * @returns Encoded PNG file bytes.
             */
            write: (png: PNG) => Buffer;
        };

        /** Image width in pixels. */
        width: number;

        /** Image height in pixels. */
        height: number;

        /** Raw RGBA pixel bytes. */
        data: Buffer;

        constructor(options?: PNGOptions);
    }
}
