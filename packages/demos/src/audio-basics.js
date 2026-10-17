/*

Audio Basics: load sounds, play them with pitch, volume, and pan, and unlock audio first.
@description Load a clip, play it with volume, pitch, and pan variation, and handle the first-gesture audio unlock.

Part of the BLIT386 demo series.

Prerequisites:
  - Pointer Basics: https://demos.blit386.dev/pointer-basics
  - Keyboard Input: https://demos.blit386.dev/keyboard-input

Live version: https://demos.blit386.dev/audio-basics

Guides:
  - Audio: https://blit386.dev/docs/guides/audio#playing-sfx

Reference:
  - Audio: https://blit386.dev/docs/api/audio#playback-sfx
  - Overlay: https://blit386.dev/docs/api/overlay#audio-meters-optional

---

WHAT YOU WILL SEE
-----------------

A dark navy screen with one line of text in the top-left corner. Until you click or press
a key it reads "Click or press a key to enable sound" in warm orange; after that it turns
into a dim reminder: "Tap a button for a blip. Click anywhere for a pop."

Two panels sit along the bottom edge. "Keyboard SFX (pitch)" on the left has three
buttons, "1 - Low (0.75x)", "2 - Normal (1.00x)", and "3 - High (1.50x)", plus a "Last
pitch" row. "Pointer SFX (volume/pan)" on the right shows the volume and pan of your most
recent click: a "Volume" row with a meter bar under it and a "Pan" row.

Every click that lands outside a widget plays a pop and draws a small green square ring
where you clicked. The ring stays for 12 ticks (about 200 ms), and the volume meter
flashes green for the same 12 ticks.

WHAT YOU WILL LEARN
-------------------

- AudioClip.load(url) downloads a sound file and decodes it into a ready-to-play clip. It
  works before sound is unlocked - only hearing a sound has to wait.
- BT.soundPlay(clip, { pitch }) plays a clip faster or slower than recorded.
- BT.soundPlay(clip, { volume, pan }) sets how loud a sound is and which speaker it
  favors.
- BT.isAudioUnlocked reports whether the first click or key press has happened yet.
- BT.isPressed(BT.BTN_POINTER_A, 0) and BT.pointerPos(0) read a click and where it landed,
  and ui.overWidget(x, y) skips clicks that hit a UI kit widget.
- Turning a screen position into a number in a range: clamp a fraction to 0..1, then
  stretch it over the range you want.
- isOverlayAudioMetersEnabled: true adds live bus level bars to the engine overlay.

WHY DOES SOUND WAIT FOR A CLICK?
--------------------------------

Every web browser refuses to make any sound at all until you click, tap, or press a key on
the page. This is called the "autoplay policy", and it exists so a page you just opened
cannot suddenly blast noise at you. The engine listens for that first gesture and unlocks
its audio for the rest of the session; BT.isAudioUnlocked flips to true once it has.

Not every audio call waits the same way. A sound played with BT.soundPlay() before the
unlock is simply dropped (the overlay's "drop" counter goes up by one). Music started with
BT.musicPlay() is remembered and starts the instant sound unlocks - the Music demo shows
that. Volume and mute changes are kept too, and apply as soon as sound unlocks.

PITCH, VOLUME, AND PAN
----------------------

- pitch: how fast the sound plays back. 1 is the recorded speed; 1.5 sounds faster and
  higher, like speeding up a cassette tape, and 0.75 sounds slower and deeper.
- volume: how loud the sound is, from 0 (silent) to 1 (full volume).
- pan: which speaker the sound favors, from -1 (only the left speaker) through 0
  (centered) to +1 (only the right speaker).

Here the click position picks the numbers: the top of the screen is volume 1.0 and the
bottom is 0.2, the left edge is pan -1 and the right edge is pan +1.

TRY THIS
--------

- Click anywhere, or press any key, to unlock sound - watch the message at the top change
  once you do.
- Press 1, 2, or 3 (or tap the matching button) to play a short blip at a low, normal, or
  high pitch. The "Last pitch" row shows which one you played.
- Click near the top of the screen for a loud pop, or near the bottom for a quiet one.
  Click near the left or right edge to hear it pan toward that speaker (headphones or
  stereo speakers make this easiest to hear).
- Press the backquote key (`) or click the small icon in the bottom-left corner to open
  the engine overlay. Play a few sounds and watch the main, music, and sfx bars move, and
  the "voices" readout count the sounds playing at once.

*/

