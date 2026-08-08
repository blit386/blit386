/**
 * Minimal deterministic pseudo-random number generator (mulberry32), used by the audio
 * synthesis engine so identical seeds always produce identical noise output.
 *
 * Internal utility only – not exposed on the public `BT` namespace.
 */
export class Rng {
    /** Internal 32-bit generator state, mutated on every {@link next} call. */
    private state: number;

    /**
     * Creates a PRNG seeded deterministically from `seed`.
     *
     * @param seed – Any finite number; only its lower 32 bits affect the sequence.
     */
    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    /**
     * Returns the next pseudo-random float.
     *
     * @returns Next value in the deterministic sequence, in [0, 1).
     */
    next(): number {
        this.state = (this.state + 0x6d2b79f5) | 0;

        let t = this.state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Returns the next pseudo-random float within a range.
     *
     * @param min – Inclusive lower bound.
     * @param max – Exclusive upper bound.
     * @returns Next value in the deterministic sequence, in [min, max).
     */
    nextRange(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    /**
     * Returns the next pseudo-random whole number within an inclusive range.
     *
     * @param min – Inclusive lower bound.
     * @param max – Inclusive upper bound.
     * @returns Next whole number in the deterministic sequence, in [min, max].
     */
    nextInt(min: number, max: number): number {
        return Math.floor(this.nextRange(min, max + 1));
    }
}
