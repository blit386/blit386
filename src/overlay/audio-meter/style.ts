import type { OverlayAudioMeterStyle, OverlayStyle } from '../../core/IBTDemo';
import { DEFAULT_IDX_BG, DEFAULT_IDX_TEXT } from '../constants';
import { AUDIO_METER_DEFAULT_CLIP_IDX, AUDIO_METER_DEFAULT_WARNING_IDX } from './constants';

/** Resolved palette indices used when drawing the overlay audio meter band. */
export interface AudioMeterDrawStyle {
    readonly levelBarIndex: number;
    readonly trackIndex: number;
    readonly textIndex: number;
    readonly gapIndex: number;
    readonly warningIndex: number;
    readonly clipIndex: number;
}

const pickPaletteIndex = (preferred: number | undefined, fallback: number): number => preferred ?? fallback;

const pickOverlayBarTextGap = (
    overlayStyle: OverlayStyle | undefined,
): { barIndex: number; textIndex: number; gapIndex: number } => {
    const barIndex = overlayStyle?.barPaletteIndex ?? DEFAULT_IDX_BG;
    const textIndex = overlayStyle?.textPaletteIndex ?? DEFAULT_IDX_TEXT;
    const gapIndex = overlayStyle?.gapPaletteIndex ?? barIndex;

    return { barIndex, textIndex, gapIndex };
};

/**
 * Resolves audio meter palette indices from overlay and meter-specific settings.
 *
 * @param overlayStyle - Global overlay bar/text/gap indices from hardware settings.
 * @param meterStyle - Optional audio meter palette overrides.
 * @returns Resolved indices for meter draw and semantic level tints.
 */
export function resolveAudioMeterStyle(
    overlayStyle: OverlayStyle | undefined,
    meterStyle: OverlayAudioMeterStyle | undefined,
): AudioMeterDrawStyle {
    const { textIndex, gapIndex } = pickOverlayBarTextGap(overlayStyle);

    return {
        levelBarIndex: pickPaletteIndex(meterStyle?.levelBarPaletteIndex, textIndex),
        trackIndex: pickPaletteIndex(meterStyle?.trackPaletteIndex, gapIndex),
        textIndex,
        gapIndex,
        warningIndex: pickPaletteIndex(meterStyle?.warningPaletteIndex, AUDIO_METER_DEFAULT_WARNING_IDX),
        clipIndex: pickPaletteIndex(meterStyle?.clipPaletteIndex, AUDIO_METER_DEFAULT_CLIP_IDX),
    };
}

/**
 * Maps a normalized bus level to a vertical fill height in pixels.
 *
 * Scales linearly so `fullScale` fills the meter band height. Any non-zero level draws at
 * least one pixel so quiet buses stay visible.
 *
 * @param level - Normalized bus level (0..1 for a full-scale signal).
 * @param meterHeight - Meter band height in pixels.
 * @param fullScale - Level value that maps to full band height.
 * @returns Clamped fill height in pixels (0 when the level is zero).
 */
export function computeAudioMeterBarHeight(level: number, meterHeight: number, fullScale: number): number {
    if (meterHeight <= 0 || level <= 0 || fullScale <= 0) {
        return 0;
    }

    const scaled = Math.floor((level * meterHeight) / fullScale);

    return Math.min(meterHeight, Math.max(1, scaled));
}
