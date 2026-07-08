import { describe, expect, it } from 'vitest';

import { Rect2i } from '../../utils/Rect2i';
import {
    createMockRenderer,
    getBitmapTextCalls,
    getRectFillCalls,
    mockFont,
    OVERLAY_EDGE_MARGIN_PX,
} from '../testFixtures';
import type { OverlayAudioSnapshot } from '../types';
import { AudioMeter } from './AudioMeter';
import { AUDIO_METER_BAR_GAP_PX, AUDIO_METER_BAR_WIDTH_PX } from './constants';

const defaultStyle = {
    levelBarIndex: 8,
    trackIndex: 6,
    textIndex: 9,
    warningIndex: 3,
    clipIndex: 4,
};

const meterRect = new Rect2i(0, 14, 320, 13);

function snapshot(overrides: Partial<OverlayAudioSnapshot> = {}): OverlayAudioSnapshot {
    return {
        levels: { main: 0, music: 0, sfx: 0 },
        activeVoices: 0,
        totalVoices: 16,
        voiceStealCount: 0,
        voiceDropCount: 0,
        preUnlockDropCount: 0,
        ...overrides,
    };
}

describe('AudioMeter', () => {
    it('does not draw when disabled', () => {
        const meter = new AudioMeter(false);
        const renderer = createMockRenderer();

        meter.sample(snapshot({ levels: { main: 0.5, music: 0.5, sfx: 0.5 } }));
        meter.draw(renderer, meterRect, defaultStyle, mockFont);

        expect(renderer.drawBarFill).not.toHaveBeenCalled();
        expect(renderer.drawLabel).not.toHaveBeenCalled();
    });

    it('does not draw when the band rect has no area', () => {
        const meter = new AudioMeter(true);
        const renderer = createMockRenderer();

        meter.sample(snapshot({ levels: { main: 0.5, music: 0.5, sfx: 0.5 } }));
        meter.draw(renderer, new Rect2i(0, 14, 0, 0), defaultStyle, mockFont);

        expect(renderer.drawBarFill).not.toHaveBeenCalled();
    });

    it('exposes the enabled flag', () => {
        expect(new AudioMeter(true).isEnabled).toBe(true);
        expect(new AudioMeter(false).isEnabled).toBe(false);
        expect(new AudioMeter().isEnabled).toBe(false);
    });

    it('draws a track rect for every bus even at zero level', () => {
        const meter = new AudioMeter(true);
        const renderer = createMockRenderer();

        meter.sample(snapshot());
        meter.draw(renderer, meterRect, defaultStyle, mockFont);

        const trackFills = renderer.drawBarFill.mock.calls.filter((call) => call[1] === defaultStyle.trackIndex);

        expect(trackFills).toHaveLength(3);

        for (const call of trackFills) {
            const rect = call[0] as Rect2i;

            expect(rect.width).toBe(AUDIO_METER_BAR_WIDTH_PX);
            expect(rect.height).toBe(meterRect.height);
        }
    });

    it('positions the three bus bars side by side using fixed bar width and gap', () => {
        const meter = new AudioMeter(true);
        const renderer = createMockRenderer();

        meter.sample(snapshot());
        meter.draw(renderer, meterRect, defaultStyle, mockFont);

        const trackRects = getRectFillCalls(renderer).filter((rect) => rect.height === meterRect.height);
        const xs = trackRects.map((rect) => rect.x).sort((a, b) => a - b);

        expect(xs).toEqual([
            meterRect.x + OVERLAY_EDGE_MARGIN_PX,
            meterRect.x + OVERLAY_EDGE_MARGIN_PX + (AUDIO_METER_BAR_WIDTH_PX + AUDIO_METER_BAR_GAP_PX),
            meterRect.x + OVERLAY_EDGE_MARGIN_PX + 2 * (AUDIO_METER_BAR_WIDTH_PX + AUDIO_METER_BAR_GAP_PX),
        ]);
    });

    it('draws a bottom-anchored fill rect sized from the bus level', () => {
        const meter = new AudioMeter(true);
        const renderer = createMockRenderer();

        meter.sample(snapshot({ levels: { main: 1, music: 0, sfx: 0 } }));
        meter.draw(renderer, meterRect, defaultStyle, mockFont);

        const fillCalls = renderer.drawBarFill.mock.calls.filter((call) => call[1] === defaultStyle.clipIndex);

        expect(fillCalls).toHaveLength(1);

        const rect = fillCalls[0]?.[0] as Rect2i;

        expect(rect.height).toBe(meterRect.height);
        expect(rect.y).toBe(meterRect.y);
    });

    it('draws the normal level color for a bus below both thresholds', () => {
        const meter = new AudioMeter(true);
        const renderer = createMockRenderer();

        meter.sample(snapshot({ levels: { main: 0.3, music: 0, sfx: 0 } }));
        meter.draw(renderer, meterRect, defaultStyle, mockFont);

        const normalFills = renderer.drawBarFill.mock.calls.filter((call) => call[1] === defaultStyle.levelBarIndex);
        const tintedFills = renderer.drawBarFill.mock.calls.filter(
            (call) => call[1] === defaultStyle.warningIndex || call[1] === defaultStyle.clipIndex,
        );

        expect(normalFills).toHaveLength(1);
        expect(tintedFills).toHaveLength(0);
    });

    it('does not draw a fill rect for a zero-level bus', () => {
        const meter = new AudioMeter(true);
        const renderer = createMockRenderer();

        meter.sample(snapshot({ levels: { main: 0, music: 0, sfx: 0 } }));
        meter.draw(renderer, meterRect, defaultStyle, mockFont);

        const fillCalls = renderer.drawBarFill.mock.calls.filter((call) => call[1] === defaultStyle.levelBarIndex);

        expect(fillCalls).toHaveLength(0);
    });

    it('tints a bus fill with the warning color when its level crosses the warning threshold', () => {
        const meter = new AudioMeter(true);
        const renderer = createMockRenderer();

        meter.sample(snapshot({ levels: { main: 0.75, music: 0, sfx: 0 } }));
        meter.draw(renderer, meterRect, defaultStyle, mockFont);

        const warningFills = renderer.drawBarFill.mock.calls.filter((call) => call[1] === defaultStyle.warningIndex);

        expect(warningFills).toHaveLength(1);
    });

    it('tints a bus fill with the clip color when its level crosses the clip threshold', () => {
        const meter = new AudioMeter(true);
        const renderer = createMockRenderer();

        meter.sample(snapshot({ levels: { main: 0.99, music: 0, sfx: 0 } }));
        meter.draw(renderer, meterRect, defaultStyle, mockFont);

        const clipFills = renderer.drawBarFill.mock.calls.filter((call) => call[1] === defaultStyle.clipIndex);

        expect(clipFills).toHaveLength(1);
    });

    it('draws a voices used/total, steal, and drop text readout', () => {
        const meter = new AudioMeter(true);
        const renderer = createMockRenderer();

        meter.sample(
            snapshot({
                activeVoices: 5,
                totalVoices: 16,
                voiceStealCount: 3,
                voiceDropCount: 1,
                preUnlockDropCount: 2,
            }),
        );
        meter.draw(renderer, meterRect, defaultStyle, mockFont);

        const textCalls = getBitmapTextCalls(renderer);

        expect(textCalls).toHaveLength(1);
        expect(textCalls[0]?.text).toContain('5/16');
        expect(textCalls[0]?.text).toContain('3');
        expect(textCalls[0]?.text).toContain('drop');
    });
});
