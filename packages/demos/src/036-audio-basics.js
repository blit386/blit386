/**
 * Audio Basics Demo - loading sounds, playing them, and the "click to allow sound" rule.
 *
 * Demo 036 in the BLIT386 demo series.
 * Prerequisites:
 *   025-Pointer Basics  https://demos.blit386.dev/025-pointer-basics
 *   028-Keyboard Input  https://demos.blit386.dev/028-keyboard-input
 *
 * Live version: https://demos.blit386.dev/036-audio-basics
 *
 * Every web browser refuses to make any sound at all until you click or press a key on
 * the page - this is called the "autoplay policy," and it exists so a page you just
 * opened cannot suddenly blast noise at you without asking first. BT.isAudioUnlocked
 * tells you whether that first click or key press has happened yet.
 *
 * This page loads two short sound effects with AudioClip.load() and plays them with
 * BT.soundPlay(), which can also change how a sound plays each time:
 * - pitch: how fast the sound plays back. Higher pitch sounds faster and higher, like
 *   speeding up a cassette tape. Lower pitch sounds slower and deeper.
 * - volume: how loud the sound is, from 0 (silent) to 1 (full volume).
 * - pan: which speaker the sound favors, from -1 (only the left speaker) through 0
 *   (centered) to +1 (only the right speaker).
 *
 * The engine's built-in overlay can also show live audio meters: little bars that move
 * up and down with how loud each audio bus (main, music, sfx) is right now, plus a
 * count of how many sounds are playing at once. This demo turns that feature on with
 * `isOverlayAudioMetersEnabled: true` in configure() - open the overlay (see below) and
 * watch the meters jump every time a blip or pop plays.
 *
 * Try this:
 * - Click anywhere, or press any key, to unlock sound - watch the message at the top
 *   change once you do.
 * - Press 1, 2, or 3 to play a short "blip" at a low, normal, or high pitch.
 * - Click near the top of the screen for a loud "pop," or near the bottom for a quiet
 *   one. Click near the left or right edge to hear it pan toward that speaker
 *   (headphones or stereo speakers make this easiest to hear).
 * - Press the backquote key (`) or click the small icon in the bottom-left corner to
 *   open the engine overlay, then play a few sounds and watch the audio meters move.
 */

