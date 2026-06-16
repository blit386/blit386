/**
 * Per-frame palette index usage tracking for debug overlays.
 *
 * BTAPI marks indices referenced by demo draw calls during {@link IBTDemo.render}
 * and passes the usage mask directly to the overlay palette grid.
 */

/** Maximum palette slots tracked by the usage mask. */
export const USAGE_CAPACITY = 256;

/**
 * @deprecated Deprecated since 2026-05-31. Use {@link USAGE_CAPACITY} instead.
 */
export const RENDER_PALETTE_USAGE_CAPACITY = USAGE_CAPACITY;

/**
 * Clears a palette usage bitmask.
 *
 * @param usedMask - Mutable usage mask cleared in place.
 */
export function resetUsage(usedMask: Uint8Array): void {
    usedMask.fill(0);
}

/**
 * Backward-compatible alias for {@link resetUsage}.
 *
 * @deprecated Deprecated since 2026-05-31. Use {@link resetUsage} instead.
 * @param usedMask - Mutable usage mask cleared in place.
 */
export function resetRenderPaletteUsage(usedMask: Uint8Array): void {
    resetUsage(usedMask);
}

/**
 * Marks one palette index as used this frame.
 *
 * Index `0` (transparent) is ignored.
 *
 * @param usedMask - Mutable usage mask.
 * @param index - Palette index referenced by a draw call.
 */
export function markIndexUsed(usedMask: Uint8Array, index: number): void {
    if (!Number.isInteger(index) || index <= 0 || index >= usedMask.length) {
        return;
    }

    // eslint-disable-next-line security/detect-object-injection -- index bounds checked above
    usedMask[index] = 1;
}

/**
 * Backward-compatible alias for {@link markIndexUsed}.
 *
 * @deprecated Deprecated since 2026-05-31. Use {@link markIndexUsed} instead.
 * @param usedMask - Mutable usage mask.
 * @param index - Palette index referenced by a draw call.
 */
export function markRenderPaletteIndexUsed(usedMask: Uint8Array, index: number): void {
    markIndexUsed(usedMask, index);
}

/**
 * Collects sorted used palette indices into a reusable scratch array.
 *
 * @param usedMask - Usage mask populated during the current frame.
 * @param paletteSize - Active palette size upper bound.
 * @param scratch - Reusable output buffer mutated in place.
 * @returns The same scratch array containing sorted used indices.
 */
export function collectUsedIndices(usedMask: Uint8Array, paletteSize: number, scratch: number[]): readonly number[] {
    scratch.length = 0;

    const limit = Math.min(paletteSize, usedMask.length);

    for (let index = 1; index < limit; index++) {
        // eslint-disable-next-line security/detect-object-injection -- index bounded by palette size
        if (usedMask[index] === 1) {
            scratch.push(index);
        }
    }

    return scratch;
}

/**
 * Backward-compatible alias for {@link collectUsedIndices}.
 *
 * @deprecated Deprecated since 2026-05-31. Use {@link collectUsedIndices} instead.
 * @param usedMask - Usage mask populated during the current frame.
 * @param paletteSize - Active palette size upper bound.
 * @param scratch - Reusable output buffer mutated in place.
 * @returns The same scratch array containing sorted used indices.
 */
export function collectUsedRenderPaletteIndices(
    usedMask: Uint8Array,
    paletteSize: number,
    scratch: number[],
): readonly number[] {
    return collectUsedIndices(usedMask, paletteSize, scratch);
}
