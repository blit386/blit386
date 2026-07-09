/**
 * Per-bus audio level bars plus a voice/steal/drop text readout for the overlay.
 */

import type { BitmapFont } from '../../assets/BitmapFont';
import type { AudioBus } from '../../core/IBTDemo';
import { Rect2i } from '../../utils/Rect2i';
import { Vector2i } from '../../utils/Vector2i';
import { drawOverlayLabelWithDividers } from '../labels';
import { OVERLAY_EDGE_MARGIN_PX, OVERLAY_TOP_TEXT_Y } from '../layout/constants';
import { overlayBitmapTextPaletteOffset } from '../layout/layoutHelpers';
import type { OverlayDrawTarget } from '../OverlayDrawTarget';
import { gridRowWidth } from '../palette/PaletteView';
import type { OverlayAudioSnapshot } from '../types';
import {
    AUDIO_METER_BAR_GAP_PX,
    AUDIO_METER_BAR_WIDTH_PX,
    AUDIO_METER_BUS_COUNT,
    AUDIO_METER_BUSES,
    AUDIO_METER_CLIP_THRESHOLD,
    AUDIO_METER_FULL_SCALE,
    AUDIO_METER_TEXT_GAP_PX,
    AUDIO_METER_WARNING_THRESHOLD,
} from './constants';
import { type AudioMeterDrawStyle, computeAudioMeterBarHeight } from './style';

/** Levels used before the first {@link AudioMeter.sample} call. */
const ZERO_LEVELS: Readonly<Record<AudioBus, number>> = { main: 0, music: 0, sfx: 0 };

/**
 * Per-bus level bars and voice/steal/drop text readout for the overlay audio meter band.
 */
export class AudioMeter {
    /** Feature flag from the constructor; when false, {@link sample} and {@link draw} are no-ops. */
    readonly #isEnabled: boolean;

    /** Reused bottom-anchored level fill rect, overwritten in place per bus per {@link draw} call. */
    readonly #fillScratch = new Rect2i(0, 0, 1, 1);

    /** Reused text draw position, overwritten in place per {@link draw} call. */
    readonly #textPos = new Vector2i(0, 0);

    /** Last-sampled per-bus levels; {@link ZERO_LEVELS} until the first {@link sample} call. */
    #levels: Readonly<Record<AudioBus, number>> = ZERO_LEVELS;

    /** Last-sampled active SFX voice count. */
    #activeVoices = 0;

    /** Last-sampled total SFX voice slot count. */
    #totalVoices = 0;

    /** Last-sampled voice-pool steal count. */
    #voiceStealCount = 0;

    /** Last-sampled voice-pool drop count. */
    #voiceDropCount = 0;

    /** Last-sampled pre-unlock SFX drop count. */
    #preUnlockDropCount = 0;

    /**
     * Creates an audio meter with the given feature flag.
     *
     * @param isEnabled - When false, sample/draw are no-ops.
     */
    constructor(isEnabled = false) {
        this.#isEnabled = isEnabled;
    }

    /**
     * Whether the audio meter band is active.
     *
     * @returns Feature flag state.
     */
    get isEnabled(): boolean {
        return this.#isEnabled;
    }

    /**
     * Records the latest per-bus levels and voice counters.
     *
     * @param snapshot - Per-frame audio snapshot from BTAPI.
     */
    sample(snapshot: OverlayAudioSnapshot): void {
        if (!this.#isEnabled) {
            return;
        }

        this.#levels = snapshot.levels;
        this.#activeVoices = snapshot.activeVoices;
        this.#totalVoices = snapshot.totalVoices;
        this.#voiceStealCount = snapshot.voiceStealCount;
        this.#voiceDropCount = snapshot.voiceDropCount;
        this.#preUnlockDropCount = snapshot.preUnlockDropCount;
    }

    /**
     * Draws per-bus level bars side by side, plus a voices/steal/drop text readout.
     *
     * Uses {@link OverlayDrawTarget.drawBarFill} for bar/level rects and
     * {@link OverlayDrawTarget.drawLabel} for the text readout, mirroring
     * {@link TimingChart.draw}.
     *
     * @param target - Overlay draw target.
     * @param rect - Screen-space meter band from layout plan.
     * @param style - Resolved meter palette indices.
     * @param font - System bitmap font for the text readout.
     */
    draw(target: OverlayDrawTarget, rect: Rect2i, style: AudioMeterDrawStyle, font: BitmapFont): void {
        if (!this.#isEnabled || rect.width <= 0 || rect.height <= 0) {
            return;
        }

        this.#drawBars(target, rect, style);
        this.#drawText(target, rect, style, font);
    }

