import type { OverlayAudioMeterStyle, OverlayStyle } from '../../core/IBTDemo';
import { resolveOverlayChromeIndices, scaleToBand } from '../bandStyle';
import { AUDIO_METER_DEFAULT_CLIP_IDX, AUDIO_METER_DEFAULT_WARNING_IDX } from './constants';

/** Resolved palette indices used when drawing the overlay audio meter band. */
export interface AudioMeterDrawStyle {
    /** Level fill color below the warning threshold. */
    readonly levelBarIndex: number;

    /** Full-height track color behind each bus bar. */
    readonly trackIndex: number;

    /** Readout text color. */
    readonly textIndex: number;

    /** Readout divider color. */
    readonly gapIndex: number;

    /** Level fill color at or above the warning threshold. */
    readonly warningIndex: number;

    /** Level fill color at or above the clip threshold. */
    readonly clipIndex: number;
}

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
    const { textIndex, gapIndex } = resolveOverlayChromeIndices(overlayStyle);

    return {
        levelBarIndex: meterStyle?.levelBarPaletteIndex ?? textIndex,
        trackIndex: meterStyle?.trackPaletteIndex ?? gapIndex,
        textIndex,
        gapIndex,
        warningIndex: meterStyle?.warningPaletteIndex ?? AUDIO_METER_DEFAULT_WARNING_IDX,
        clipIndex: meterStyle?.clipPaletteIndex ?? AUDIO_METER_DEFAULT_CLIP_IDX,
    };
}

/**
 * Maps a normalized bus level to a vertical fill height in pixels (see {@link scaleToBand}).
 */
export const computeAudioMeterBarHeight = scaleToBand;
