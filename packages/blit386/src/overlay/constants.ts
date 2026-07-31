/** Default palette indices when HUD named slots are unavailable. */
export const DEFAULT_IDX_BG = 1;

/** Default palette index for overlay system-font text. */
export const DEFAULT_IDX_TEXT = 2;

/** System font glyph advance in pixels. */
export const SYSTEM_CHAR_ADVANCE = 6;

/** Visual space in pixels between an in-row divider line and the text on each side. */
export const OVERLAY_DIVIDER_GAP_PX = 7;

/** Fixed character width for the present-FPS metrics field (covers up to 3 digits). */
export const OVERLAY_FPS_FIELD_WIDTH = 3;

/** Fixed character width for millisecond timing fields (covers up to `99.9`). */
export const OVERLAY_MS_FIELD_WIDTH = 4;

/** Fixed character width for the update-step suffix (for example `x3`), including when absent. */
export const OVERLAY_UPDATE_STEPS_FIELD_WIDTH = 2;

/** Fixed character width for renderer diagnostics vertex counts (pipelines cap at 50k vertices/frame). */
export const OVERLAY_DIAGNOSTICS_VERTEX_FIELD_WIDTH = 5;

/** Fixed character width for renderer diagnostics overflow counts. */
export const OVERLAY_DIAGNOSTICS_OVERFLOW_FIELD_WIDTH = 3;
