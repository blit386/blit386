/**
 * Pure helpers for timing chart event tags (RetroBlit AssignTag parity).
 */

/** Label added automatically when the timing chart ring buffer is reset (RetroBlit Reset parity). */
export const TIMING_CHART_TAG_START = 'Start';

/** Maximum relative tick value shown on the tag tick row. */
export const TIMING_CHART_TAG_REL_TICK_MAX = 100_000;

/** Horizontal offset from the timing column to tick and label text (RetroBlit column +2, +1). */
export const TIMING_CHART_TAG_TEXT_X_OFFSET = 3;

/** Relative tick row offset above the chart band top. */
export const TIMING_CHART_TAG_TICK_Y_OFFSET = 1;

/** Vertical gap between the tick row and the first stacked label row. */
export const TIMING_CHART_TAG_LABEL_Y_GAP = 9;

/** Vertical distance between stacked tag label rows. */
export const TIMING_CHART_TAG_LABEL_STACK_SPACING = 9;

/** Stored tag entry for the timing chart ring timeline. */
export type TimingChartTag = {
    label: string;
    /** Absolute fixed-update tick when the tag was assigned (tick row only). */
    tick: number;
    /** Overlay timing sample ordinal at assign; drives horizontal column. */
    sampleIndex: number;
};

/** Tags sharing one timing-chart column, in assignment order. */
export type TimingChartTagColumnGroup = {
    sampleIndex: number;
    tags: TimingChartTag[];
};

/** Reusable scratch pool for {@link groupTimingChartTagsByColumn}, one per {@link TimingChart} instance. */
export interface TimingChartTagGroupScratch {
    /** Pooled group descriptors; only the first N (from the last call) are live. */
    groups: TimingChartTagColumnGroup[];
}

/**
 * Creates an empty scratch pool for {@link groupTimingChartTagsByColumn}.
 *
 * @returns Scratch pool with no pooled groups yet.
 */
export function createTimingChartTagGroupScratch(): TimingChartTagGroupScratch {
    return { groups: [] };
}

/**
 * Returns the pooled group descriptor at `index`, growing the pool and resetting the
 * descriptor's tag list as needed.
 *
 * @param scratch – Scratch pool.
 * @param index – Zero-based group index for this call.
 * @param sampleIndex – Column sample index for this group.
 * @returns Reset, reused group descriptor.
 */
function acquireTagGroup(
    scratch: TimingChartTagGroupScratch,
    index: number,
    sampleIndex: number,
): TimingChartTagColumnGroup {
    while (scratch.groups.length <= index) {
        scratch.groups.push({ sampleIndex: 0, tags: [] });
    }

    // eslint-disable-next-line security/detect-object-injection -- index bounded by the while loop above
    const group = scratch.groups[index] as TimingChartTagColumnGroup;

    group.sampleIndex = sampleIndex;
    group.tags.length = 0;

    return group;
}

/**
 * Normalizes a tag label; empty or missing labels become `"Untitled"`.
 *
 * @param label – Caller-provided label.
 * @returns Non-empty label string.
 */
export function normalizeTimingChartTagLabel(label: string | undefined): string {
    return label === undefined || label.length === 0 ? 'Untitled' : label;
}

/**
 * Ring-buffer column for a tag so it stays aligned with timing dots.
 *
 * Columns follow timing samples (one per overlay frame), not fixed-update ticks.
 *
 * @param sampleIndex – Sample ordinal when the tag was assigned.
 * @param totalSamples – Timing samples recorded since the last chart width reset.
 * @param chartWidth – Chart width in pixels (ring buffer width).
 * @returns Column index, or `null` when the tag is past the right edge.
 */
export function computeTimingChartTagColumn(
    sampleIndex: number,
    totalSamples: number,
    chartWidth: number,
): number | null {
    if (chartWidth <= 0) {
        return null;
    }

    const scrollOffset = Math.max(0, totalSamples - chartWidth);
    const column = sampleIndex - scrollOffset;

    if (column >= chartWidth) {
        return null;
    }

    return column;
}

/**
 * Returns whether a tag should be removed from the active list.
 *
 * @param totalSamples – Timing samples recorded since the last chart width reset.
 * @param sampleIndex – Sample ordinal stored on the tag.
 * @param chartWidth – Chart width in pixels.
 * @returns `true` when the tag should be dropped.
 */
export function shouldPruneTimingChartTag(totalSamples: number, sampleIndex: number, chartWidth: number): boolean {
    const column = computeTimingChartTagColumn(sampleIndex, totalSamples, chartWidth);

    return column === null || column <= -chartWidth;
}

/**
 * Screen-space X for tick and label text above the chart band.
 *
 * @param chartX – Left edge of the chart band.
 * @param chartWidth – Chart width in pixels.
 * @param sampleIndex – Sample ordinal when the tag was assigned.
 * @param totalSamples – Timing samples recorded since the last chart width reset.
 * @returns Pixel X for text left edge, or `null` when past the right edge.
 */