import { AudioClip, bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */

// Palette indices. Slot 0 stays transparent.
const C_WHITE = 1;
const C_BG = 2;
const C_AMBER = 3;
const C_DIM = 4;
const C_LIT = 5;
const C_PANEL = 6;
const C_PANEL_BORDER = 7;
const C_ACCENT = 8;
const C_METER_FILL = 9;

// How many fixed ticks a key or click flash stays lit before fading back to normal.
// The engine runs 60 ticks per second by default, so 12 ticks is about 200ms.
const FLASH_TICKS = 12;

// The three number keys, and the pitch each one plays the blip sound at.
// 1.0 is the sound's natural pitch; smaller numbers sound lower and slower,
// bigger numbers sound higher and faster.
const KEY_PITCH_PRESETS = [
    { code: 'Digit1', label: '1', pitch: 0.75 },
    { code: 'Digit2', label: '2', pitch: 1.0 },
    { code: 'Digit3', label: '3', pitch: 1.5 },
];

// A click near the top of the screen plays at POINTER_VOLUME_MAX; a click near the
// bottom plays at POINTER_VOLUME_MIN. Everything in between fades smoothly.
const POINTER_VOLUME_MAX = 1.0;
const POINTER_VOLUME_MIN = 0.2;

// A click at the left edge pans fully left (-1); a click at the right edge pans
// fully right (+1).
const POINTER_PAN_MIN = -1;
const POINTER_PAN_MAX = 1;

// Layout for the two side-by-side info panels near the bottom of the screen.
const PANEL_Y = 150;
const PANEL_W = 148;
const PANEL_H = 82;
const PANEL_LEFT_X = 8;
const PANEL_RIGHT_X = 168;

// Radius of the little square ring drawn where you last clicked, in pixels.
const CLICK_MARKER_RADIUS = 6;

/**
 * Keeps a number from going below `min` or above `max`.
 *
 * @param {number} value - Number to restrict.
 * @param {number} min - Smallest allowed result.
 * @param {number} max - Largest allowed result.
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Shows AudioClip loading, BT.soundPlay volume/pitch/pan, and the audio unlock gesture.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    /** @type {AudioClip | null} Short blip sound played by the number keys. */
    blipClip = null;

    /** @type {AudioClip | null} Short pop sound played by clicking. */
    popClip = null;

    // One flash-countdown per key preset, so each key's indicator lights up on its own.
    keyFlashTimers = [0, 0, 0];

    /** @type {number | null} Pitch of the most recently played blip, or null before the first press. */
    lastKeyPitch = null;

    // Flash countdown for the click marker and the pointer info panel.
    pointerFlashTimer = 0;

    /** @type {Vector2i | null} Where the pointer was the last time it was clicked. */
    lastClickPos = null;

    /** @type {number | null} Volume used for the most recent pop sound. */
    lastClickVolume = null;

    /** @type {number | null} Pan used for the most recent pop sound. */
    lastClickPan = null;

    /**
     * Turns on the engine's built-in audio meters in the overlay.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            // Adds live bar-graph meters (main/music/sfx bus levels) plus a voice-count
            // readout to the overlay. Off by default, since measuring audio levels costs a
            // little extra CPU work the engine skips unless a demo asks for it.
            isOverlayAudioMetersEnabled: true,
        };
    }

    /**
     * Loads the two sound clips and sets up the palette.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // AudioClip.load() downloads a sound file and decodes it into a ready-to-play
        // buffer. That part works right away, even before the page is "unlocked" for
        // sound - only actually hearing a sound (BT.soundPlay, below) waits for that.
        this.blipClip = await AudioClip.load('/audio/blip.wav');
        this.popClip = await AudioClip.load('/audio/pop.wav');

        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(18, 22, 38));
        this.palette.set(C_AMBER, new Color32(255, 200, 120));
        this.palette.set(C_DIM, new Color32(130, 140, 160));
        this.palette.set(C_LIT, new Color32(120, 255, 160));
        this.palette.set(C_PANEL, new Color32(35, 42, 62));
        this.palette.set(C_PANEL_BORDER, new Color32(90, 98, 120));
        this.palette.set(C_ACCENT, new Color32(255, 140, 90));
        this.palette.set(C_METER_FILL, new Color32(120, 190, 255));

        BT.paletteSet(this.palette);
        return true;
    }

    /**
     * Reads keyboard and pointer input for this tick and plays sounds in response.
     *
     * We check for key presses and clicks here in update(), not in render(). The engine
     * clears "was this just pressed?" flags once per tick, and that tick always finishes
     * before this frame's render() runs - checking in render() instead would randomly
     * miss fast taps (028-keyboard-input explains this in more detail).
     */
    update() {
        // Each number key plays the blip sound at its own pitch.
        for (let i = 0; i < KEY_PITCH_PRESETS.length; i++) {
            const preset = KEY_PITCH_PRESETS[i];

            if (!BT.isKeyPressed(preset.code)) {
                continue;
            }

            BT.soundPlay(this.blipClip, { pitch: preset.pitch });
            this.keyFlashTimers[i] = FLASH_TICKS;
            this.lastKeyPitch = preset.pitch;
        }

        // Count every active flash timer down toward zero, one tick at a time.
        for (let i = 0; i < this.keyFlashTimers.length; i++) {
            if (this.keyFlashTimers[i] > 0) {
                this.keyFlashTimers[i] -= 1;
            }
        }

        // BT.BTN_POINTER_A is the primary click (left mouse button, or a touchscreen
        // tap). BT.isPressed fires only once, on the frame the click happens - the same
        // way 025-pointer-basics and 026-pointer-paint read their clicks.
        if (BT.isPressed(BT.BTN_POINTER_A, 0)) {
            const pos = BT.pointerPos(0);
            const screen = BT.displaySize;

            // Turn the click's vertical position into a volume: 0 at the very top of the
            // screen, 1 at the very bottom.
            const verticalFraction = clamp(pos.y / screen.y, 0, 1);
            // Loud at the top, quiet at the bottom, so we count down from the maximum.
            const volume = POINTER_VOLUME_MAX - verticalFraction * (POINTER_VOLUME_MAX - POINTER_VOLUME_MIN);

            // Turn the click's horizontal position into a pan: 0 at the left edge of the
            // screen, 1 at the right edge, then stretched out to the -1..+1 range BT.soundPlay
            // expects.
            const horizontalFraction = clamp(pos.x / screen.x, 0, 1);
            const pan = POINTER_PAN_MIN + horizontalFraction * (POINTER_PAN_MAX - POINTER_PAN_MIN);

            BT.soundPlay(this.popClip, { volume, pan });

            this.lastClickPos = pos;
            this.lastClickVolume = volume;
            this.lastClickPan = pan;
            this.pointerFlashTimer = FLASH_TICKS;
        }

        if (this.pointerFlashTimer > 0) {
            this.pointerFlashTimer -= 1;
        }
    }

    /**
     * Clears the screen and draws the unlock message, click marker, and info panels.
     */
    render() {
        BT.clear(C_BG);

        this.renderUnlockPrompt();
        this.renderClickMarker();
        this.renderKeyboardPanel(PANEL_LEFT_X, PANEL_Y);
        this.renderPointerPanel(PANEL_RIGHT_X, PANEL_Y);
    }

    /**
     * Shows the "please click or press a key" message until audio is unlocked, then
     * switches to a plain reminder of the controls.
     */
    renderUnlockPrompt() {
        if (!BT.isAudioUnlocked) {
            BT.systemPrint(new Vector2i(8, 8), C_ACCENT, 'Click or press a key to enable sound');
            return;
        }

        BT.systemPrint(new Vector2i(8, 8), C_DIM, 'Press 1, 2, 3 for a blip. Click anywhere for a pop.');
    }

    /**
     * Draws a small square ring where you last clicked, only while its flash is active.
     */
    renderClickMarker() {
        if (this.lastClickPos === null || this.pointerFlashTimer === 0) {
            return;
        }

        const marker = new Rect2i(
            this.lastClickPos.x - CLICK_MARKER_RADIUS,
            this.lastClickPos.y - CLICK_MARKER_RADIUS,
            CLICK_MARKER_RADIUS * 2,
            CLICK_MARKER_RADIUS * 2,
        );

        BT.drawRect(marker, C_LIT);
    }

    /**
     * Left-hand panel: the three pitch-preset keys and the pitch last played.
     *
     * @param {number} x - Left edge of the panel in display pixels.
     * @param {number} y - Top edge of the panel.
     */
    renderKeyboardPanel(x, y) {
        BT.drawRectFill(new Rect2i(x, y, PANEL_W, PANEL_H), C_PANEL);
        BT.drawRect(new Rect2i(x, y, PANEL_W, PANEL_H), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(x + 4, y + 4), C_AMBER, 'Keyboard SFX (pitch)');

        for (let i = 0; i < KEY_PITCH_PRESETS.length; i++) {
            const preset = KEY_PITCH_PRESETS[i];
            const rowY = y + 20 + i * 14;
            const flashing = this.keyFlashTimers[i] > 0;
            const pip = new Rect2i(x + 6, rowY, 8, 8);

            if (flashing) {
                BT.drawRectFill(pip, C_LIT);
            } else {
                BT.drawRect(pip, C_PANEL_BORDER);
            }

            const rowColor = flashing ? C_LIT : C_DIM;
            BT.systemPrint(new Vector2i(x + 20, rowY - 1), rowColor, `Key ${preset.label}`);
            BT.systemPrint(new Vector2i(x + 90, rowY - 1), rowColor, `${preset.pitch.toFixed(2)}x`);
        }

        const lastPitchLabel = this.lastKeyPitch === null ? '—' : `${this.lastKeyPitch.toFixed(2)}x`;
        BT.systemPrint(new Vector2i(x + 6, y + 66), C_DIM, 'Last pitch:');
        BT.systemPrint(new Vector2i(x + 70, y + 66), this.lastKeyPitch === null ? C_DIM : C_WHITE, lastPitchLabel);
    }

    /**
     * Right-hand panel: a volume bar and a pan meter for the most recent click.
     *
     * @param {number} x - Left edge of the panel in display pixels.
     * @param {number} y - Top edge of the panel.
     */
    renderPointerPanel(x, y) {
        BT.drawRectFill(new Rect2i(x, y, PANEL_W, PANEL_H), C_PANEL);
        BT.drawRect(new Rect2i(x, y, PANEL_W, PANEL_H), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(x + 4, y + 4), C_AMBER, 'Pointer SFX (volume/pan)');

        const flashing = this.pointerFlashTimer > 0;
        const hasClicked = this.lastClickVolume !== null && this.lastClickPan !== null;
        const meterColor = flashing ? C_LIT : C_METER_FILL;

        // Volume bar: an empty outline that fills up left-to-right with the last volume.
        const volumeLabel = hasClicked ? this.lastClickVolume.toFixed(2) : '—';
        BT.systemPrint(new Vector2i(x + 6, y + 18), C_DIM, `Volume: ${volumeLabel}`);

        const barX = x + 6;
        const barY = y + 30;
        const barW = 120;
        BT.drawRect(new Rect2i(barX, barY, barW, 8), C_PANEL_BORDER);

        if (hasClicked) {
            const fillW = Math.round(barW * this.lastClickVolume);
            BT.drawRectFill(new Rect2i(barX, barY, fillW, 8), meterColor);
        }

        // Pan meter: a track with a small marker sliding from L (left) to R (right).
        const panLabel = hasClicked ? this.lastClickPan.toFixed(2) : '—';
        BT.systemPrint(new Vector2i(x + 6, y + 44), C_DIM, `Pan: ${panLabel}`);

        const trackX = x + 6;
        const trackY = y + 56;
        const trackW = 120;
        BT.drawRect(new Rect2i(trackX, trackY, trackW, 6), C_PANEL_BORDER);
        BT.systemPrint(new Vector2i(trackX, trackY + 8), C_DIM, 'L');
        BT.systemPrint(new Vector2i(trackX + trackW - 6, trackY + 8), C_DIM, 'R');

        if (hasClicked) {
            const panFraction = (this.lastClickPan - POINTER_PAN_MIN) / (POINTER_PAN_MAX - POINTER_PAN_MIN);
            const markerX = trackX + Math.round(panFraction * (trackW - 4));
            BT.drawRectFill(new Rect2i(markerX, trackY, 4, 6), meterColor);
        }
    }
}

bootstrap(Demo);
