/**
 * Audio Buses Demo - mixer volume sliders, mute toggles, and a music-ducking alert.
 *
 * Demo 038 in the BLIT386 demo series.
 * Prerequisites:
 *   036-Audio Basics  https://demos.blit386.dev/036-audio-basics
 *   037-Music         https://demos.blit386.dev/037-music
 *
 * Live version: https://demos.blit386.dev/038-audio-buses
 *
 * Every sound in the engine flows through one of three "buses" before it reaches your
 * speakers: `main`, `music`, and `sfx`. Think of a bus like a volume knob that affects a
 * whole category of sound at once - turning down `music` fades every music track without
 * touching sound effects, and turning down `main` fades everything together.
 *
 * Drag any of the three sliders below (mouse or finger - the whole UI is touch-friendly) to
 * change that bus's volume with BT.audioVolumeSet(). Tap a Mute checkbox to silence a bus
 * with BT.audioMuteSet() - notice the slider value does not change when you mute; muting
 * hides the volume, it does not erase it. BT.audioVolumeGet() and BT.isAudioMuted() read
 * those two things back separately.
 *
 * The Alert button plays a short sound effect while "ducking" (temporarily lowering) the
 * music bus's volume so the alert is easy to hear over the background music, then fades the
 * music back up afterward - the same trick movies and games use so an important sound is
 * never buried under the soundtrack.
 *
 * The panels, sliders, checkboxes, and the button all come from the shared UI kit in
 * src/shared/ui.js - the same look every demo in this series uses. The kit works
 * "immediate-mode" style: render() simply declares the widgets it wants each frame, and the
 * kit draws them and answers clicks and taps on the spot.
 *
 * Click or press a key to unlock sound first (see 036-Audio Basics for why browsers require
 * that first click).
 */

