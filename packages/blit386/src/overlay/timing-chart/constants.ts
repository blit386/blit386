/** Default timing chart band height in pixels (RetroBlit uses bottom - 22). */
export const DEFAULT_TIMING_CHART_HEIGHT = 22;

/** Milliseconds mapped to full chart band height (~one 60 FPS frame budget). */
export const TIMING_CHART_FULL_SCALE_MS = 16;

/** Default warning palette index for timing chart semantic overlays. */
export const TIMING_CHART_DEFAULT_WARNING_IDX = 3;

/** Default error palette index for timing chart semantic overlays. */
export const TIMING_CHART_DEFAULT_ERROR_IDX = 4;

/** Default palette index for timing chart tag and tick text. */
export const TIMING_CHART_DEFAULT_TAG_IDX = 5;

/**
 * WebGPU primitive/sprite pipeline vertex cap for rich-mode pressure scaling.
 *
 * Unit: vertices. Matches the batch limit used by {@link PrimitivePipeline} and
 * {@link SpritePipeline}; submitted counts are scaled against this value when
 * drawing vertex-pressure dots. Increase only if those pipeline caps change.
 */
export const TIMING_CHART_MAX_PIPELINE_VERTICES = 50000;

/**
 * Fraction of chart band height reserved for vertex-pressure dots in rich diagnostics.
 *
 * Unitless ratio in the 0–1 range (default 1/3).
 * Dots render in the lower portion of the band; raising the value expands the
 * pressure region upward; lowering it compresses dots toward the baseline.
 */
export const TIMING_CHART_PRESSURE_REGION_RATIO = 1 / 3;

/**
 * Fixed interior grid markers in milliseconds. Excludes 1 ms (band bottom edge).
 * Frame budget is added at draw time from targetFPS.
 */
export const TIMING_CHART_GRID_MARKER_MS: readonly number[] = [5, 10, 33.33];