import { AudioClip, bootstrap, BT, Rect2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').Vector2i} Vector2i */

// How many ticks the click flash stays lit. A tick is one fixed update; at the default 60
// ticks per second, 12 ticks is about 200 ms.
const FLASH_TICKS = 12;

// The three pitch-preset buttons and the pitch each one plays the blip at. 1.0 is the
// sound's natural pitch; smaller numbers sound lower and slower, bigger numbers higher
// and faster. `label` is the button text (it doubles as the keyboard hint) and `code` is
// the bound key.
const KEY_PITCH_PRESETS = [
    { code: 'Digit1', label: '1 - Low (0.75x)', pitch: 0.75 },
    { code: 'Digit2', label: '2 - Normal (1.00x)', pitch: 1.0 },
    { code: 'Digit3', label: '3 - High (1.50x)', pitch: 1.5 },
];

// All pitch buttons share one width so the left panel reads as a tidy keypad.
const PITCH_BUTTON_W = 120;

// A click at the very top of the screen plays the pop at POINTER_VOLUME_MAX, a click at
// the very bottom at POINTER_VOLUME_MIN. Everything in between fades smoothly.
const POINTER_VOLUME_MAX = 1.0;
const POINTER_VOLUME_MIN = 0.2;

// A click at the left edge pans fully left (-1), a click at the right edge fully right
// (+1).
const POINTER_PAN_MIN = -1;
const POINTER_PAN_MAX = 1;

// Half the width of the small square ring drawn where you last clicked, in pixels. The
// ring reaches this far out from the click point on every side.
const CLICK_MARKER_HALF_SIZE = 6;

// Keeps `value` from going below `min` or above `max`.
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Two sound effects - a blip for the pitch buttons and a pop for clicks - plus the "click
// to enable sound" prompt every browser makes necessary.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    theme = null;

    // Short blip sound played by the pitch buttons.
    /** @type {AudioClip | null} */
    blipClip = null;

    // Short pop sound played by clicking.
    /** @type {AudioClip | null} */
    popClip = null;

    // Pitch of the most recently played blip, or null before the first press.
    /** @type {number | null} */
    lastKeyPitch = null;

    // Flash countdown, in ticks, for the click marker and the pointer panel's volume
    // meter.
    pointerFlashTimer = 0;

    // Where the pointer was the last time it was clicked.
    /** @type {Vector2i | null} */
    lastClickPos = null;

    // Volume used for the most recent pop.
    /** @type {number | null} */
    lastClickVolume = null;

    // Pan used for the most recent pop.
    /** @type {number | null} */
    lastClickPan = null;

    // Turns on the engine's built-in audio meters in the overlay.
    configure() {
        return {
            // Live per-bus level bars and a voices/steal/drop readout in the overlay. Off
            // by default.
            isOverlayAudioMetersEnabled: true,
        };
    }

    // Loads the two sound clips and sets up the palette.
    async init() {
        // AudioClip.load() downloads a sound file and decodes it into a ready-to-play
        // buffer. That works right away, even before the page is unlocked for sound -
        // only actually hearing a sound (BT.soundPlay, below) waits for that first click.
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

    // Runs the UI kit's once-per-tick housekeeping, then reads pointer clicks.
    //
    // The pitch keys (1/2/3) are bound to the buttons declared in render() via their
    // { key } option. ui.tick() is where the kit safely catches those presses - keyboard
    // "was it just pressed?" flags can only be read reliably here in update(), never in
    // render() (keyboard-input explains why in detail).
    update() {
        ui.tick();

        // BT.BTN_POINTER_A is the primary click (left mouse button, or a touchscreen
        // tap). BT.isPressed fires only once, on the tick the click happens - the same
        // way pointer-basics and pointer-paint read their clicks.
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

    // Clears the screen and declares the whole UI: the unlock/status message, the click
    // marker, and the two info panels along the bottom edge.
    render() {
        BT.clear(this.theme.bg);

        // The click marker is scene drawing, not a widget - draw it first so the panels
        // always sit on top of it.
        this.renderClickMarker();

        this.renderStatusLine();
        this.renderKeyboardPanel();
        this.renderPointerPanel();
    }

    // The status line in the top-left corner: the shared unlock reminder until audio is
    // unlocked, then a plain reminder of the controls. A borderless group - just one line
    // of text, no panel around it.
    renderStatusLine() {
        ui.begin(UI_ANCHORS.TOP_LEFT);

        // The shared "click to enable sound" row - it draws itself only while sound is
        // still locked, and disappears on its own after the first click or key press.
        ui.audioUnlockHint();

        // Once sound works, swap in a short reminder of what to try instead.
        if (BT.isAudioUnlocked) {
            ui.label('Tap a button for a blip. Click anywhere for a pop.', { color: 'dim' });
        }

        ui.end();
    }

    // Draws a small square ring where you last clicked, only while its flash is active.
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

    // Left-hand panel: one button per pitch preset, plus the pitch last played. Each
    // button fires on click, tap, or its number key - ui.button() treats all three the
    // same, which is what makes this demo playable on a touchscreen.
    renderKeyboardPanel() {
        ui.begin(UI_ANCHORS.BOTTOM_LEFT);
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

    // Right-hand panel: the volume and pan of the most recent click. The volume gets a
    // meter bar that fills left-to-right (and flashes green right after a click); the pan
    // is a plain number row, since -1 means left, 0 center, and +1 right.
    renderPointerPanel() {
        const hasClicked = this.lastClickVolume !== null && this.lastClickPan !== null;
        const flashing = this.pointerFlashTimer > 0;

        ui.begin(UI_ANCHORS.BOTTOM_RIGHT);
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

    // Plays the pop sound with a volume and pan taken from where the click landed, and
    // remembers everything the pointer panel and click marker show. `pos` is the click
    // position in display pixels.
    playPopAt(pos) {
        const screen = BT.displaySize;

        // Turn the click's vertical position into a fraction: 0 at the very top of the
        // screen, 1 at the very bottom.
        const verticalFraction = clamp(pos.y / screen.y, 0, 1);

        // Loud at the top, quiet at the bottom, so we count down from the maximum.
        const volume = POINTER_VOLUME_MAX - verticalFraction * (POINTER_VOLUME_MAX - POINTER_VOLUME_MIN);

        // Turn the click's horizontal position into a fraction: 0 at the left edge of the
        // screen, 1 at the right edge, then stretch it out to the -1..+1 range
        // BT.soundPlay expects for pan.
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
