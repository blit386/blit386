/**
 * Shared `AudioParam` ramp scheduling, used for bus-volume fades ({@link AudioManager}) and
 * per-voice volume/pitch/pan fades ({@link VoicePool}).
 */

import type { EasingFunction } from './Easing';
import { applyEasing } from './Easing';

/** Number of samples used to build an eased ramp curve for `setValueCurveAtTime`. */
const FADE_CURVE_SAMPLE_COUNT = 32;

/**
 * Schedules or immediately applies a value change on an `AudioParam`.
 *
 * With no `fadeMs` (or a non-positive one), sets `param.value` immediately. With `fadeMs`,
 * anchors the ramp to `currentTime`: `'linear'` easing uses `linearRampToValueAtTime`; other
 * easings sample {@link applyEasing} into a curve fed to `setValueCurveAtTime`.
 *
 * @param param - `AudioParam` to update (gain, `playbackRate`, or pan).
 * @param currentTime – Audio-clock time to anchor the ramp to (`AudioContext.currentTime`).
 * @param targetValue – Target parameter value.
 * @param fadeMs – Optional fade duration in milliseconds.
 * @param easing – Easing curve applied when `fadeMs` is a positive duration.
 */
export function applyAudioParamRamp(
    param: AudioParam,
    currentTime: number,
    targetValue: number,
    fadeMs: number | undefined,
    easing: EasingFunction,
): void {
    if (fadeMs === undefined || fadeMs <= 0) {
        // Cancel any pending ramp first – setting `.value` directly does not cancel scheduled
        // automation events, so a fade started earlier could otherwise keep running and override
        // this "immediate" value once its scheduled end time arrives.
        param.cancelScheduledValues(currentTime);
        param.value = targetValue;

        return;
    }

    const startValue = param.value;
    const durationSeconds = fadeMs / 1000;

    param.cancelScheduledValues(currentTime);
    param.setValueAtTime(startValue, currentTime);

    if (easing === 'linear') {
        param.linearRampToValueAtTime(targetValue, currentTime + durationSeconds);

        return;
    }

    param.setValueCurveAtTime(sampleEasingCurve(startValue, targetValue, easing), currentTime, durationSeconds);
}

/**
 * Samples an eased curve from `startValue` to `targetValue` for `AudioParam.setValueCurveAtTime`.
 *
 * @param startValue – Parameter value at the start of the fade.
 * @param targetValue – Parameter value at the end of the fade.
 * @param easing – Easing curve to sample.
 * @returns Sampled curve of {@link FADE_CURVE_SAMPLE_COUNT} values.
 */
function sampleEasingCurve(startValue: number, targetValue: number, easing: EasingFunction): Float32Array {
    const curve = new Float32Array(FADE_CURVE_SAMPLE_COUNT);

    for (let i = 0; i < FADE_CURVE_SAMPLE_COUNT; i++) {
        const t = i / (FADE_CURVE_SAMPLE_COUNT - 1);
        const eased = applyEasing(t, easing);

        // eslint-disable-next-line security/detect-object-injection -- bounded loop counter
        curve[i] = startValue + (targetValue - startValue) * eased;
    }

    return curve;
}
