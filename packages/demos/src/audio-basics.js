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

The engine overlay is open from the start: white bars along the top with live audio level
meters, and a hint bar along the bottom. Between them, one centered line of text reads
"Click or press a key to enable sound" in warm orange until you click or press a key;
after that it turns into a dim reminder: "Tap a button for a blip. Click the pad for a
pop."

Two panels of the same height sit side by side under that line. "Keyboard SFX (pitch)" on
the left has three buttons, "1 - Low (0.75x)", "2 - Normal (1.00x)", and "3 - High
(1.50x)", plus a "Last pitch" row. "Pointer SFX (volume/pan)" on the right holds a dark
pad labeled "Loud" at the top, "Quiet" at the bottom, and "L" and "R" on the sides, with a
faint cross through its middle. Under the pad are a "Volume" row with a meter bar and a
"Pan" row.

Press and hold inside the pad and the pop starts repeating. Drag around and it follows
you: up is louder, down is quieter, left and right move it between the speakers. A note
glyph marks where the sound sits, with a green square ring around it while you hold, and
the volume meter lights up green. Let go and the sound fades out; the note stays behind in
amber.

WHAT YOU WILL LEARN
-------------------

- AudioClip.load(url) downloads a sound file and decodes it into a ready-to-play clip. It
  works before sound is unlocked - only hearing a sound has to wait.
- BT.soundPlay(clip, { pitch }) plays a clip faster or slower than recorded.
- BT.soundPlay(clip, { loop: true }) keeps a clip repeating, and returns a handle for that
  one sound.
- BT.soundVolumeSet(handle, volume) and BT.soundPanSet(handle, pan) change a sound while
  it plays; BT.soundStop(handle, { fadeOutMs }) fades it out and stops it.
- BT.isAudioUnlocked reports whether the first click or key press has happened yet.
- BT.isPressed(BT.BTN_POINTER_A, 0) catches the moment a press starts, BT.isDown(...) is
  true for as long as it is held, and BT.pointerPos(0) says where the pointer is.
- Turning a screen position into a number in a range: clamp it into the pad, turn it into
  a fraction from 0 to 1, then stretch that over the range you want.
- isOverlayAudioMetersEnabled: true adds live bus level bars to the engine overlay, and
  overlayStyle / overlayAudioMeterStyle pick its colors from the palette.

WHY DOES SOUND WAIT FOR A CLICK?
--------------------------------

Every web browser refuses to make any sound at all until you click, tap, or press a key on
the page. This is called the "autoplay policy", and it exists so a page you just opened
cannot suddenly blast noise at you. The engine listens for that first gesture and unlocks
its audio for the rest of the session; BT.isAudioUnlocked flips to true once it has.

