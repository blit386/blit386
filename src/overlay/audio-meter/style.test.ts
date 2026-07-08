import { describe, expect, it } from 'vitest';

import { AUDIO_METER_DEFAULT_CLIP_IDX, AUDIO_METER_DEFAULT_WARNING_IDX, AUDIO_METER_FULL_SCALE } from './constants';
import { computeAudioMeterBarHeight, resolveAudioMeterStyle } from './style';

describe('computeAudioMeterBarHeight', () => {
    const meterHeight = 13;

    it('returns 0 for non-positive levels and invalid scale inputs', () => {
        expect(computeAudioMeterBarHeight(-0.5, meterHeight, AUDIO_METER_FULL_SCALE)).toBe(0);
        expect(computeAudioMeterBarHeight(0, meterHeight, AUDIO_METER_FULL_SCALE)).toBe(0);
        expect(computeAudioMeterBarHeight(0.5, 0, AUDIO_METER_FULL_SCALE)).toBe(0);
        expect(computeAudioMeterBarHeight(0.5, meterHeight, 0)).toBe(0);
    });

    it('draws at least 1 px for a low non-zero level and clamps at band height', () => {
        expect(computeAudioMeterBarHeight(0.01, meterHeight, AUDIO_METER_FULL_SCALE)).toBe(1);
        expect(computeAudioMeterBarHeight(1, meterHeight, AUDIO_METER_FULL_SCALE)).toBe(meterHeight);
        expect(computeAudioMeterBarHeight(2, meterHeight, AUDIO_METER_FULL_SCALE)).toBe(meterHeight);
    });

    it('scales linearly between 0 and full scale', () => {
        expect(computeAudioMeterBarHeight(0.5, 20, 1)).toBe(10);
    });
});

describe('resolveAudioMeterStyle', () => {
    it('defaults level bar and track to overlay style indices', () => {
        const resolved = resolveAudioMeterStyle({ barPaletteIndex: 10, textPaletteIndex: 11 }, undefined);

        expect(resolved.levelBarIndex).toBe(11);
        expect(resolved.trackIndex).toBe(10);
        expect(resolved.textIndex).toBe(11);
        expect(resolved.warningIndex).toBe(AUDIO_METER_DEFAULT_WARNING_IDX);
        expect(resolved.clipIndex).toBe(AUDIO_METER_DEFAULT_CLIP_IDX);
    });

    it('honors audio meter palette overrides', () => {
        const resolved = resolveAudioMeterStyle(
            { barPaletteIndex: 1, textPaletteIndex: 2, gapPaletteIndex: 12 },
            {
                levelBarPaletteIndex: 20,
                trackPaletteIndex: 21,
                warningPaletteIndex: 22,
                clipPaletteIndex: 23,
            },
        );

        expect(resolved.levelBarIndex).toBe(20);
        expect(resolved.trackIndex).toBe(21);
        expect(resolved.warningIndex).toBe(22);
        expect(resolved.clipIndex).toBe(23);
    });

    it('defaults track to gap palette index when track override is omitted', () => {
        const resolved = resolveAudioMeterStyle({ barPaletteIndex: 1, textPaletteIndex: 2, gapPaletteIndex: 7 }, {});

        expect(resolved.trackIndex).toBe(7);
    });

    it('falls back track to bar index when gap palette is omitted', () => {
        const resolved = resolveAudioMeterStyle({ barPaletteIndex: 9, textPaletteIndex: 2 }, undefined);

        expect(resolved.trackIndex).toBe(9);
    });

    it('resolves defaults when overlay style is entirely omitted', () => {
        const resolved = resolveAudioMeterStyle(undefined, undefined);

        expect(resolved.levelBarIndex).toBe(2);
        expect(resolved.trackIndex).toBe(1);
        expect(resolved.textIndex).toBe(2);
    });
});
