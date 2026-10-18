/*

Audio Buses: mixer volume sliders, mute toggles, and a music-ducking alert.
@description Mixer buses: drag main, music, and sfx sliders, mute without losing the level, and duck for an alert.
@ogScale integer

Part of the BLIT386 demo series.

Prerequisites:
  - Audio Basics: https://demos.blit386.dev/audio-basics
  - Music: https://demos.blit386.dev/music

Live version: https://demos.blit386.dev/audio-buses

Guides:
  - Audio: https://blit386.dev/docs/guides/audio#playing-sfx

Reference:
  - Audio: https://blit386.dev/docs/api/audio#volume
  - Overlay: https://blit386.dev/docs/api/overlay#audio-meters-optional

---

WHAT YOU WILL SEE
-----------------

A 320x260 screen in the UI theme's deep navy. The engine overlay is open from the start:
white bars along the top with live audio level meters, and a hint bar along the bottom.
Between them, one centered line of text reads "Click or press a key to enable sound" in
warm orange until you click or press a key; after that it turns into a dim reminder:
"Drag a slider, toggle a Mute, try the Alert."

Under that line sit three bus panels side by side - "Main", "Music", and "Sfx". Each says
what the bus carries here ("All sound", "The loop", "The alert"), then has a "Volume"
slider and a "Mute (Q)", "Mute (W)", or "Mute (E)" checkbox.

Below them, the "Alert" panel has one button, and the wider "Ducking" panel shows whether
the music is ducked ("not ducked" or "ducked to 25%"), the volume it will come back to,
and an amber "Hold" bar that drains while the duck lasts.

A calm music loop starts on its own the moment sound is unlocked.

WHAT YOU WILL LEARN
-------------------

- Every sound flows through one of three buses before it reaches your speakers: 'main',
  'music', and 'sfx'. A bus is like a volume knob for a whole category of sound.
- BT.audioVolumeSet(bus, volume, { fadeMs }) changes a bus's volume, instantly or with a
  fade, and BT.audioVolumeGet(bus) reads it back.
- BT.audioMuteSet(bus, muted) silences a bus without touching its volume, and
  BT.isAudioMuted(bus) reads the mute state back.
- Ducking: dip the music bus while a sound effect plays, hold, then fade it back up.
- Reading engine state back every frame (instead of keeping a copy) so the sliders and
  checkboxes can never drift out of sync with what the engine is doing.
- AudioClip.synth(BT.synthPreset.hit()) makes a sound effect from a recipe, with no file.
- isOverlayAudioMetersEnabled: true adds live bus level bars to the engine overlay, and
  overlayStyle / overlayAudioMeterStyle pick its colors from the palette.
- isCapturingKeyboardScroll: true keeps Space from scrolling the page.

HOW DUCKING WORKS
-----------------

Movies and games lower the soundtrack for a moment so an important sound is never buried
under the music. The Alert button does the same thing in four steps:

  1. Remember the music bus's current volume.
  2. Fade the music bus down to a quarter of that (DUCK_VOLUME_FACTOR 0.25) over 150 ms
     and play the alert sound through the sfx bus.
  3. Hold for 90 ticks - a tick is one fixed update, so at 60 ticks per second that is
     1.5 seconds. update() counts the ticks down.
  4. Fade the music bus back to the remembered volume over 600 ms.

While the music is ducked, pressing Alert again does nothing, and dragging the Music
slider replaces the remembered volume, so the music comes back to where you left the
slider.

TRY THIS
--------

- Click anywhere, or press any key, to unlock sound. The calm music loop starts by itself.
- Drag a slider with the mouse or a finger. Main changes everything at once; Music changes
  only the loop; Sfx changes only the alert sound.
- Tap a Mute checkbox, or press Q (Main), W (Music), or E (Sfx). The slider next to it
  does not move - muting hides the volume, it does not erase it. Unmute and the level is
  back.
- Click Alert, or press Space, and listen to the music dip under the alert and then swell
  back. The Music slider drops to a quarter, the Ducking panel says "ducked to 25%", and
  the Hold bar drains until the music starts coming back.
- Drag the Music slider while the music is ducked: the "Restore" value follows it, and the
  music comes back to that level instead.
- Watch the overlay's main, music, and sfx level bars follow the sliders and the duck.
  Press the backquote key (`) or click the small icon in the bottom-left corner to hide or
  show the overlay.

*/

