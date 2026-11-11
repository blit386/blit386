/**
 * Style helpers the overlay bands share: chrome palette indices and value-to-band scaling.
 */

import type { OverlayStyle } from '../core/IBTDemo';
import { DEFAULT_IDX_BG, DEFAULT_IDX_TEXT } from './constants';

/** Resolved overlay chrome palette indices. */
export interface OverlayChromeIndices {
    readonly barIndex: number;
    readonly textIndex: number;
    readonly gapIndex: number;
}

/**
 * Resolves overlay bar/text/gap palette indices from an optional {@link OverlayStyle}.
 *
 * @param style - Optional configure-time overlay style.
 * @returns Bar and text indices with their defaults; the gap falls back to the bar index.
 */
export function resolveOverlayChromeIndices(style: OverlayStyle | undefined): OverlayChromeIndices {
    const barIndex = style?.barPaletteIndex ?? DEFAULT_IDX_BG;

    return {
        barIndex,
        textIndex: style?.textPaletteIndex ?? DEFAULT_IDX_TEXT,
        gapIndex: style?.gapPaletteIndex ?? barIndex,
    };
}

/**
 * Maps a value to a pixel height inside a band, linearly so `fullScale` fills the band.
 *
 * Any positive value draws at least one pixel, so light samples stay visible.
 *
 * @param value - Sample value (milliseconds, vertices, or a normalized level).
 * @param bandHeight - Band height in pixels.
 * @param fullScale - Value that maps to the full band height.
 * @returns Clamped height in pixels (0 when the value, band, or scale is not positive).
 */
export function scaleToBand(value: number, bandHeight: number, fullScale: number): number {
    if (bandHeight <= 0 || value <= 0 || fullScale <= 0) {
        return 0;
    }

    return Math.min(bandHeight, Math.max(1, Math.floor((value * bandHeight) / fullScale)));
}
