/**
 * Generates the three procedural background-music loops used by the audio demos
 * (037-music, 038-audio-buses) and their retrofit reuse (029-snake-game,
 * 014-game-scene). Run with: node scripts/generate-audio-loops.mjs
 *
 * No audio libraries or engine code are used here - this is a small standalone
 * PCM synthesizer that writes 16-bit mono WAV files directly, matching the
 * "no new dependency" spirit of the rest of the demos toolchain.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');

// A short fade at the start/end of every note avoids the audible "click" that a sudden
// jump from silence to full amplitude (or back) would otherwise cause.
const NOTE_FADE_SECONDS = 0.005;

// Standard equal-temperament note frequencies (A4 = 440 Hz), named for the pitches used below.
const NOTE = {
    E2: 82.41,
    G2: 98.0,
    A2: 110.0,
    A3: 220.0,
    C3: 130.81,
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    G4: 392.0,
    A4: 440.0,
    C5: 523.25,
};

/**
 * Triangle wave value in [-1, 1] at a given phase (in cycles, not radians).
 *
 * @param {number} phaseCycles
 * @returns {number}
 */
function triangleValue(phaseCycles) {
    const p = phaseCycles - Math.floor(phaseCycles);
    return 4 * Math.abs(p - 0.5) - 1;
}

/**
 * Square wave value in [-1, 1] at a given phase (in cycles), with a configurable duty cycle.
 *
 * @param {number} phaseCycles
 * @param {number} dutyCycle - Fraction of each cycle spent at +1, in [0, 1].
 * @returns {number}
 */
function squareValue(phaseCycles, dutyCycle) {
    const p = phaseCycles - Math.floor(phaseCycles);
    return p < dutyCycle ? 1 : -1;
}

/**
 * Repeats a note sequence a number of times, returning a new flattened array.
 *
 * @param {Array<{freq: number, seconds: number}>} notes
 * @param {number} times
 * @returns {Array<{freq: number, seconds: number}>}
 */
function repeatNotes(notes, times) {
    const out = [];

    for (let i = 0; i < times; i++) {
        out.push(...notes);
    }

    return out;
}

/**
 * Renders one note to a Float32Array of samples in [-1, 1], with a short fade in/out to
 * prevent clicks at note boundaries.
 *
 * @param {number} freqHz
 * @param {number} seconds
 * @param {(phaseCycles: number) => number} waveformFn
 * @returns {Float32Array}
 */
function renderNote(freqHz, seconds, waveformFn) {
    const sampleCount = Math.round(seconds * SAMPLE_RATE);
    const fadeSamples = Math.min(Math.round(NOTE_FADE_SECONDS * SAMPLE_RATE), Math.floor(sampleCount / 2));
    const out = new Float32Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
        const t = i / SAMPLE_RATE;
        let amplitude = 1;

        if (i < fadeSamples) {
            amplitude = i / fadeSamples;
        } else if (i >= sampleCount - fadeSamples) {
            amplitude = (sampleCount - i) / fadeSamples;
        }

        // eslint-disable-next-line security/detect-object-injection
        out[i] = waveformFn(freqHz * t) * amplitude;
    }

    return out;
}

/**
 * Renders a full note sequence to one concatenated Float32Array.
 *
 * @param {Array<{freq: number, seconds: number}>} notes
 * @param {(phaseCycles: number) => number} waveformFn
 * @returns {Float32Array}
 */
function renderSequence(notes, waveformFn) {
    const parts = notes.map((note) => renderNote(note.freq, note.seconds, waveformFn));
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Float32Array(totalLength);
    let offset = 0;

    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }

    return out;
}

/**
 * Mixes two equal-length buffers with independent gains.
 *
 * @param {Float32Array} bufferA
 * @param {number} gainA
 * @param {Float32Array} bufferB
 * @param {number} gainB
 * @returns {Float32Array}
 */
function mixBuffers(bufferA, gainA, bufferB, gainB) {
    if (bufferA.length !== bufferB.length) {
        throw new Error(`Buffer length mismatch: ${bufferA.length} vs ${bufferB.length}`);
    }

    const out = new Float32Array(bufferA.length);

    for (let i = 0; i < out.length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        out[i] = bufferA[i] * gainA + bufferB[i] * gainB;
    }

    return out;
}

/**
 * Encodes Float32 samples in [-1, 1] as a standard 16-bit mono PCM WAV file buffer.
 *
 * @param {Float32Array} samples
 * @returns {Buffer}
 */
function encodeWavMono16(samples) {
    const numSamples = samples.length;
    const byteRate = SAMPLE_RATE * 2;
    const blockAlign = 2;
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);

    let offset = 44;

    for (let i = 0; i < numSamples; i++) {
        // eslint-disable-next-line security/detect-object-injection
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        buffer.writeInt16LE(Math.round(clamped * 32767), offset);
        offset += 2;
    }

    return buffer;
}

