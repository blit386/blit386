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

A 320x280 screen in the UI theme's deep navy. A title strip reading "Audio Buses" runs
along the top edge. Below it sits a "Mixer" panel that opens with a dim hint, "drag a
slider, toggle a Mute, try the Alert", followed by three rows of controls - Main, Music,
and Sfx - each with a volume slider and a "Mute (Q)", "Mute (W)", or "Mute (E)" checkbox.

Under a separator line comes an "Alert (Space)" button and, until sound is unlocked, the
orange "Click or press a key to enable sound" prompt. Once sound works that line reads
"Music at full volume." most of the time and "Music ducked while the alert plays..." for
about a second and a half after each alert.

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
  isCapturingKeyboardScroll: true keeps Space from scrolling the page.

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
  back. The status line reads "Music ducked while the alert plays..." while it is dipped.
- Press the backquote key (`) to open the engine overlay and watch the main, music, and
  sfx bars follow the sliders and the duck.

*/

import { AudioClip, bootstrap, BT, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;

// Taller than the default 240 px so the whole mixer panel fits below the title strip.
const DISPLAY_H = 280;

// One entry per bus: which engine bus it controls, the slider label, the keyboard
// shortcut that toggles its mute, and the letter shown in the checkbox label as a hint.
const BUSES = [
    { bus: 'main', label: 'Main', muteKey: 'KeyQ', muteHint: 'Q' },
    { bus: 'music', label: 'Music', muteKey: 'KeyW', muteHint: 'W' },
    { bus: 'sfx', label: 'Sfx', muteKey: 'KeyE', muteHint: 'E' },
];

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

    // Sets the logical display size, turns on the engine's built-in audio meters in the
    // overlay, and keeps the Space key from scrolling the page.
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            // Live per-bus level bars and a voices/steal/drop readout in the overlay. Off
            // by default.
            isOverlayAudioMetersEnabled: true,
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

    // Clears the screen and declares the whole UI: a title bar, then one mixer panel with
    // a slider and a mute checkbox per bus, the alert button, and a status line.
    //
    // With the immediate-mode kit there is no separate "handle input" step for the
    // pointer: ui.slider() and ui.checkbox() return the (possibly changed) value right
    // away, and ui.button() returns true on the frame it was clicked or tapped.
    render() {
        BT.clear(this.theme.bg);

        // Title on the top bar. The instruction lives inside the mixer so the strip stays
        // one line and the full sentence is not clipped at the right edge.
        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel('Audio Buses');
        ui.end();

        // The mixer panel, pinned just below the title strip. Width and height size
        // themselves to the widest row and the number of rows - no layout math here.
        ui.begin(UI_ANCHORS.TOP_LEFT, { y: 26 });
        ui.panel('Mixer');
        ui.label('drag a slider, toggle a Mute, try the Alert', { color: 'dim' });

        for (const row of BUSES) {
            this.renderBusRow(row);
        }

        ui.separator();

        // The button reports a click, a tap, or its Space shortcut - all three the same
        // way.
        if (ui.button('Alert (Space)', { key: 'Space' })) {
            this.triggerAlert();
        }

        // The shared "click to enable sound" row - it draws itself only while sound is
        // still locked, and disappears on its own after the first click or key press.
        ui.audioUnlockHint();

        // Once sound works, report whether the music bus is currently ducked instead.
        if (BT.isAudioUnlocked) {
            ui.label(this.isDucking ? 'Music ducked while the alert plays...' : 'Music at full volume.', {
                color: 'dim',
            });
        }

        ui.end();
    }

    // One bus's controls: a volume slider and a mute checkbox. `row` is a BUSES entry.
    //
    // The engine itself is the single source of truth here - every frame we read the
    // current volume and mute state back from the audio system, show them, and only write
    // a new value when the widget reports a change. That way the UI can never drift out
    // of sync with what the engine is actually doing (for example during the alert duck).
    renderBusRow(row) {
        const volume = BT.audioVolumeGet(row.bus);
        const nextVolume = ui.slider(row.label, volume);

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

        ui.spacer(4);
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
