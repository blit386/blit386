import type { AudioBus } from '../../core/IBTDemo';

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

/** Fixed bus draw order (main, music, sfx), mirroring the bus graph's `PerBus` key order. */
export const AUDIO_METER_BUSES: readonly AudioBus[] = ['main', 'music', 'sfx'];

/** Number of fixed bus bars drawn side by side; derived from {@link AUDIO_METER_BUSES} so the two can't drift. */
export const AUDIO_METER_BUS_COUNT = AUDIO_METER_BUSES.length;

/** Width in pixels of one bus level bar. */
export const AUDIO_METER_BAR_WIDTH_PX = 4;

/** Horizontal gap in pixels between bus level bars. */
export const AUDIO_METER_BAR_GAP_PX = 1;

/** Horizontal gap in pixels between the bus bar block and the voice/steal/drop text readout. */
export const AUDIO_METER_TEXT_GAP_PX = 4;
