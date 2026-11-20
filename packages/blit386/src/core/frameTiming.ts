/**
 * Gaps of at least this many ms between frames are treated as tab-switch or
 * page-visibility pauses. The game loop leaves them out of drop detection and
 * the overlay's FPS sampler leaves them out of its average.
 */
export const BACKGROUND_THRESHOLD_MS = 1000;
