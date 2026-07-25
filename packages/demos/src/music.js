// @pageTitle BLIT386 Demo 037 - Music Playback

/**
 * Music Demo - crossfading between two tracks and playing one with a seamless loop point.
 *
 * Demo 037 in the BLIT386 demo series.
 * Prerequisites:
 *   036-Audio Basics  https://demos.blit386.dev/036-audio-basics
 *
 * Live version: https://demos.blit386.dev/037-music
 *
 * Sound effects (036, 041) are short one-shot clips: press a key, hear a blip, done. Music
 * is different - it is meant to loop forever in the background, and switching from one
 * track to another should not just cut off with a click. BT.musicPlay() handles both of
 * those jobs for you.
 *
 * This page has three buttons, each backed by a different AudioClip:
 * - Track A and Track B swap between two looping tunes. Each swap uses a different
 *   "crossfade" - a fade-out of the old track happening alongside (or after) a fade-in of
 *   the new one, so the music blends instead of jumping. Switching to Track A lets the old
 *   track fade all the way out first, waits a moment, then fades Track A in. Switching to
 *   Track B overlaps the two fades so they happen at the same time. Listen for the
 *   difference - one has a small silent gap in the middle, the other does not.
 * - Loop Demo plays a track that starts with a short intro passage, then loops forever from
 *   a chosen point onward - the intro only ever plays once, exactly like the opening jingle
 *   of a real game level that then settles into its main tune.
 *
 * The title strip, track buttons, and status readout all come from the shared UI kit in
 * src/shared/ui.js - the same look every demo in this series uses, and it is fully
 * touch-friendly: tap a button with a finger, click it with a mouse, or press its number
 * key, and the kit reports all three the same way.
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

// These two numbers come straight out of public/audio/music-intro-loop.loop.json, generated
// by scripts/generate-audio-loops.mjs. They mark where the short intro ends and the
// repeating loop section begins/ends inside that one audio file.
const INTRO_LOOP_START_SECONDS = 1.5;
const INTRO_LOOP_END_SECONDS = 7.9;

// Fading to Track A: the old track fades all the way out first, then - after a short silent
// gap - Track A fades in. `overlap: -1` is what creates that gap.
const PROFILE_TO_A = { fadeMs: 800, overlap: -1, easeIn: 'linear', easeOut: 'linear' };

// Fading to Track B: the new track fades in at the same time as the old one fades out
// (`overlap: 1`), and both fades use an "ease-in-out" curve so the volume change starts and
// ends gently instead of at a constant speed the whole way through.
const PROFILE_TO_B = { fadeMs: 1200, overlap: 1, easeIn: 'ease-in-out', easeOut: 'ease-in-out' };

// Fading into the loop-point track: a plain, fairly quick overlapping crossfade.
const PROFILE_TO_LOOP = { fadeMs: 600, overlap: 1, easeIn: 'linear', easeOut: 'linear' };

// One entry per track button: which track it plays, its on-screen name, and the keyboard
// shortcut the kit binds to the button (`keyCode` is the raw key name, `keyHint` is the
// friendly character shown in the button label).
const TRACKS = [
    { trackId: 'A', label: 'Track A - calm', keyCode: 'Digit1', keyHint: '1' },
    { trackId: 'B', label: 'Track B - upbeat', keyCode: 'Digit2', keyHint: '2' },
    { trackId: 'loop', label: 'Loop Demo - intro + loop', keyCode: 'Digit3', keyHint: '3' },
];

/**
 * Three buttons, each starting a different music track with a different crossfade profile.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    /** Palette slots of the shared UI theme colors, filled by applyTheme() in init(). */
    theme = null;

    /** @type {AudioClip | null} */
    calmClip = null;

    /** @type {AudioClip | null} */
    upbeatClip = null;

    /** @type {AudioClip | null} */
    introLoopClip = null;

    /** @type {string | null} Which button's track is currently playing ('A', 'B', 'loop', or null before the first play). */
    activeTrackId = null;

    /** @type {string} Human-readable description of the crossfade profile last used, shown on screen. */
    activeProfileLabel = '-';

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
     * Loads all three music clips, sets up the shared UI theme, and starts Track A playing.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.calmClip = await AudioClip.load('/audio/music-calm.wav');
        this.upbeatClip = await AudioClip.load('/audio/music-upbeat.wav');
        this.introLoopClip = await AudioClip.load('/audio/music-intro-loop.wav');

        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors (into high palette slots, far
        // from any scene colors) and hands back where they landed, so render() can clear
        // the screen with the theme's background color.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Start with Track A playing so there is always music, even before you press
        // anything. BT.musicPlay() called before the page is unlocked is "remembered" and
        // starts for real the instant you click or press a key - unlike BT.soundPlay(),
        // which drops sounds played too early.
        this.playTrack('A');

        return true;
    }

    /**
     * Once-per-tick housekeeping for the UI kit.
     *
     * ui.tick() is what safely catches the number-key shortcuts bound to the buttons in
     * render(). Keyboard presses can only be read reliably here in update(), never in
     * render() - the engine clears "was this just pressed?" flags once per tick, and that
     * tick always finishes before this frame's render() runs (028-keyboard-input explains
     * this in more detail). The kit latches the presses now so the buttons can answer
     * later, during render().
     */
    update() {
        ui.tick();
    }

    /**
     * Clears the screen and declares the whole UI: a title strip, one button per track,
     * and the status readout.
     *
     * With the immediate-mode kit there is no separate "handle input" step: ui.button()
     * returns true on the frame it was clicked, tapped, or its number key was pressed, so
     * the track switch happens right where the button is declared.
     */
    render() {
        BT.clear(this.theme.bg);

        // The full-width title strip along the top edge.
        ui.begin('topBar');
        ui.panel('Music Playback - Crossfade and Loop Points');
        ui.end();

        // The track panel, pinned just below the title strip. Width and height size
        // themselves to the widest row and the number of rows - no layout math here.
        ui.begin('topLeft', { y: 30 });
        ui.panel('Tracks');

        // One button per track. Each label ends with its keyboard hint, and the kit binds
        // the matching key so pressing it acts exactly like a click or a tap.
        for (const track of TRACKS) {
            if (ui.button(`${track.label} (${track.keyHint})`, { key: track.keyCode })) {
                this.playTrack(track.trackId);
            }
        }

        ui.separator();
        this.renderStatus();
        ui.end();
    }

    /**
     * Status rows inside the track panel: the unlock prompt (until sound is unlocked),
     * then the currently playing track, its crossfade profile, and - only for the loop
     * track - the loop boundaries in seconds.
     */
    renderStatus() {
        // The shared "click to enable sound" row - it draws itself only while sound is
        // still locked, and disappears on its own after the first click or key press.
        ui.audioUnlockHint();

        // Until sound is unlocked there is nothing worth reporting yet, so the readout
        // rows below wait for that first click or key press too.
        if (!BT.isAudioUnlocked) {
            return;
        }

        // Look up the friendly name of whichever track is active. Array.find() walks the
        // list and returns the first entry the test function says yes to (or undefined if
        // none matches - which here only happens before the first play).
        const active = TRACKS.find((track) => track.trackId === this.activeTrackId);

        ui.kv('Playing', active ? active.label : '-');
        ui.kv('Fade', this.activeProfileLabel);

        if (this.activeTrackId === 'loop') {
            ui.kv('Loop', `${INTRO_LOOP_START_SECONDS}s - ${INTRO_LOOP_END_SECONDS}s (intro once)`);
        }
    }

    /**
     * Starts the given track with its matching crossfade profile, unless it is already
     * playing (pressing the same button twice does nothing new).
     *
     * @param {string} trackId - 'A', 'B', or 'loop'.
     */
    playTrack(trackId) {
        if (trackId === this.activeTrackId) {
            return;
        }

        if (trackId === 'A') {
            BT.musicPlay(this.calmClip, { volume: 1, loop: true, ...PROFILE_TO_A });
            this.activeProfileLabel = 'out, gap, in (800ms)';
        } else if (trackId === 'B') {
            BT.musicPlay(this.upbeatClip, { volume: 1, loop: true, ...PROFILE_TO_B });
            this.activeProfileLabel = 'out + in together (1200ms)';
        } else {
            BT.musicPlay(this.introLoopClip, {
                volume: 1,
                loopStart: INTRO_LOOP_START_SECONDS,
                loopEnd: INTRO_LOOP_END_SECONDS,
                ...PROFILE_TO_LOOP,
            });
            this.activeProfileLabel = 'quick overlap (600ms)';
        }

        this.activeTrackId = trackId;
    }
}

bootstrap(Demo);
