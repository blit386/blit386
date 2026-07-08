/** Default audio meter band height in pixels (single-row height, matches {@link OVERLAY_BAR_HEIGHT}). */
export const DEFAULT_AUDIO_METER_HEIGHT = 13;

/** Bus level mapped to full meter band height (levels from {@link AudioManager.getBusLevels} are already normalized 0..1). */
export const AUDIO_METER_FULL_SCALE = 1;

/** Level at or above which a bus bar switches to the warning tint. */
export const AUDIO_METER_WARNING_THRESHOLD = 0.7;

/** Level at or above which a bus bar switches to the clip tint. */
export const AUDIO_METER_CLIP_THRESHOLD = 0.95;

/** Default warning palette index for audio meter semantic overlays. */
export const AUDIO_METER_DEFAULT_WARNING_IDX = 3;

/** Default clip palette index for audio meter semantic overlays. */
export const AUDIO_METER_DEFAULT_CLIP_IDX = 4;

/** Number of fixed bus bars drawn side by side (main, music, sfx). */
export const AUDIO_METER_BUS_COUNT = 3;

/** Width in pixels of one bus level bar. */
export const AUDIO_METER_BAR_WIDTH_PX = 4;

/** Horizontal gap in pixels between bus level bars. */
export const AUDIO_METER_BAR_GAP_PX = 1;

/** Horizontal gap in pixels between the bus bar block and the voice/steal/drop text readout. */
export const AUDIO_METER_TEXT_GAP_PX = 4;
