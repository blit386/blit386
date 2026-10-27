/**
 * Golden checks pinning synth output byte-for-byte, so the PRNG behind it cannot drift unnoticed.
 */

import { describe, expect, it } from 'vitest';

import { explosion } from './synthPresets';
import { renderSynthSamples } from './synthRender';

/**
 * FNV-1a hash over the raw bytes of a sample buffer.
 *
 * @param samples - Rendered samples.
 * @returns Unsigned 32-bit digest.
 */
function digest(samples: Float32Array): number {
    const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    let hash = 0x811c9dc5;

    for (const byte of bytes) {
        hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    }

    return hash;
}

describe('synth golden output', () => {
    it('should render seeded noise byte-identically', () => {
        const samples = renderSynthSamples({ waveform: 'noise', frequency: 440, duration: 0.2, seed: 1234 }, 8000);

        expect(digest(samples)).toBe(1128559017);
    });

    it('should render a jittered preset byte-identically', () => {
        expect(digest(renderSynthSamples(explosion(77), 8000))).toBe(1067035188);
    });
});
