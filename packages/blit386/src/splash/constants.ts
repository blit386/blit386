/**
 * Splash layout, palette, and timing constants.
 *
 * Deliberately file-local to the splash subsystem rather than exported to
 * consumers: these are tuning values, not API.
 */

/** Number of gray steps in the splash ramp. */
export const RAMP_STEPS = 16;

/** First palette slot the ramp occupies. Slot 0 is reserved transparent. */
export const RAMP_FIRST_SLOT = 1;

/** Last palette slot the ramp occupies. */
export const RAMP_LAST_SLOT = RAMP_FIRST_SLOT + RAMP_STEPS - 1;

/**
 * Palette size the splash allocates.
 *
 * `Palette` only accepts 2, 4, 16, 32, 64, 128, or 256 slots, so the ramp's
 * natural 17 (slot 0 plus 16 steps) rounds up to the next valid size. Slots
 * above {@link RAMP_LAST_SLOT} stay at their constructed black and are never
 * drawn. This costs the game nothing: the splash palette and the game's palette
 * never coexist.
 */
export const RAMP_PALETTE_SIZE = 32;

/** Fade-in duration in milliseconds. */
export const FADE_IN_MS = 250;

/**
 * Minimum hold duration in milliseconds.
 *
 * A minimum, not a maximum: the hold extends past this until the game's `init()`
 * settles, so the splash doubles as a loading screen.
 */
export const HOLD_MIN_MS = 900;

/**
 * The one duration behind both halves of the handoff.
 *
 * The splash fading down and the game's palette fading up have to match, or the
 * two read as separate fades instead of one continuous in-camera move. Kept
 * module-local and re-exported under two names so each side reads clearly at its
 * own call site while there is still only one number to change.
 */
const HANDOFF_MS = 400;

/** Fade-out duration in milliseconds. */
export const FADE_OUT_MS = HANDOFF_MS;

/**
 * Duration of the exposure fade that brings the game's captured palette up at
 * handoff, in milliseconds.
 *
 * Always equal to {@link FADE_OUT_MS}; both derive from the same value.
 */
export const HANDOFF_FADE_MS = HANDOFF_MS;

/** Peak band-displacement intensity of the WebGPU-only dissolve. */
export const GLITCH_MAX_INTENSITY = 0.6;

/** Band height in logical pixels for the WebGPU-only dissolve. */
export const GLITCH_BAND_HEIGHT = 3;
