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
 * The panels and buttons come from the shared UI kit in src/shared/ui.js, so each pitch
 * preset works three ways: click its button, tap it on a phone, or press its number key.
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
 * - Press 1, 2, or 3 (or tap the matching button) to play a short "blip" at a low,
 *   normal, or high pitch.
 * - Click near the top of the screen for a loud "pop," or near the bottom for a quiet
 *   one. Click near the left or right edge to hear it pan toward that speaker
 *   (headphones or stereo speakers make this easiest to hear).
 * - Press the backquote key (`) or click the small icon in the bottom-left corner to
 *   open the engine overlay, then play a few sounds and watch the audio meters move.
 */

import { AudioClip, bootstrap, BT, Rect2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').Vector2i} Vector2i */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */

// How many fixed ticks a click flash stays lit before fading back to normal.
// The engine runs 60 ticks per second by default, so 12 ticks is about 200ms.
const FLASH_TICKS = 12;

// The three pitch-preset buttons, and the pitch each one plays the blip sound at.
// 1.0 is the sound's natural pitch; smaller numbers sound lower and slower,
// bigger numbers sound higher and faster. `label` is the button text (which doubles as
// the keyboard hint), and `code` is the bound key.
const KEY_PITCH_PRESETS = [
    { code: 'Digit1', label: '1 - Low (0.75x)', pitch: 0.75 },
    { code: 'Digit2', label: '2 - Normal (1.00x)', pitch: 1.0 },
    { code: 'Digit3', label: '3 - High (1.50x)', pitch: 1.5 },
];

// All pitch buttons share one width so the left panel reads as a tidy keypad.
const PITCH_BUTTON_W = 120;

// A click near the top of the screen plays at POINTER_VOLUME_MAX; a click near the
// bottom plays at POINTER_VOLUME_MIN. Everything in between fades smoothly.
const POINTER_VOLUME_MAX = 1.0;
const POINTER_VOLUME_MIN = 0.2;

// A click at the left edge pans fully left (-1); a click at the right edge pans
// fully right (+1).
const POINTER_PAN_MIN = -1;
const POINTER_PAN_MAX = 1;

// Half the width of the little square ring drawn where you last clicked, in pixels.
// The marker is drawn by stepping this far out from the click point on every side.
const CLICK_MARKER_HALF_SIZE = 6;

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

    /** Palette slots of the shared UI theme colors, filled by applyTheme() in init(). */
    theme = null;

    /** @type {AudioClip | null} Short blip sound played by the pitch buttons. */
    blipClip = null;

    /** @type {AudioClip | null} Short pop sound played by clicking. */
    popClip = null;

    /** @type {number | null} Pitch of the most recently played blip, or null before the first press. */
    lastKeyPitch = null;

    // Flash countdown for the click marker and the pointer panel's volume meter.
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
            // Live per-bus level meters and a voice-count readout in the overlay (explained in the header above).
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

        // applyTheme() installs the twelve shared UI colors (panels, text, buttons, ...)
        // and reports their slots, so render() can clear the screen with the theme's
        // background color and draw the click marker with the theme's accent green.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);
        return true;
    }

    /**
     * Runs the UI kit's once-per-tick housekeeping, then reads pointer clicks.
     *
     * The pitch keys (1/2/3) are bound to the buttons declared in render() via their
     * { key } option. ui.tick() is where the kit safely catches those presses - keyboard
     * "was it just pressed?" flags can only be read reliably here in update(), never in
     * render() (028-keyboard-input explains why in detail).
     */
    update() {
        ui.tick();

        // BT.BTN_POINTER_A is the primary click (left mouse button, or a touchscreen
        // tap). BT.isPressed fires only once, on the frame the click happens - the same
        // way 025-pointer-basics and 026-pointer-paint read their clicks.
        if (BT.isPressed(BT.BTN_POINTER_A, 0)) {
            const pos = BT.pointerPos(0);

            // Skip clicks that land on a UI kit widget - tapping a pitch button should
            // only play its blip, not also fire a pop underneath the button.
            if (!ui.overWidget(pos.x, pos.y)) {
                this.playPopAt(pos);
            }
        }

        // Count the click flash down toward zero, one tick at a time.
        if (this.pointerFlashTimer > 0) {
            this.pointerFlashTimer -= 1;
        }
    }

    /**
     * Clears the screen and declares the whole UI: the unlock/status message, the click
     * marker, and the two info panels along the bottom edge.
     */
    render() {
        BT.clear(this.theme.bg);

        // The click marker is scene drawing, not a widget - draw it first so the panels
        // always sit on top of it.
        this.renderClickMarker();

        this.renderStatusLine();
        this.renderKeyboardPanel();
        this.renderPointerPanel();
    }

    /**
     * The status line in the top-left corner: the shared unlock reminder until audio is
     * unlocked, then a plain reminder of the controls. A borderless group - just one
     * line of text, no panel around it.
     */
    renderStatusLine() {
        ui.begin('topLeft');

        // The shared "click to enable sound" row - it draws itself only while sound is
        // still locked, and disappears on its own after the first click or key press.
        ui.audioUnlockHint();

        // Once sound works, swap in a short reminder of what to try instead.
        if (BT.isAudioUnlocked) {
            ui.label('Tap a button for a blip. Click anywhere for a pop.', { color: 'dim' });
        }

        ui.end();
    }

    /**
     * Draws a small square ring where you last clicked, only while its flash is active.
     */
    renderClickMarker() {
        if (this.lastClickPos === null || this.pointerFlashTimer === 0) {
            return;
        }

        const marker = new Rect2i(
            this.lastClickPos.x - CLICK_MARKER_HALF_SIZE,
            this.lastClickPos.y - CLICK_MARKER_HALF_SIZE,
            CLICK_MARKER_HALF_SIZE * 2,
            CLICK_MARKER_HALF_SIZE * 2,
        );

        BT.drawRect(marker, this.theme.accent);
    }

    /**
     * Left-hand panel: one button per pitch preset, plus the pitch last played. Each
     * button fires on click, tap, or its number key - ui.button() treats all three the
     * same, which is what makes this demo playable on a touchscreen.
     */
    renderKeyboardPanel() {
        ui.begin('bottomLeft');
        ui.panel('Keyboard SFX (pitch)');

        for (const preset of KEY_PITCH_PRESETS) {
            if (ui.button(preset.label, { key: preset.code, width: PITCH_BUTTON_W })) {
                // Play the blip at this preset's speed and remember it for the row below.
                BT.soundPlay(this.blipClip, { pitch: preset.pitch });
                this.lastKeyPitch = preset.pitch;
            }
        }

        const lastPitchLabel = this.lastKeyPitch === null ? '-' : `${this.lastKeyPitch.toFixed(2)}x`;

        ui.kv('Last pitch', lastPitchLabel);
        ui.end();
    }

    /**
     * Right-hand panel: the volume and pan of the most recent click. The volume gets a
     * meter bar that fills left-to-right (and flashes green right after a click); the
     * pan is a plain number row, since -1 means left, 0 center, and +1 right.
     */
    renderPointerPanel() {
        const hasClicked = this.lastClickVolume !== null && this.lastClickPan !== null;
        const flashing = this.pointerFlashTimer > 0;

        ui.begin('bottomRight');
        ui.panel('Pointer SFX (volume/pan)');

        // Two short reminders of how a click's position maps to sound.
        ui.label('Top = loud, bottom = quiet', { color: 'dim' });
        ui.label('Left/right edge = pan', { color: 'dim' });
        ui.spacer(4);

        // Volume row plus a read-only bar showing the same value ('-' before any click).
        ui.kv('Volume', hasClicked ? this.lastClickVolume.toFixed(2) : '-');
        ui.meter(null, hasClicked ? this.lastClickVolume : 0, { color: flashing ? 'accent' : 'info' });

        // Pan as a signed number: -1.00 is fully left, 0.00 centered, +1.00 fully right.
        ui.kv('Pan', hasClicked ? this.lastClickPan.toFixed(2) : '-');
        ui.end();
    }

    /**
     * Plays the pop sound with a volume and pan taken from where the click landed, and
     * remembers everything the pointer panel and click marker show.
     *
     * @param {Vector2i} pos - Where the click landed, in display pixels.
     */
    playPopAt(pos) {
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
}

bootstrap(Demo);