Not every audio call waits the same way. A sound played with BT.soundPlay() before the
unlock is simply dropped (the overlay's "drop" counter goes up by one). The pad waits,
and starts the looping pop on the first tick after unlock while the button is still
held. Music started with BT.musicPlay() is remembered and starts the instant sound
unlocks - the Music demo shows that. Volume and mute changes are kept too, and apply as
soon as sound unlocks.

PITCH, VOLUME, AND PAN
----------------------

- pitch: how fast the sound plays back. 1 is the recorded speed; 1.5 sounds faster and
  higher, like speeding up a cassette tape, and 0.75 sounds slower and deeper.
- volume: how loud the sound is, from 0 (silent) to 1 (full volume).
- pan: which speaker the sound favors, from -1 (only the left speaker) through 0
  (centered) to +1 (only the right speaker).

Here the pointer's spot in the pad picks the numbers: the top of the pad is volume 1.0 and
the bottom is 0.2, the left edge is pan -1 and the right edge is pan +1.

TRY THIS
--------

- Click anywhere, or press any key, to unlock sound - watch the line under the overlay
  change once you do.
- Press 1, 2, or 3 (or tap the matching button) to play a short blip at a low, normal, or
  high pitch. The "Last pitch" row shows which one you played.
- Press and hold near the top of the pad for a loud pop, then drag down and listen to it
  get quieter. Drag left and right to hear it move between the speakers (headphones or
  stereo speakers make this easiest to hear).
- Watch the overlay while the pop repeats: the main and sfx level bars bounce, and the
  "voices" readout counts the sounds playing at once. Press the backquote key (`) or click
  the small icon in the bottom-left corner to hide or show the overlay.

*/

import { AudioClip, bootstrap, BT, Rect2i, Vector2i } from 'blit386';

import { applyTheme, FONT_W, THEME_OVERLAY_AUDIO_METER_STYLE, THEME_OVERLAY_STYLE, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SoundRef} SoundRef */

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

// Screen layout, in display pixels. The engine overlay is open from the start: its bars
// cover the top 56 rows and its hint bar the bottom 14, so everything sits in the band
// between them. The status line comes first, then two panels side by side, equally tall.
const STATUS_Y = 64;
const PANEL_Y = 76;
const LEFT_PANEL_X = 4;
const LEFT_PANEL_W = 140;
const RIGHT_PANEL_X = 148;
const RIGHT_PANEL_W = 168;

// Panel metrics from the UI kit: content starts 22 pixels below a panel's top edge
// (under its title) and 9 pixels in from its left edge, and is 20 pixels narrower than
// the panel.
const PANEL_CONTENT_TOP = 22;
const PANEL_CONTENT_X = 9;
const PANEL_CONTENT_SHRINK = 20;

// The pad inside the right panel: a dark box you press and hold to play the pop. Where
// the pointer sits inside it picks the volume (top to bottom) and the pan (left to
// right).
const PAD_H = 74;
const PAD_RECT = new Rect2i(
    RIGHT_PANEL_X + PANEL_CONTENT_X,
    PANEL_Y + PANEL_CONTENT_TOP,
    RIGHT_PANEL_W - PANEL_CONTENT_SHRINK,
    PAD_H,
);

// Gap between the pad and the rows under it.
const PAD_GAP = 4;

// Empty space between the pad's border and its edge labels, and between a label and the
// end of the center cross line pointing at it.
const PAD_LABEL_GAP = 5;
const PAD_CROSS_GAP = 3;

// A system-font capital is 5 pixels wide and 7 tall.
const GLYPH_W = 5;
const GLYPH_H = 7;

// The left panel's rows are shorter than the right panel's, so this much empty space
// before its "Last pitch" row makes both panels end on the same line.
const LEFT_PANEL_FILLER = 6;

// A click at the top of the pad plays the pop at POINTER_VOLUME_MAX, a click at the
// bottom at POINTER_VOLUME_MIN. Everything in between fades smoothly.
const POINTER_VOLUME_MAX = 1.0;
const POINTER_VOLUME_MIN = 0.2;

// A click at the pad's left edge pans fully left (-1), a click at its right edge fully
// right (+1).
const POINTER_PAN_MIN = -1;
const POINTER_PAN_MAX = 1;

// Half the width of the small square ring drawn where you last clicked, in pixels. The
// ring reaches this far out from the click point on every side.
const CLICK_MARKER_HALF_SIZE = 6;

// The system font's eighth-note glyph marks where the sound sits in the pad.
const NOTE_GLYPH = '\u266A';

// How quickly the looping pop fades out after you let go, in milliseconds. Stopping it
// instantly can click.
const RELEASE_FADE_MS = 40;

// Keeps `value` from going below `min` or above `max`.
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// The x to print `text` at so its letters are centered on column `centerX`. The last
// character's empty spacing column is left out, so the visible letters are what centers.
function centeredTextX(centerX, text) {
    return centerX - Math.floor((text.length * FONT_W - 1) / 2);
}

// Two sound effects - a blip for the pitch buttons and a pop for the pad - plus the
// "click to enable sound" prompt every browser makes necessary.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    theme = null;

    // Short blip sound played by the pitch buttons.
    /** @type {AudioClip | null} */
    blipClip = null;

    // Short pop sound played by clicking the pad.
    /** @type {AudioClip | null} */
    popClip = null;

    // Pitch of the most recently played blip, or null before the first press.
    /** @type {number | null} */
    lastKeyPitch = null;

    // Flash countdown, in ticks, for the click ring and the pointer panel's volume meter.
    // It is held full while the pad is pressed, so both stay lit until you let go.
    pointerFlashTimer = 0;

    // Set when the pad was pressed before audio finished unlocking. The loop starts
    // on a later tick if the button is still held once BT.isAudioUnlocked is true.
    isPadStartPending = false;

    // Handle of the looping pop while the pad is held down, or null when nothing plays.
    // BT.soundPlay() returns it; BT.soundVolumeSet(), BT.soundPanSet(), and
    // BT.soundStop() take it to change or stop that one sound.
    /** @type {SoundRef | null} */
    padSound = null;

    // Where the sound sits in the pad: the last pointer position, kept inside the pad.
    /** @type {Vector2i | null} */
    lastClickPos = null;

    // Volume used for the most recent pop.
    /** @type {number | null} */
    lastClickVolume = null;

    // Pan used for the most recent pop.
    /** @type {number | null} */
    lastClickPan = null;

    // Opens the engine overlay with its audio meters, colored from the shared UI theme.
    configure() {
        return {
            // Live per-bus level bars and a voices/steal/drop readout in the overlay. Off
            // by default.
            isOverlayAudioMetersEnabled: true,
            isOverlayVisibleAtStart: true,

            // The overlay's default colors live in palette slots 1 and 2, which this demo
            // never fills - they would draw solid black. These two shared styles point
            // the bars, text, and meters at the theme's colors instead.
            overlayStyle: THEME_OVERLAY_STYLE,
            overlayAudioMeterStyle: THEME_OVERLAY_AUDIO_METER_STYLE,
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
        // background color and draw the pad and click marker in theme colors.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        return true;
    }

    // Runs the UI kit's once-per-tick housekeeping, then starts, moves, or stops the
    // pad's looping pop.
    //
    // The pitch keys (1/2/3) are bound to the buttons declared in render() via their
    // { key } option. ui.tick() is where the kit safely catches those presses - keyboard
    // "was it just pressed?" flags can only be read reliably here in update(), never in
    // render() (keyboard-input explains why in detail).
    update() {
        ui.tick();

        // BT.BTN_POINTER_A is the primary click (left mouse button, or a touchscreen
        // tap). BT.isPressed fires only once, on the tick the press happens; BT.isDown
        // stays true for as long as the button is held.
        const pos = BT.pointerPos(0);

        // A press inside the pad starts the looping pop once sound is unlocked. The
        // click that unlocks the page still sees BT.isAudioUnlocked as false, because
        // AudioContext.resume() finishes a moment later. Remember the press and start
        // the loop on the first later tick where the unlock has landed and the button
        // is still held. A press anywhere still unlocks sound; the engine listens for
        // that on its own.
        const pressed = BT.isPressed(BT.BTN_POINTER_A, 0);
        const held = BT.isDown(BT.BTN_POINTER_A, 0);

        if (pressed && PAD_RECT.isContainingXY(pos.x, pos.y)) {
            if (BT.isAudioUnlocked) {
                this.isPadStartPending = false;
                this.startPadSound(pos);
            } else {
                this.isPadStartPending = true;
            }
        } else if (this.isPadStartPending && !held) {
            this.isPadStartPending = false;
        } else if (this.isPadStartPending && BT.isAudioUnlocked) {
            this.isPadStartPending = false;
            this.startPadSound(pos);
        } else if (this.padSound !== null) {
            if (BT.isDown(BT.BTN_POINTER_A, 0)) {
                // Still held: the sound follows the pointer, even outside the pad.
                this.movePadSound(pos);
            } else {
                // Let go: fade the loop out and forget its handle.
                BT.soundStop(this.padSound, { fadeOutMs: RELEASE_FADE_MS });
                this.padSound = null;
            }
        }

        // Count the click flash down toward zero, one tick at a time.
        if (this.pointerFlashTimer > 0) {
            this.pointerFlashTimer -= 1;
        }
    }

    // Clears the screen and declares the whole UI: the status line, then the two panels
    // and the pad drawn on top of the right one.
    render() {
        BT.clear(this.theme.bg);

        this.renderStatusLine();
        this.renderKeyboardPanel();
        this.renderPointerPanel();
        this.renderPad();
    }

    // One centered line just under the overlay bars: the shared unlock reminder in warm
    // orange until sound is unlocked, then a dim reminder of the controls.
    renderStatusLine() {
        const isLocked = !BT.isAudioUnlocked;
        const text = isLocked
            ? 'Click or press a key to enable sound'
            : 'Tap a button for a blip. Click the pad for a pop.';

        const x = centeredTextX(Math.floor(BT.displaySize.x / 2), text);

        ui.caption(x, STATUS_Y, text, { color: isLocked ? 'warm' : 'dim' });
    }

    // Left-hand panel: one button per pitch preset, plus the pitch last played. Each
    // button fires on click, tap, or its number key - ui.button() treats all three the
    // same, which is what makes this demo playable on a touchscreen.
    renderKeyboardPanel() {
        ui.begin('topLeft', { x: LEFT_PANEL_X, y: PANEL_Y, width: LEFT_PANEL_W });
        ui.panel('Keyboard SFX (pitch)');
        ui.label('Keys 1, 2, 3 or tap', { color: 'dim' });
        ui.spacer(4);

        for (const preset of KEY_PITCH_PRESETS) {
            if (ui.button(preset.label, { key: preset.code, width: PITCH_BUTTON_W })) {
                // Play the blip at this preset's speed and remember it for the row below.
                BT.soundPlay(this.blipClip, { pitch: preset.pitch });
                this.lastKeyPitch = preset.pitch;
            }
        }

        const lastPitchLabel = this.lastKeyPitch === null ? '-' : `${this.lastKeyPitch.toFixed(2)}x`;

        ui.spacer(LEFT_PANEL_FILLER);
        ui.kv('Last pitch', lastPitchLabel);
        ui.end();
    }

    // Right-hand panel: room for the pad, then the volume and pan of the most recent pop.
    // The volume gets a meter bar that fills left-to-right (and flashes green right after
    // a click); the pan is a plain number row, since -1 means left, 0 center, and +1
    // right.
    renderPointerPanel() {
        const hasClicked = this.lastClickVolume !== null && this.lastClickPan !== null;
        const flashing = this.pointerFlashTimer > 0;

        ui.begin('topLeft', { x: RIGHT_PANEL_X, y: PANEL_Y, width: RIGHT_PANEL_W });
        ui.panel('Pointer SFX (volume/pan)');

        // An empty row as tall as the pad: renderPad() paints the pad into this gap after
        // the panel is drawn, so it lands on top.
        ui.spacer(PAD_H + PAD_GAP);

        // Volume row plus a read-only bar showing the same value ('-' before any click).
        ui.kv('Volume', hasClicked ? this.lastClickVolume.toFixed(2) : '-');
        ui.meter(null, hasClicked ? this.lastClickVolume : 0, {
            color: flashing ? 'accent' : 'info',
            width: PAD_RECT.width,
        });

        // Pan as a signed number: -1.00 is fully left, 0.00 centered, +1.00 fully right.
        const panSign = hasClicked && this.lastClickPan > 0 ? '+' : '';

        ui.kv('Pan', hasClicked ? `${panSign}${this.lastClickPan.toFixed(2)}` : '-');
        ui.end();
    }

    // The pad: a dark box with its four edges labeled with what they do to the
    // sound, a faint center cross between the labels, and a marker where you last
    // clicked. The ui.draw* helpers draw in call order like the panel itself, so the pad
    // lands on top of the panel.
    renderPad() {
        const { x, y, width, height } = PAD_RECT;
        const right = x + width - 1;
        const bottom = y + height - 1;
        const midX = x + Math.floor(width / 2);
        const midY = y + Math.floor(height / 2);

        ui.drawRectFill(PAD_RECT, this.theme.shadow);
        ui.drawRect(PAD_RECT, this.theme.border);

        // Where each edge label's letters start and end, PAD_LABEL_GAP inside the border.
        const labelTop = y + 1 + PAD_LABEL_GAP;
        const labelBottom = bottom - 1 - PAD_LABEL_GAP;
        const labelLeft = x + 1 + PAD_LABEL_GAP;
        const labelRight = right - 1 - PAD_LABEL_GAP;

        // A caption's capitals start 1 pixel above the y it is placed at, so each y below
        // is the letters' top row plus 1. The Q of "Quiet" hangs its tail below that.
        const sideLabelY = midY - Math.floor(GLYPH_H / 2) + 1;

        ui.caption(centeredTextX(midX, 'Loud'), labelTop + 1, 'Loud', { color: 'dim' });
        ui.caption(centeredTextX(midX, 'Quiet'), labelBottom - GLYPH_H + 2, 'Quiet', { color: 'dim' });
        ui.caption(labelLeft, sideLabelY, 'L', { color: 'dim' });
        ui.caption(labelRight - GLYPH_W + 1, sideLabelY, 'R', { color: 'dim' });

        // Center cross, stopping short of the labels: the middle row is half volume, the
        // middle column centered pan.
        const crossLeft = labelLeft + GLYPH_W + PAD_CROSS_GAP;
        const crossRight = labelRight - GLYPH_W - PAD_CROSS_GAP;
        const crossTop = labelTop + GLYPH_H + PAD_CROSS_GAP;
        const crossBottom = labelBottom - GLYPH_H - PAD_CROSS_GAP;

        ui.drawRectFill(new Rect2i(crossLeft, midY, crossRight - crossLeft + 1, 1), this.theme.panel);
        ui.drawRectFill(new Rect2i(midX, crossTop, 1, crossBottom - crossTop + 1), this.theme.panel);

        this.renderClickMarker();
    }

    // Marks where the sound sits: a note glyph that stays after you let go, plus a square
    // ring that stays lit while the pad is held and for FLASH_TICKS after. Both are kept
    // inside the pad.
    renderClickMarker() {
        if (this.lastClickPos === null) {
            return;
        }

        const { x, y } = this.lastClickPos;
        const isLit = this.pointerFlashTimer > 0;

        // Center the 5x7 glyph on the spot, without letting it poke out of the pad. A
        // caption's letters start 1 pixel above its y.
        const glyphX = clamp(x - Math.floor(GLYPH_W / 2), PAD_RECT.x + 1, PAD_RECT.x + PAD_RECT.width - 1 - GLYPH_W);
        const glyphTop = clamp(y - Math.floor(GLYPH_H / 2), PAD_RECT.y + 1, PAD_RECT.y + PAD_RECT.height - 1 - GLYPH_H);

        ui.caption(glyphX, glyphTop + 1, NOTE_GLYPH, { color: isLit ? 'accent' : 'header' });

        if (!isLit) {
            return;
        }

        const size = CLICK_MARKER_HALF_SIZE * 2 + 1;
        const left = clamp(x - CLICK_MARKER_HALF_SIZE, PAD_RECT.x, PAD_RECT.x + PAD_RECT.width - size);
        const top = clamp(y - CLICK_MARKER_HALF_SIZE, PAD_RECT.y, PAD_RECT.y + PAD_RECT.height - size);

        ui.drawRect(new Rect2i(left, top, size, size), this.theme.accent);
    }

    // Starts the pop looping at the pressed spot. `pos` is the pointer in display pixels.
    startPadSound(pos) {
        this.padSound = BT.soundPlay(this.popClip, { loop: true });
        this.movePadSound(pos);
    }

    // Turns a pointer position into a volume and a pan, hands both to the looping pop,
    // and remembers everything the pointer panel and the marker show. `pos` is the
    // pointer in display pixels; it may be outside the pad while you drag, so it is
    // clamped in.
    movePadSound(pos) {
        const x = clamp(pos.x, PAD_RECT.x, PAD_RECT.x + PAD_RECT.width - 1);
        const y = clamp(pos.y, PAD_RECT.y, PAD_RECT.y + PAD_RECT.height - 1);

        // Turn the vertical position into a fraction: 0 at the top of the pad, 1 at the
        // bottom.
        const verticalFraction = (y - PAD_RECT.y) / (PAD_RECT.height - 1);

        // Loud at the top, quiet at the bottom, so we count down from the maximum.
        const volume = POINTER_VOLUME_MAX - verticalFraction * (POINTER_VOLUME_MAX - POINTER_VOLUME_MIN);

        // Turn the horizontal position into a fraction: 0 at the pad's left edge, 1 at
        // its right edge, then stretch it out to the -1..+1 range the pan expects.
        const horizontalFraction = (x - PAD_RECT.x) / (PAD_RECT.width - 1);
        const pan = POINTER_PAN_MIN + horizontalFraction * (POINTER_PAN_MAX - POINTER_PAN_MIN);

        // Change the sound that is already playing instead of starting a new one.
        BT.soundVolumeSet(this.padSound, volume);
        BT.soundPanSet(this.padSound, pan);

        this.lastClickPos = new Vector2i(x, y);
        this.lastClickVolume = volume;
        this.lastClickPan = pan;
        this.pointerFlashTimer = FLASH_TICKS;
    }
}

bootstrap(Demo);
