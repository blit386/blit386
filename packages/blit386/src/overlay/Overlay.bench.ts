import { bench, describe } from 'vitest';

import type { BitmapFont } from '../assets/BitmapFont';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import {
    buildOverlayLayoutPlan,
    createOverlayLayout,
    createOverlayLayoutPlanScratch,
    type OverlayLayoutConfig,
} from './index';
import { drawOverlayLabelWithDividers, padOverlayField } from './labels';
import { computeGrid } from './palette/PaletteView';
import type { TimingChartDrawStyle } from './timing-chart/style';
import { TimingChart } from './timing-chart/TimingChart';

const BENCH_OPTIONS = {
    iterations: 100,
    time: 100,
    warmupTime: 25,
    warmupIterations: 25,
};

/** No-op overlay draw target shared by every bench case below (mirrors PaletteView.bench.ts). */
const noopTarget = {
    drawBarFill: () => {},
    drawBarFillOnTop: () => {},
    drawLabel: () => {},
    drawLabelOnTop: () => {},
};

/** Minimal bitmap font stand-in – benchmarked helpers only read `lineHeight`. */
const noopFont = { lineHeight: 14 } as BitmapFont;

const displayWidth = 480;
const displayHeight = 270;
const lineHeight = 14;
const customRowCount = 3;

const layoutScratch = createOverlayLayoutPlanScratch();
const layout = createOverlayLayout(displayWidth, displayHeight, lineHeight);
const paletteGrid = computeGrid(displayWidth, undefined, 256);

/** Fully-configured layout config: every optional band (timing chart, diagnostics, audio meters, palette) enabled. */
const fullLayoutConfig: OverlayLayoutConfig = {
    displayWidth,
    displayHeight,
    lineHeight,
    customRowCount,
    isOverlayTimingChartEnabled: true,
    timingChartHeight: 48,
    isOverlayRendererDiagnosticsBarEnabled: true,
    isOverlayAudioMetersEnabled: true,
    audioMeterHeight: 24,
    isOverlayPaletteEnabled: true,
    paletteGrid,
};

describe('buildOverlayLayoutPlan', () => {
    bench(
        'fully-configured overlay (timing chart, diagnostics, audio meters, palette, custom rows)',
        () => {
            buildOverlayLayoutPlan(fullLayoutConfig, layoutScratch, 'WebGPU 60 FPS', layout.toggleRect);
        },
        BENCH_OPTIONS,
    );
});

const labelRowRect = new Rect2i(0, 0, displayWidth, 14);
const labelPos = new Vector2i(4, 0);
const fps = 59.734;
const frameMs = 16.128;
const updateMs = 4.372;

describe('overlay label composition', () => {
    bench(
        'padOverlayField + toFixed field formatting',
        () => {
            const fpsField = padOverlayField(fps.toFixed(0), 3);
            const frameField = padOverlayField(frameMs.toFixed(1), 5);
            const updateField = padOverlayField(updateMs.toFixed(1), 5);

            void `${fpsField}|${frameField}|${updateField} ms`;
        },
        BENCH_OPTIONS,
    );

    bench(
        'drawOverlayLabelWithDividers (multi-segment)',
        () => {
            const text = `${padOverlayField(fps.toFixed(0), 3)} fps|${padOverlayField(frameMs.toFixed(1), 5)} ms|${padOverlayField(updateMs.toFixed(1), 5)} upd`;

            drawOverlayLabelWithDividers(noopTarget as never, noopFont, labelPos, text, labelRowRect, 0, 1);
        },
        BENCH_OPTIONS,
    );
});

const timingChartWidth = 240;
const timingChart = new TimingChart(true, 60, 'rich');
const timingChartRect = new Rect2i(0, 20, timingChartWidth, 40);
const timingChartStyle: TimingChartDrawStyle = {
    updateBarIndex: 8,
    renderBarIndex: 9,
    warningBarIndex: 3,
    errorBarIndex: 4,
    tagBarIndex: 5,
    gridBarIndex: 6,
    overflowBarIndex: 7,
};

timingChart.reset(timingChartWidth, 0);

for (let sampleIndex = 0; sampleIndex < 300; sampleIndex++) {
    if (sampleIndex % 40 === 0) {
        // Stack a second tag on the same column to exercise multi-tag groups.
        timingChart.assignTag(`Marker ${sampleIndex}`, sampleIndex);
    }

    if (sampleIndex % 8 === 0) {
        timingChart.assignTag(`Tag ${sampleIndex}`, sampleIndex);
    }

    timingChart.sample({
        frameMs: 12 + (sampleIndex % 20),
        updateMs: 3 + (sampleIndex % 6),
        renderMs: 6 + (sampleIndex % 10),
        updateSteps: 1,
        drawCalls: 40,
        droppedFrames: sampleIndex % 60 === 0 ? 1 : 0,
        primitiveOverflowCount: sampleIndex % 90 === 0 ? 1 : 0,
        spriteOverflowCount: 0,
        primitiveSubmittedVertices: 12_000 + sampleIndex,
        spriteSubmittedVertices: 8_000 + sampleIndex,
    });
}

describe('TimingChart.draw', () => {
    bench(
        'draw() with tagged samples (groupTimingChartTagsByColumn)',
        () => {
            timingChart.draw(noopTarget as never, timingChartRect, timingChartStyle, noopFont, 300);
        },
        BENCH_OPTIONS,
    );
});