    /**
     * Draws one bottom-anchored fill rect per bus, sized to its current level, skipping
     * buses whose level is zero.
     *
     * @param target - Overlay draw target.
     * @param rect - Screen-space meter band.
     * @param style - Resolved meter palette indices.
     */
    #drawBars(target: OverlayDrawTarget, rect: Rect2i, style: AudioMeterDrawStyle): void {
        for (let busIndex = 0; busIndex < AUDIO_METER_BUSES.length; busIndex++) {
            // eslint-disable-next-line security/detect-object-injection -- busIndex bounded by AUDIO_METER_BUSES.length
            const bus = AUDIO_METER_BUSES[busIndex];

            if (bus === undefined) {
                continue;
            }

            const x = busBarX(rect, busIndex);

            // eslint-disable-next-line security/detect-object-injection -- bus is keyof AudioBus union, not arbitrary input
            const level = this.#levels[bus];
            const fillHeight = computeAudioMeterBarHeight(level, rect.height, AUDIO_METER_FULL_SCALE);

            if (fillHeight <= 0) {
                continue;
            }

            const fillY = rect.y + rect.height - fillHeight;

            this.#fillScratch.set(x, fillY, AUDIO_METER_BAR_WIDTH_PX, fillHeight);
            target.drawBarFill(this.#fillScratch, this.#levelPaletteIndex(level, style));
        }
    }

    /**
     * Draws the voices used/total, steal, and drop text readout to the right of the bus bars.
     *
     * The `|` separators between the readout segments render as 1 px full-band-height
     * dividers in the gap palette index, matching the other engine-composed labels.
     *
     * @param target - Overlay draw target.
     * @param rect - Screen-space meter band.
     * @param style - Resolved meter palette indices.
     * @param font - System bitmap font.
     */
    #drawText(target: OverlayDrawTarget, rect: Rect2i, style: AudioMeterDrawStyle, font: BitmapFont): void {
        const barsBlockWidth = gridRowWidth(AUDIO_METER_BUS_COUNT, AUDIO_METER_BAR_WIDTH_PX, AUDIO_METER_BAR_GAP_PX);

        this.#textPos.x = rect.x + OVERLAY_EDGE_MARGIN_PX + barsBlockWidth + AUDIO_METER_TEXT_GAP_PX;
        this.#textPos.y = rect.y + OVERLAY_TOP_TEXT_Y;

        const drops = this.#voiceDropCount + this.#preUnlockDropCount;
        const text = `${this.#activeVoices}/${this.#totalVoices} voices|steal ${this.#voiceStealCount}|drop ${drops}`;

        drawOverlayLabelWithDividers(
            target,
            font,
            this.#textPos,
            text,
            rect,
            overlayBitmapTextPaletteOffset(style.textIndex),
            style.gapIndex,
        );
    }

    /**
     * Resolves a bus fill's palette index from its level against the warning/clip thresholds.
     *
     * @param level - Normalized bus level.
     * @param style - Resolved meter palette indices.
     * @returns Clip, warning, or normal level bar palette index.
     */
    #levelPaletteIndex(level: number, style: AudioMeterDrawStyle): number {
        if (level >= AUDIO_METER_CLIP_THRESHOLD) {
            return style.clipIndex;
        }

        if (level >= AUDIO_METER_WARNING_THRESHOLD) {
            return style.warningIndex;
        }

        return style.levelBarIndex;
    }
}

/**
 * Computes the left edge X of the `busIndex`-th bus bar, reusing {@link gridRowWidth}'s
 * fixed-count column arithmetic instead of an adaptive grid.
 *
 * @param rect - Screen-space meter band.
 * @param busIndex - Index into {@link AUDIO_METER_BUSES}.
 * @returns Bar left edge X in display pixels.
 */
function busBarX(rect: Rect2i, busIndex: number): number {
    return rect.x + OVERLAY_EDGE_MARGIN_PX + busIndex * (AUDIO_METER_BAR_WIDTH_PX + AUDIO_METER_BAR_GAP_PX);
}