export function computeTimingChartTagTextX(
    chartX: number,
    chartWidth: number,
    sampleIndex: number,
    totalSamples: number,
): number | null {
    const column = computeTimingChartTagColumn(sampleIndex, totalSamples, chartWidth);

    if (column === null) {
        return null;
    }

    return chartX + column + TIMING_CHART_TAG_TEXT_X_OFFSET;
}

/**
 * Screen-space X for the one-pixel vertical marker (aligned with timing dots).
 *
 * @param chartX – Left edge of the chart band.
 * @param chartWidth – Chart width in pixels.
 * @param sampleIndex – Sample ordinal when the tag was assigned.
 * @param totalSamples – Timing samples recorded since the last chart width reset.
 * @returns Pixel X for the marker column, or `null` when past the right edge.
 */
export function computeTimingChartTagMarkerX(
    chartX: number,
    chartWidth: number,
    sampleIndex: number,
    totalSamples: number,
): number | null {
    const column = computeTimingChartTagColumn(sampleIndex, totalSamples, chartWidth);

    if (column === null) {
        return null;
    }

    return chartX + column;
}

/**
 * Screen-space Y for the relative tick row above the chart band.
 *
 * @param chartTopY – Top edge of the chart band.
 * @returns Pixel Y for the tick text baseline.
 */
export function computeTimingChartTagTickY(chartTopY: number): number {
    return chartTopY - TIMING_CHART_TAG_TICK_Y_OFFSET;
}

/**
 * Screen-space Y for a stacked tag label row below the tick row.
 *
 * @param chartTopY – Top edge of the chart band.
 * @param stackIndex – Zero-based row below the tick (0 = first label).
 * @returns Pixel Y for the label text baseline.
 */
export function computeTimingChartTagLabelY(chartTopY: number, stackIndex: number): number {
    return (
        computeTimingChartTagTickY(chartTopY) +
        TIMING_CHART_TAG_LABEL_Y_GAP +
        TIMING_CHART_TAG_LABEL_STACK_SPACING * stackIndex
    );
}

/**
 * Groups on-screen tags by sample column for stacked drawing.
 *
 * Relies on {@link TimingChartTag.sampleIndex} being non-decreasing across `tags` (tags are
 * pushed in assignment order and `sampleIndex` is the monotonic sample counter at assign time,
 * and pruning preserves relative order), so tags sharing a column are always contiguous – a
 * single run-length pass over pooled group descriptors replaces the previous per-call
 * `Map`/array allocations.
 *
 * @param tags – Active tags for the current frame.
 * @param totalSamples – Timing samples recorded since the last chart width reset.
 * @param chartWidth – Chart width in pixels.
 * @param scratch – Reusable group pool from {@link createTimingChartTagGroupScratch}.
 * @returns Groups in first-seen column order; live only until the next call with `scratch`.
 */
export function groupTimingChartTagsByColumn(
    tags: readonly TimingChartTag[],
    totalSamples: number,
    chartWidth: number,
    scratch: TimingChartTagGroupScratch,
): readonly TimingChartTagColumnGroup[] {
    if (tags.length === 0) {
        scratch.groups.length = 0;

        return scratch.groups;
    }

    let groupCount = 0;
    let currentGroup: TimingChartTagColumnGroup | undefined;

    for (const tag of tags) {
        if (shouldPruneTimingChartTag(totalSamples, tag.sampleIndex, chartWidth)) {
            continue;
        }

        if (currentGroup === undefined || currentGroup.sampleIndex !== tag.sampleIndex) {
            currentGroup = acquireTagGroup(scratch, groupCount, tag.sampleIndex);
            groupCount++;
        }

        currentGroup.tags.push(tag);
    }

    scratch.groups.length = groupCount;

    return scratch.groups;
}

/**
 * Relative tick text for the tag tick row (ticks since chart reset).
 *
 * @param tagTick – Absolute tick when the tag was assigned.
 * @param startTick – Tick recorded when the chart last reset.
 * @returns Relative tick string capped at {@link TIMING_CHART_TAG_REL_TICK_MAX}.
 */
export function formatTimingChartTagRelTick(tagTick: number, startTick: number): string {
    const relTick = tagTick - startTick;

    return String(Math.min(relTick, TIMING_CHART_TAG_REL_TICK_MAX));
}

/**
 * Removes off-screen tags using an in-place compact (no allocation).
 *
 * @param tags – Mutable tag list.
 * @param totalSamples – Timing samples recorded since the last chart width reset.
 * @param chartWidth – Chart width in pixels.
 */
export function pruneTimingChartTagsInPlace(tags: TimingChartTag[], totalSamples: number, chartWidth: number): void {
    let write = 0;

    for (let read = 0; read < tags.length; read++) {
        /* eslint-disable security/detect-object-injection -- read index bounded by tags.length */
        const tag = tags[read];

        if (tag === undefined || shouldPruneTimingChartTag(totalSamples, tag.sampleIndex, chartWidth)) {
            continue;
        }

        if (write !== read) {
            tags[write] = tag;
        }

        write++;
        /* eslint-enable security/detect-object-injection */
    }

    tags.length = write;
}