import { AudioClip, bootstrap, BT, Vector2i } from 'blit386';

import { applyTheme, FONT_W, THEME_OVERLAY_AUDIO_METER_STYLE, THEME_OVERLAY_STYLE, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;

// Taller than the default 240 px, so the mixer and the ducking panels both fit between
// the overlay's bars.
const DISPLAY_H = 260;

// One entry per bus: which engine bus it controls, its panel title, what it carries in
// this demo, the keyboard shortcut that toggles its mute, and the letter shown in the
// checkbox label as a hint.
const BUSES = [
    { bus: 'main', label: 'Main', carries: 'All sound', muteKey: 'KeyQ', muteHint: 'Q' },
    { bus: 'music', label: 'Music', carries: 'The loop', muteKey: 'KeyW', muteHint: 'W' },
    { bus: 'sfx', label: 'Sfx', carries: 'The alert', muteKey: 'KeyE', muteHint: 'E' },
];

// Screen layout, in display pixels. The engine overlay is open from the start: its bars
// cover the top 56 rows and its hint bar the bottom 14, so everything sits in the band
// between them. The status line comes first, then a row of three bus panels, then the
// alert and ducking panels lined up under them.
const STATUS_Y = 64;
const MARGIN_X = 4;
const PANEL_GAP = 6;
const BUS_PANEL_W = 100;
const BUS_ROW_Y = 76;
const BUS_PANEL_H = 81;
const DUCK_ROW_Y = BUS_ROW_Y + BUS_PANEL_H + PANEL_GAP;

// The ducking panel spans the last two columns.
const DUCK_PANEL_X = MARGIN_X + BUS_PANEL_W + PANEL_GAP;
const DUCK_PANEL_W = 2 * BUS_PANEL_W + PANEL_GAP;

// Widgets inside a panel are this wide: the panel minus the kit's 10-pixel text inset on
// each side.
const PANEL_TEXT_INSET = 10;
const BUS_CONTENT_W = BUS_PANEL_W - 2 * PANEL_TEXT_INSET;
const DUCK_CONTENT_W = DUCK_PANEL_W - 2 * PANEL_TEXT_INSET;

// The ducking panel's value column starts after this many characters, so the longest key,
// "Restore", keeps a space after it.
const DUCK_KV_COLS = 9;

// The alert panel's rows are shorter than the ducking panel's, so this much empty space
// at its bottom makes both panels end on the same line.
const ALERT_PANEL_FILLER = 2;

// Ducking behavior: how far the music bus dips, how quickly it dips, how long it stays
// dipped (in ticks - 90 ticks is 1.5 seconds at 60 ticks per second), and how slowly it
// recovers.
const DUCK_VOLUME_FACTOR = 0.25;
const DUCK_FADE_MS = 150;
const DUCK_HOLD_TICKS = 90;
const DUCK_RECOVER_FADE_MS = 600;

// Three volume sliders, three mute toggles, and a ducking alert button.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    theme = null;

    /** @type {AudioClip | null} */
    musicClip = null;

    /** @type {AudioClip | null} */
    alertClip = null;

    // Whether the music bus is currently ducked because of a recent alert.
    isDucking = false;

    // Ticks remaining before a ducked music bus starts recovering.
    duckHoldTicksLeft = 0;

    // Music bus volume captured right before the most recent duck, so it can be restored.
    preDuckMusicVolume = 1;

    // Sets the logical display size, opens the overlay with its audio meters colored from
    // the shared UI theme, and keeps the Space key from scrolling the page.
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            isOverlayVisibleAtStart: true,

            // Live per-bus level bars and a voices/steal/drop readout in the overlay. Off
            // by default.
            isOverlayAudioMetersEnabled: true,

            // The overlay's default colors live in palette slots 1 and 2, which this demo
            // never fills - they would draw solid black. These two shared styles point
            // the bars, text, and meters at the theme's colors instead.
            overlayStyle: THEME_OVERLAY_STYLE,
            overlayAudioMeterStyle: THEME_OVERLAY_AUDIO_METER_STYLE,

            // Space is the Alert shortcut - keep the page from scrolling when it is
            // pressed.
            isCapturingKeyboardScroll: true,
        };
    }

    // Loads the background music, builds the alert sound, sets up the shared UI theme,
    // and starts the music loop.
    async init() {
        this.musicClip = await AudioClip.load('/audio/music-calm.wav');

        // BT.synthPreset.hit() is one of the six built-in sound recipes Synth Toy
        // explores - a short, punchy stinger, a good fit for an alert. AudioClip.synth()
        // turns the recipe into a playable clip without downloading any file.
        this.alertClip = await AudioClip.synth(BT.synthPreset.hit());

        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors (into high palette slots, far
        // from any scene colors) and hands back where they landed, so render() can clear
        // the screen with the theme's background color.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Music started before the page is unlocked is remembered and begins the instant
        // you click or press a key - unlike BT.soundPlay(), which drops sounds played too
        // early.
        BT.musicPlay(this.musicClip, { loop: true });

        return true;
    }

    // Advances the duck-and-recover countdown.
    //
    // ui.tick() must run first: it is the kit's once-per-tick housekeeping that (among
    // other things) safely catches the keyboard shortcuts bound to the widgets in
    // render(). Keyboard presses can only be read reliably here in update(), never in
    // render() - keyboard-input explains why in detail.
    update() {
        ui.tick();

        // While ducked, count the hold down one tick at a time. When it reaches zero,
        // fade the music bus back up to the remembered volume and end the duck.
        if (this.isDucking) {
            this.duckHoldTicksLeft -= 1;

            if (this.duckHoldTicksLeft <= 0) {
                BT.audioVolumeSet('music', this.preDuckMusicVolume, { fadeMs: DUCK_RECOVER_FADE_MS });
                this.isDucking = false;
            }
        }
    }

    // Clears the screen and declares the whole UI: the status line, one panel per bus
    // with a volume slider and a mute checkbox, then the alert button and the ducking
    // readout.
    //
    // With the immediate-mode kit there is no separate "handle input" step for the
    // pointer: ui.slider() and ui.checkbox() return the (possibly changed) value right
    // away, and ui.button() returns true on the frame it was clicked or tapped.
    render() {
        BT.clear(this.theme.bg);

        this.renderStatusLine();

        // The alert panel goes first even though it sits lower on screen: its button may
        // duck the music this very frame, and the Music slider drawn after it should
        // already show the dip.
        this.renderAlertPanel();

        BUSES.forEach((row, column) => {
            this.renderBusPanel(row, MARGIN_X + column * (BUS_PANEL_W + PANEL_GAP));
        });

        this.renderDuckPanel();
    }

    // One centered line just under the overlay bars: the shared unlock reminder in warm
    // orange until sound is unlocked, then a dim reminder of what to try.
    renderStatusLine() {
        const isLocked = !BT.isAudioUnlocked;
        const text = isLocked ? 'Click or press a key to enable sound' : 'Drag a slider, toggle a Mute, try the Alert.';

        // FONT_W is the width of one character; the last one's empty spacing column is
        // left out, so the visible letters are what gets centered.
        const x = Math.floor(DISPLAY_W / 2) - Math.floor((text.length * FONT_W - 1) / 2);

        ui.caption(x, STATUS_Y, text, { color: isLocked ? 'warm' : 'dim' });
    }

    // One bus's panel at column `x`: what the bus carries, a volume slider, and a mute
    // checkbox. `row` is a BUSES entry.
    //
    // The engine itself is the single source of truth here - every frame we read the
    // current volume and mute state back from the audio system, show them, and only write
    // a new value when the widget reports a change. That way the UI can never drift out
    // of sync with what the engine is actually doing (for example during the alert duck).
    renderBusPanel(row, x) {
        ui.begin('topLeft', { x, y: BUS_ROW_Y, width: BUS_PANEL_W });
        ui.panel(row.label);
        ui.label(row.carries, { color: 'dim' });
        ui.spacer(4);

        // All three sliders are labeled "Volume", so each gets its bus name as its
        // identity - the kit tells widgets apart by that, not by what they show.
        const volume = BT.audioVolumeGet(row.bus);
        const nextVolume = ui.slider('Volume', volume, { id: row.bus, width: BUS_CONTENT_W });

        // The slider returns the dragged value. A different number means the user moved
        // it, so push the new volume to the engine right away, with no fade.
        if (nextVolume !== volume) {
            BT.audioVolumeSet(row.bus, nextVolume, { fadeMs: 0 });

            // While music is ducked, remember the user's latest Music slider value so
            // update() restores that level (not the pre-duck capture) when the hold ends.
            if (row.bus === 'music' && this.isDucking) {
                this.preDuckMusicVolume = nextVolume;
            }
        }

        const muted = BT.isAudioMuted(row.bus);
        const nextMuted = ui.checkbox(`Mute (${row.muteHint})`, muted, { key: row.muteKey });

        // Same idea for the checkbox: a changed value means a click, tap, or key press.
        if (nextMuted !== muted) {
            BT.audioMuteSet(row.bus, nextMuted);
        }

        ui.end();
    }

    // The alert panel under the Main column: one button that plays the alert and ducks
    // the music. It reports a click, a tap, or its Space shortcut - all three the same
    // way.
    renderAlertPanel() {
        ui.begin('topLeft', { x: MARGIN_X, y: DUCK_ROW_Y, width: BUS_PANEL_W });
        ui.panel('Alert');
        ui.label('Space or tap', { color: 'dim' });
        ui.spacer(4);

        if (ui.button('Alert', { key: 'Space', width: BUS_CONTENT_W })) {
            this.triggerAlert();
        }

        ui.spacer(ALERT_PANEL_FILLER);
        ui.end();
    }

    // The ducking panel under the Music and Sfx columns: whether the music is ducked, the
    // volume it will come back to, and how much of the hold is left.
    renderDuckPanel() {
        const holdLeft = this.isDucking ? this.duckHoldTicksLeft / DUCK_HOLD_TICKS : 0;
        const state = this.isDucking ? `ducked to ${Math.round(DUCK_VOLUME_FACTOR * 100)}%` : 'not ducked';

        ui.begin('topLeft', { x: DUCK_PANEL_X, y: DUCK_ROW_Y, width: DUCK_PANEL_W, kvCols: DUCK_KV_COLS });
        ui.panel('Ducking');
        ui.kv('Music', state);
        ui.kv('Restore', this.preDuckMusicVolume.toFixed(2));
        ui.meter('Hold', holdLeft, { color: 'header', width: DUCK_CONTENT_W });
        ui.end();
    }

    // Plays the alert sound and ducks the music bus.
    triggerAlert() {
        // Ignore presses while a duck is already in progress. Without this guard, a rapid
        // re-press would capture the already-ducked volume as the new restore target, so
        // each re-press would multiply the eventual "restored" volume by
        // DUCK_VOLUME_FACTOR again.
        if (this.isDucking) {
            return;
        }

        // Remember where the music was, dip it to a quarter of that over 150 ms, and fire
        // the alert sound through the sfx bus.
        this.preDuckMusicVolume = BT.audioVolumeGet('music');
        BT.audioVolumeSet('music', this.preDuckMusicVolume * DUCK_VOLUME_FACTOR, { fadeMs: DUCK_FADE_MS });
        BT.soundPlay(this.alertClip);

        this.isDucking = true;
        this.duckHoldTicksLeft = DUCK_HOLD_TICKS;
    }
}

bootstrap(Demo);
