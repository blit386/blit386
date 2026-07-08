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
 * Drag any of the three bars below to change that bus's volume with BT.audioVolumeSet().
 * Click a Mute button to silence a bus with BT.audioMuteSet() - notice the number next to
 * "Vol" does not change when you mute; muting hides the volume, it does not erase it.
 * BT.audioVolumeGet() and BT.isAudioMuted() read those two things back separately.
 *
 * The Alert button plays a short sound effect while "ducking" (temporarily lowering) the
 * music bus's volume so the alert is easy to hear over the background music, then fades the
 * music back up afterward - the same trick movies and games use so an important sound is
 * never buried under the soundtrack.
 *
 * Click or press a key to unlock sound first (see 036-Audio Basics for why browsers require
 * that first click).
 */

// @pageTitle BLIT386 Demo 038 - Audio Buses

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
const C_BAR_FILL = 7;
const C_BAR_FILL_MUTED = 8;
const C_BUTTON = 9;
const C_BUTTON_ACTIVE = 10;

// How many ticks a button stays highlighted after being pressed (60 ticks = 1 second).
const FLASH_TICKS = 12;

// Volume slider bar geometry, shared by all three bus rows.
const BAR_X = 70;
const BAR_W = 180;
const BAR_H = 14;
const BAR_Y_OFFSET = 14;

// Mute button geometry, positioned just to the right of each bar.
const MUTE_X = BAR_X + BAR_W + 10;
const MUTE_W = 46;
const MUTE_H = 18;
const MUTE_Y_OFFSET = 11;

// One row per bus: its label, its top Y position, and the keyboard shortcut that toggles
// its mute button. The bar and mute rectangles are computed once below.
const BUS_ROWS = [
    { bus: 'main', label: 'Main', y: 40, muteKeyCode: 'KeyQ' },
    { bus: 'music', label: 'Music', y: 88, muteKeyCode: 'KeyW' },
    { bus: 'sfx', label: 'Sfx', y: 136, muteKeyCode: 'KeyE' },
].map((row) => ({
    ...row,
    barRect: new Rect2i(BAR_X, row.y + BAR_Y_OFFSET, BAR_W, BAR_H),
    muteRect: new Rect2i(MUTE_X, row.y + MUTE_Y_OFFSET, MUTE_W, MUTE_H),
}));

// The Alert button sits on the same 48px row grid as the three bus rows above it.
const ALERT_BUTTON_RECT = new Rect2i(16, 184, 140, 28);
const ALERT_STATUS_Y = ALERT_BUTTON_RECT.y + ALERT_BUTTON_RECT.height + 10;

// Ducking behavior: how far the music bus dips, how quickly it dips and recovers, and how
// long it stays dipped before recovering.
const DUCK_VOLUME_FACTOR = 0.25;
const DUCK_FADE_MS = 150;
const DUCK_HOLD_TICKS = 90;
const DUCK_RECOVER_FADE_MS = 600;

