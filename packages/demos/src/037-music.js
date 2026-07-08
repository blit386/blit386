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
 * Click or press a key to unlock sound first (see 036-Audio Basics for why browsers require
 * that first click).
 */

import { AudioClip, bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;
const DISPLAY_H = 240;

const HUD_HEIGHT = 22;

// Palette slots. Index 0 is always transparent.
const C_BG = 1;
const C_TEXT = 2;
const C_DIM = 3;
const C_ACCENT = 4;
const C_PANEL = 5;
const C_PANEL_BORDER = 6;
const C_BUTTON = 7;
const C_BUTTON_ACTIVE = 8;

// Button layout: three stacked buttons on the left half of the screen.
const BUTTON_X = 16;
const BUTTON_W = 220;
const BUTTON_H = 28;
const BUTTON_START_Y = 40;
const BUTTON_GAP = 36;

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

// One entry per button: which track it plays, its label, its keyboard shortcut, and where it
// is drawn on screen.
const BUTTONS = [
    {
        trackId: 'A',
        label: 'Track A (calm)',
        keyCode: 'Digit1',
        rect: new Rect2i(BUTTON_X, BUTTON_START_Y, BUTTON_W, BUTTON_H),
    },
    {
        trackId: 'B',
        label: 'Track B (upbeat)',
        keyCode: 'Digit2',
        rect: new Rect2i(BUTTON_X, BUTTON_START_Y + BUTTON_GAP, BUTTON_W, BUTTON_H),
    },
    {
        trackId: 'loop',
        label: 'Loop Demo (intro + loop)',
        keyCode: 'Digit3',
        rect: new Rect2i(BUTTON_X, BUTTON_START_Y + BUTTON_GAP * 2, BUTTON_W, BUTTON_H),
    },
];

/**
 * Three buttons, each starting a different music track with a different crossfade profile.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

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
     * Turns on the engine's built-in audio meters in the overlay.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            // Adds live bar-graph meters (main/music/sfx bus levels) plus a voice-count
            // readout to the overlay. Off by default, since measuring audio levels costs a
            // little extra CPU work the engine skips unless a demo asks for it.
            isOverlayAudioMetersEnabled: true,
        };
    }

    /**
     * Loads all three music clips, sets up the palette, and starts Track A playing.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.calmClip = await AudioClip.load('/audio/music-calm.wav');
        this.upbeatClip = await AudioClip.load('/audio/music-upbeat.wav');
        this.introLoopClip = await AudioClip.load('/audio/music-intro-loop.wav');

        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(18, 22, 38));
        this.palette.set(C_TEXT, new Color32(255, 255, 255));
        this.palette.set(C_DIM, new Color32(130, 140, 160));
        this.palette.set(C_ACCENT, new Color32(255, 140, 90));
        this.palette.set(C_PANEL, new Color32(35, 42, 62));
        this.palette.set(C_PANEL_BORDER, new Color32(90, 98, 120));
        this.palette.set(C_BUTTON, new Color32(50, 60, 85));
        this.palette.set(C_BUTTON_ACTIVE, new Color32(120, 255, 160));

        BT.paletteSet(this.palette);

        // Start with Track A playing so there is always music, even before you press
        // anything. BT.musicPlay() called before the page is unlocked is "remembered" and
        // starts for real the instant you click or press a key - unlike BT.soundPlay(),
        // which drops sounds played too early.
        this.playTrack('A');

        return true;
    }

    /**
     * Reads button clicks and keyboard shortcuts, and swaps tracks in response.
     *
     * We check for presses here in update(), not in render(). The engine clears "was this
     * just pressed?" flags once per tick, and that tick always finishes before this frame's
     * render() runs - checking in render() instead would randomly miss fast taps
     * (028-keyboard-input explains this in more detail).
     */
    update() {
        const pointerDown = BT.isPressed(BT.BTN_POINTER_A, 0);
        const pointerPos = BT.isPointerActive(0) ? BT.pointerPos(0) : null;

        for (const button of BUTTONS) {
            const clicked = pointerDown && pointerPos !== null && button.rect.isContaining(pointerPos);
            const keyPressed = BT.isKeyPressed(button.keyCode);

            if (clicked || keyPressed) {
                this.playTrack(button.trackId);
            }
        }
    }

    /**
     * Clears the screen and draws the HUD, buttons, and status text.
     */
    render() {
        BT.clear(C_BG);

        this.renderHUD();
        this.renderButtons();
        this.renderStatus();
    }

    /**
     * Top status strip with the demo title.
     */
    renderHUD() {
        BT.drawRectFill(new Rect2i(0, 0, DISPLAY_W, HUD_HEIGHT), C_PANEL);
        BT.drawRect(new Rect2i(0, 0, DISPLAY_W, HUD_HEIGHT), C_PANEL_BORDER);
        BT.systemPrint(new Vector2i(4, 3), C_TEXT, 'Music Playback - Crossfade and Loop Points');
    }

    /**
     * Draws each button, highlighting whichever track is currently active.
     */
    renderButtons() {
        for (const button of BUTTONS) {
            const active = button.trackId === this.activeTrackId;

            BT.drawRectFill(button.rect, active ? C_BUTTON_ACTIVE : C_BUTTON);
            BT.drawRect(button.rect, C_PANEL_BORDER);
            BT.systemPrint(new Vector2i(button.rect.x + 8, button.rect.y + 7), active ? C_BG : C_TEXT, button.label);
        }
    }

    /**
     * Shows the unlock prompt (until sound is unlocked), then the currently playing track,
     * its crossfade profile, and - only for the loop track - the loop boundaries in seconds.
     */
    renderStatus() {
        const statusY = BUTTON_START_Y + BUTTON_GAP * 2 + BUTTON_H + 16;

        if (!BT.isAudioUnlocked) {
            BT.systemPrint(new Vector2i(BUTTON_X, statusY), C_ACCENT, 'Click or press a key to enable sound');
            return;
        }

        const trackNames = { A: 'Track A (calm)', B: 'Track B (upbeat)', loop: 'Loop Demo (intro + loop)' };
        const nowPlaying = this.activeTrackId === null ? '-' : trackNames[this.activeTrackId];

        BT.systemPrint(new Vector2i(BUTTON_X, statusY), C_DIM, `Now playing: ${nowPlaying}`);
        BT.systemPrint(new Vector2i(BUTTON_X, statusY + 14), C_DIM, `Crossfade: ${this.activeProfileLabel}`);

        if (this.activeTrackId === 'loop') {
            BT.systemPrint(
                new Vector2i(BUTTON_X, statusY + 28),
                C_DIM,
                `Loop region: ${INTRO_LOOP_START_SECONDS}s - ${INTRO_LOOP_END_SECONDS}s (intro plays once)`,
            );
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
            this.activeProfileLabel = 'fade out, gap, fade in (800ms, no overlap)';
        } else if (trackId === 'B') {
            BT.musicPlay(this.upbeatClip, { volume: 1, loop: true, ...PROFILE_TO_B });
            this.activeProfileLabel = 'fade out and fade in together (1200ms, full overlap)';
        } else {
            BT.musicPlay(this.introLoopClip, {
                volume: 1,
                loopStart: INTRO_LOOP_START_SECONDS,
                loopEnd: INTRO_LOOP_END_SECONDS,
                ...PROFILE_TO_LOOP,
            });
            this.activeProfileLabel = 'quick overlapping fade (600ms)';
        }

        this.activeTrackId = trackId;
    }
}

bootstrap(Demo);
