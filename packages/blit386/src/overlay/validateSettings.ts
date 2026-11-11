/**
 * Configure-time validation for the overlay numbers in {@link HardwareSettings}.
 */

import { MAX_PALETTE_SIZE } from '../assets/Palette';
import type { HardwareSettings } from '../core/IBTDemo';
import { overlaySettingRangeError } from '../utils/errorMessages';

/** Overlay band sizes that must be whole numbers of at least `1`. */
const SIZE_FIELDS = ['overlayTimingChartHeight', 'overlayAudioMeterHeight', 'overlayPaletteColumns'] as const;

/** Overlay style objects whose every field is a palette index. */
const STYLE_FIELDS = ['overlayStyle', 'overlayTimingChartStyle', 'overlayAudioMeterStyle'] as const;

/**
 * Returns the first invalid overlay number in `settings`, or `null` when all are valid.
 *
 * Skipped when the overlay is disabled, since the values are never read then. `null` counts as unset,
 * matching the `??` defaults the overlay applies.
 *
 * @param settings - Merged hardware settings from `configure()`.
 * @returns User-facing error string, or `null`.
 */
export function findOverlaySettingsError(settings: HardwareSettings): string | null {
    if (settings.isOverlayEnabled === false) {
        return null;
    }

    for (const field of SIZE_FIELDS) {
        // eslint-disable-next-line security/detect-object-injection -- field is a fixed literal key
        const value = settings[field];

        if (value != null && !(Number.isInteger(value) && value >= 1)) {
            return overlaySettingRangeError(field, value, 'a whole number of at least 1');
        }
    }

    for (const field of STYLE_FIELDS) {
        // eslint-disable-next-line security/detect-object-injection -- field is a fixed literal key
        const style: object | undefined = settings[field];

        for (const [key, value] of Object.entries(style ?? {})) {
            if (value != null && !(Number.isInteger(value) && value >= 0 && value < MAX_PALETTE_SIZE)) {
                return overlaySettingRangeError(
                    `${field}.${key}`,
                    value,
                    `a palette index from 0 to ${MAX_PALETTE_SIZE - 1}`,
                );
            }
        }
    }

    return null;
}