/**
 * Keeps a number from going below `min` or above `max`.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Three volume sliders, three mute toggles, and a ducking alert button.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

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

    /** Ticks remaining to keep the Alert button highlighted after a press. */
    alertFlashTicks = 0;

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
     * Loads the background music and the alert sound, sets up the palette, and starts the
     * music loop.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.musicClip = await AudioClip.load('/audio/music-calm.wav');

        // BT.synthPreset.hit() is one of the six built-in sound recipes 041-Synth Toy
        // explores - a short, punchy stinger, a good fit for an alert.
        this.alertClip = await AudioClip.synth(BT.synthPreset.hit());

        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(18, 22, 38));
        this.palette.set(C_TEXT, new Color32(255, 255, 255));
        this.palette.set(C_DIM, new Color32(130, 140, 160));
        this.palette.set(C_ACCENT, new Color32(255, 140, 90));
        this.palette.set(C_PANEL, new Color32(35, 42, 62));
        this.palette.set(C_PANEL_BORDER, new Color32(90, 98, 120));
        this.palette.set(C_BAR_FILL, new Color32(120, 190, 255));
        this.palette.set(C_BAR_FILL_MUTED, new Color32(90, 100, 120));
        this.palette.set(C_BUTTON, new Color32(50, 60, 85));
        this.palette.set(C_BUTTON_ACTIVE, new Color32(120, 255, 160));

        BT.paletteSet(this.palette);

        BT.musicPlay(this.musicClip, { loop: true });

        return true;
    }

    /**
     * Reads pointer drags, mute clicks/keys, and the alert button, then advances the
     * duck-and-recover countdown.
     *
     * We check for presses/drags here in update(), not in render() - the engine clears "was
     * this just pressed?" flags once per tick, before render() runs (028-keyboard-input
     * explains this in more detail).
     */
    update() {
        this.updateVolumeDrag();
        this.updateMuteToggles();
        this.updateAlertButton();

        if (this.isDucking) {
            this.duckHoldTicksLeft -= 1;

            if (this.duckHoldTicksLeft <= 0) {
                BT.audioVolumeSet('music', this.preDuckMusicVolume, { fadeMs: DUCK_RECOVER_FADE_MS });
                this.isDucking = false;
            }
        }

        if (this.alertFlashTicks > 0) {
            this.alertFlashTicks -= 1;
        }
    }

    /**
     * While the pointer is held down over a bar, sets that bus's volume to match the
     * pointer's horizontal position inside the bar (0 at the left edge, 1 at the right).
     */
    updateVolumeDrag() {
        if (!BT.isPointerActive(0) || !BT.isDown(BT.BTN_POINTER_A, 0)) {
            return;
        }

        const pos = BT.pointerPos(0);

        for (const row of BUS_ROWS) {
            if (!row.barRect.isContaining(pos)) {
                continue;
            }

            const fraction = clamp((pos.x - row.barRect.x) / row.barRect.width, 0, 1);
            BT.audioVolumeSet(row.bus, fraction, { fadeMs: 0 });
        }
    }

    /**
     * Toggles a bus's mute state when its button is clicked or its shortcut key is pressed.
     */
    updateMuteToggles() {
        const pointerPressed = BT.isPressed(BT.BTN_POINTER_A, 0);
        const pointerPos = BT.isPointerActive(0) ? BT.pointerPos(0) : null;

        for (const row of BUS_ROWS) {
            const clicked = pointerPressed && pointerPos !== null && row.muteRect.isContaining(pointerPos);
            const keyPressed = BT.isKeyPressed(row.muteKeyCode);

            if (clicked || keyPressed) {
                BT.audioMuteSet(row.bus, !BT.isAudioMuted(row.bus));
            }
        }
    }

    /**
     * Plays the alert sound and ducks the music bus when the Alert button is clicked or
     * Space is pressed.
     */
    updateAlertButton() {
        // Ignore presses while a duck is already in progress. Without this guard, a rapid
        // re-press would capture the already-ducked volume as the new restore target, so each
        // re-press would multiply the eventual "restored" volume by DUCK_VOLUME_FACTOR again.
        if (this.isDucking) {
            return;
        }

        const pointerPressed = BT.isPressed(BT.BTN_POINTER_A, 0);
        const pointerPos = BT.isPointerActive(0) ? BT.pointerPos(0) : null;
        const clicked = pointerPressed && pointerPos !== null && ALERT_BUTTON_RECT.isContaining(pointerPos);
        const keyPressed = BT.isKeyPressed('Space');

        if (!clicked && !keyPressed) {
            return;
        }

        this.preDuckMusicVolume = BT.audioVolumeGet('music');
        BT.audioVolumeSet('music', this.preDuckMusicVolume * DUCK_VOLUME_FACTOR, { fadeMs: DUCK_FADE_MS });
        BT.soundPlay(this.alertClip);

        this.isDucking = true;
        this.duckHoldTicksLeft = DUCK_HOLD_TICKS;
        this.alertFlashTicks = FLASH_TICKS;
    }

    /**
     * Clears the screen and draws the HUD, the three bus rows, and the alert button.
     */
    render() {
        BT.clear(C_BG);

        this.renderHUD();

        for (const row of BUS_ROWS) {
            this.renderBusRow(row);
        }

        this.renderAlertButton();
    }

    /**
     * Top status strip with the demo title.
     */
    renderHUD() {
        BT.drawRectFill(new Rect2i(0, 0, DISPLAY_W, HUD_HEIGHT), C_PANEL);
        BT.drawRect(new Rect2i(0, 0, DISPLAY_W, HUD_HEIGHT), C_PANEL_BORDER);
        BT.systemPrint(new Vector2i(4, 3), C_TEXT, 'Audio Buses - drag to set volume, click Mute to toggle');
    }

    /**
     * Draws one bus row: label, volume bar (filled proportionally to the current volume,
     * dimmer when muted), mute button, and a live "Vol / Muted" readout.
     *
     * @param {{ bus: string, label: string, y: number, barRect: Rect2i, muteRect: Rect2i }} row
     */
    renderBusRow(row) {
        BT.systemPrint(new Vector2i(16, row.y), C_TEXT, row.label);

        const volume = BT.audioVolumeGet(row.bus);
        const muted = BT.isAudioMuted(row.bus);
        const fillW = Math.round(row.barRect.width * clamp(volume, 0, 1));

        BT.drawRect(row.barRect, C_PANEL_BORDER);

        if (fillW > 0) {
            const fillRect = new Rect2i(row.barRect.x, row.barRect.y, fillW, row.barRect.height);
            BT.drawRectFill(fillRect, muted ? C_BAR_FILL_MUTED : C_BAR_FILL);
        }

        BT.drawRectFill(row.muteRect, muted ? C_BUTTON_ACTIVE : C_BUTTON);
        BT.drawRect(row.muteRect, C_PANEL_BORDER);
        BT.systemPrint(new Vector2i(row.muteRect.x + 4, row.muteRect.y + 4), C_TEXT, muted ? 'Muted' : 'Mute');

        BT.systemPrint(new Vector2i(16, row.y + 30), C_DIM, `Vol ${volume.toFixed(2)}  Muted: ${muted ? 'yes' : 'no'}`);
    }

    /**
     * Draws the Alert button and a status line explaining what is currently happening to
     * the music bus.
     */
    renderAlertButton() {
        const flashing = this.alertFlashTicks > 0;

        BT.drawRectFill(ALERT_BUTTON_RECT, flashing ? C_BUTTON_ACTIVE : C_BUTTON);
        BT.drawRect(ALERT_BUTTON_RECT, C_PANEL_BORDER);
        BT.systemPrint(new Vector2i(ALERT_BUTTON_RECT.x + 8, ALERT_BUTTON_RECT.y + 9), C_TEXT, 'Alert (Space)');

        const status = this.getAlertStatus();
        BT.systemPrint(new Vector2i(16, ALERT_STATUS_Y), status.color, status.text);
    }

    /**
     * Picks the status line and its color: the unlock reminder while sound is locked,
     * otherwise whether the music bus is currently ducked.
     *
     * @returns {{ text: string, color: number }}
     */
    getAlertStatus() {
        if (!BT.isAudioUnlocked) {
            return { text: 'Click or press a key to enable sound', color: C_ACCENT };
        }

        if (this.isDucking) {
            return { text: 'Music ducked while the alert plays...', color: C_DIM };
        }

        return { text: 'Music at full volume.', color: C_DIM };
    }
}

bootstrap(Demo);