const CALM_LEAD_NOTES = repeatNotes(
    [
        { freq: NOTE.A3, seconds: 0.4 },
        { freq: NOTE.C4, seconds: 0.4 },
        { freq: NOTE.E4, seconds: 0.4 },
        { freq: NOTE.A4, seconds: 0.4 },
        { freq: NOTE.E4, seconds: 0.4 },
        { freq: NOTE.C4, seconds: 0.4 },
        { freq: NOTE.A3, seconds: 0.4 },
        { freq: NOTE.E4, seconds: 0.4 },
    ],
    2,
);

const CALM_BASS_NOTES = [
    { freq: NOTE.A2, seconds: 3.2 },
    { freq: NOTE.E2, seconds: 3.2 },
];

const UPBEAT_LEAD_NOTES = repeatNotes(
    [
        { freq: NOTE.C4, seconds: 0.2 },
        { freq: NOTE.E4, seconds: 0.2 },
        { freq: NOTE.G4, seconds: 0.2 },
        { freq: NOTE.C5, seconds: 0.2 },
        { freq: NOTE.G4, seconds: 0.2 },
        { freq: NOTE.E4, seconds: 0.2 },
        { freq: NOTE.D4, seconds: 0.2 },
        { freq: NOTE.G4, seconds: 0.2 },
    ],
    3,
);

const UPBEAT_BASS_NOTES = [
    { freq: NOTE.C3, seconds: 1.6 },
    { freq: NOTE.G2, seconds: 1.6 },
    { freq: NOTE.C3, seconds: 1.6 },
];

const INTRO_RISER_NOTES = [
    { freq: NOTE.A3, seconds: 0.3 },
    { freq: NOTE.C4, seconds: 0.3 },
    { freq: NOTE.D4, seconds: 0.3 },
    { freq: NOTE.E4, seconds: 0.3 },
    { freq: NOTE.A4, seconds: 0.3 },
];

/**
 * @returns {Float32Array}
 */
function buildCalmBuffer() {
    const lead = renderSequence(CALM_LEAD_NOTES, triangleValue);
    const bass = renderSequence(CALM_BASS_NOTES, triangleValue);

    return mixBuffers(lead, 0.5, bass, 0.35);
}

/**
 * @returns {Float32Array}
 */
function buildUpbeatBuffer() {
    const lead = renderSequence(UPBEAT_LEAD_NOTES, (phase) => squareValue(phase, 0.5));
    const bass = renderSequence(UPBEAT_BASS_NOTES, triangleValue);

    return mixBuffers(lead, 0.5, bass, 0.35);
}

/**
 * @returns {{ buffer: Float32Array, loopStart: number, loopEnd: number }}
 */
function buildIntroLoopBuffer() {
    const riser = renderSequence(INTRO_RISER_NOTES, triangleValue).map((v) => v * 0.7);
    const loopSection = buildCalmBuffer();
    const buffer = new Float32Array(riser.length + loopSection.length);

    buffer.set(riser, 0);
    buffer.set(loopSection, riser.length);

    return {
        buffer,
        loopStart: riser.length / SAMPLE_RATE,
        loopEnd: (riser.length + loopSection.length) / SAMPLE_RATE,
    };
}

function main() {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const calm = buildCalmBuffer();
    writeFileSync(join(OUTPUT_DIR, 'music-calm.wav'), encodeWavMono16(calm));
    console.log(`Wrote music-calm.wav (${(calm.length / SAMPLE_RATE).toFixed(2)}s)`);

    const upbeat = buildUpbeatBuffer();
    writeFileSync(join(OUTPUT_DIR, 'music-upbeat.wav'), encodeWavMono16(upbeat));
    console.log(`Wrote music-upbeat.wav (${(upbeat.length / SAMPLE_RATE).toFixed(2)}s)`);

    const introLoop = buildIntroLoopBuffer();
    writeFileSync(join(OUTPUT_DIR, 'music-intro-loop.wav'), encodeWavMono16(introLoop.buffer));

    const loopSidecar = { loopStart: introLoop.loopStart, loopEnd: introLoop.loopEnd };
    writeFileSync(join(OUTPUT_DIR, 'music-intro-loop.loop.json'), `${JSON.stringify(loopSidecar, null, 2)}\n`);
    console.log(
        `Wrote music-intro-loop.wav (${(introLoop.buffer.length / SAMPLE_RATE).toFixed(2)}s, ` +
            `loop ${introLoop.loopStart}s-${introLoop.loopEnd}s)`,
    );
}

main();