import { AudioClip, bootstrap, BT, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;
const DISPLAY_H = 240;

// One entry per bus: which engine bus it controls, the slider label, the keyboard shortcut
// that toggles its mute, and the letter shown in the checkbox label as a hint.
const BUSES = [
    { bus: 'main', label: 'Main', muteKey: 'KeyQ', muteHint: 'Q' },
    { bus: 'music', label: 'Music', muteKey: 'KeyW', muteHint: 'W' },
    { bus: 'sfx', label: 'Sfx', muteKey: 'KeyE', muteHint: 'E' },
];

// Ducking behavior: how far the music bus dips, how quickly it dips and recovers, and how
// long it stays dipped before recovering.
const DUCK_VOLUME_FACTOR = 0.25;
const DUCK_FADE_MS = 150;
const DUCK_HOLD_TICKS = 90;
const DUCK_RECOVER_FADE_MS = 600;

/**
 * Three volume sliders, three mute toggles, and a ducking alert button.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    /** Palette slots of the shared UI theme colors, filled by applyTheme() in init(). */
    theme = null;

    /** @type {AudioClip | null} */
    musicClip = null;

    /** @type {AudioClip | null} */
    alertClip = null;

    /** Whether the music bus is currently ducked because of a recent alert. */
    isDucking = false;

    /** Ticks remaining before a ducked music bus starts recovering. */
    duckHoldTicksLeft = 0;

    /** Music bus volume captured right before the most recent duck, so it can be restored. */
    preDuckMusicVolume = 1;

    /**
     * Sets the logical display size and turns on the engine's built-in audio meters in
     * the overlay.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            // Live per-bus level meters and a voice-count readout in the overlay (off by default).
            isOverlayAudioMetersEnabled: true,
        };
    }

    /**
     * Loads the background music and the alert sound, sets up the shared UI theme, and
     * starts the music loop.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.musicClip = await AudioClip.load('/audio/music-calm.wav');

        // BT.synthPreset.hit() is one of the six built-in sound recipes 041-Synth Toy
        // explores - a short, punchy stinger, a good fit for an alert.
        this.alertClip = await AudioClip.synth(BT.synthPreset.hit());

        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors (into high palette slots, far
        // from any scene colors) and hands back where they landed, so render() can clear
        // the screen with the theme's background color.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Music started before the page is unlocked is "remembered" and begins the
        // instant you click or press a key - unlike BT.soundPlay(), which drops sounds
        // played too early.
        BT.musicPlay(this.musicClip, { loop: true });

        return true;
    }

    /**
     * Advances the duck-and-recover countdown.
     *
     * ui.tick() must run first: it is the kit's once-per-tick housekeeping that (among
     * other things) safely catches the keyboard shortcuts bound to the widgets below.
     * Keyboard presses can only be read reliably here in update(), never in render() -
     * 028-keyboard-input explains why in detail.
     */
    update() {
        ui.tick();

        if (this.isDucking) {
            this.duckHoldTicksLeft -= 1;

            if (this.duckHoldTicksLeft <= 0) {
                BT.audioVolumeSet('music', this.preDuckMusicVolume, { fadeMs: DUCK_RECOVER_FADE_MS });
                this.isDucking = false;
            }
        }
    }

    /**
     * Clears the screen and declares the whole UI: a title bar, then one mixer panel with
     * a slider + mute checkbox per bus, the alert button, and a status line.
     *
     * With the immediate-mode kit there is no separate "handle input" step for the pointer:
     * ui.slider() and ui.checkbox() return the (possibly changed) value right away, and
     * ui.button() returns true on the frame it was clicked or tapped.
     */
    render() {
        BT.clear(this.theme.bg);

        // The full-width title strip along the top edge.
        ui.begin('topBar');
        ui.panel('Audio Buses - drag a slider, toggle a Mute, try the Alert');
        ui.end();

        // The mixer panel, pinned just below the title strip. Width and height size
        // themselves to the widest row and the number of rows - no layout math here.
        ui.begin('topLeft', { y: 30 });
        ui.panel('Mixer');

        for (const row of BUSES) {
            this.renderBusRow(row);
        }

        ui.separator();

        // The button reports a click, a tap, or its Space shortcut - all three the same way.
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

    /**
     * One bus's controls: a volume slider and a mute checkbox.
     *
     * The engine itself is the single source of truth here - every frame we read the
     * current volume and mute state back from the audio system, show them, and only write
     * a new value when the widget reports a change. That way the UI can never drift out of
     * sync with what the engine is actually doing (for example during the alert duck).
     *
     * @param {{ bus: string, label: string, muteKey: string, muteHint: string }} row
     */
    renderBusRow(row) {
        const volume = BT.audioVolumeGet(row.bus);
        const nextVolume = ui.slider(row.label, volume);

        if (nextVolume !== volume) {
            BT.audioVolumeSet(row.bus, nextVolume, { fadeMs: 0 });
        }

        const muted = BT.isAudioMuted(row.bus);
        const nextMuted = ui.checkbox(`Mute (${row.muteHint})`, muted, { key: row.muteKey });

        if (nextMuted !== muted) {
            BT.audioMuteSet(row.bus, nextMuted);
        }

        ui.spacer(4);
    }

    /**
     * Plays the alert sound and ducks the music bus.
     */
    triggerAlert() {
        // Ignore presses while a duck is already in progress. Without this guard, a rapid
        // re-press would capture the already-ducked volume as the new restore target, so each
        // re-press would multiply the eventual "restored" volume by DUCK_VOLUME_FACTOR again.
        if (this.isDucking) {
            return;
        }

        this.preDuckMusicVolume = BT.audioVolumeGet('music');
        BT.audioVolumeSet('music', this.preDuckMusicVolume * DUCK_VOLUME_FACTOR, { fadeMs: DUCK_FADE_MS });
        BT.soundPlay(this.alertClip);

        this.isDucking = true;
        this.duckHoldTicksLeft = DUCK_HOLD_TICKS;
    }
}

bootstrap(Demo);
