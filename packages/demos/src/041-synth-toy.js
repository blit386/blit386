/**
 * Synth Toy Demo - procedural chip-tune sound effects with no audio files at all.
 *
 * Demo 041 in the BLIT386 demo series.
 * Prerequisites:
 *   028-Keyboard Input  https://demos.blit386.dev/028-keyboard-input
 *   036-Audio Basics    https://demos.blit386.dev/036-audio-basics
 *
 * Live version: https://demos.blit386.dev/041-synth-toy
 *
 * Every sound on this page is built from scratch by the computer, the instant you press a
 * key or tap a button - there are no sound files to download. AudioClip.synth() takes a
 * small recipe called SynthParams (a waveform shape, a pitch, a length, and a few optional
 * knobs like an attack/decay/sustain/release envelope, a pitch sweep, and a noise mix) and
 * calculates every single sample of the resulting sound on the spot. BT.synthPreset bundles
 * six of these recipes for common game sounds - jump, pickup, explosion, laser, hit, and a
 * UI blip - tuned by hand so they sound right without you needing to pick every number
 * yourself.
 *
 * The Randomize button goes the other way: instead of a hand-tuned recipe, it rolls a brand
 * new SynthParams object with every field chosen at random, inside safe ranges, and shows
 * you exactly what was rolled in the right-hand panel. Play it a few times and you will
 * hear (and see) how much variety a handful of numbers can produce - from a clean sine
 * "boop" to a noisy sawtooth growl. (The synth engine also supports a vibrato wobble on top
 * of all this - this demo leaves it out to keep the panel small, but it is worth trying
 * yourself.)
 *
 * The panels and buttons come from the shared UI kit in src/shared/ui.js, so every preset
 * works three ways: click it, tap it on a phone, or press its keyboard shortcut.
 *
 * This page unlocks sound the same "click or press a key first" way 036-audio-basics does -
 * browsers refuse to make any sound until you interact with the page at least once.
 *
 * The engine's built-in overlay also shows live audio meters: little bars that move
 * up and down with how loud each audio bus (main, music, sfx) is right now, plus a
 * count of how many sounds are playing at once. This demo turns that feature on with
 * `isOverlayAudioMetersEnabled: true` in configure() - watch the meters jump every time a
 * preset or a randomized sound plays.
 *
 * Try this:
 * - Click anywhere, or press any key, to unlock sound - watch the message at the top change
 *   once you do.
 * - Tap the preset buttons (or press J, P, E, L, H, or B) to hear the jump, pickup,
 *   explosion, laser, hit, and blip presets.
 * - Tap Randomize (or press R) to hear a randomized sound - watch the right-hand panel
 *   update with the waveform, frequency, duration, noise mix, and pitch sweep target that
 *   were rolled.
 * - Randomize again and again - notice how differently the exact same few lines of "roll a
 *   random number" code can make the engine sound each time.
 */

import { AudioClip, bootstrap, BT } from 'blit386';

import { randFloat } from './shared/rand.js';
import { applyTheme, THEME_DEFAULT_START_SLOT, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SynthParams} SynthParams */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */

// The waveform shapes AudioClip.synth() accepts. The engine does not export this list as a
// runtime value (only as a TypeScript type), so we spell it out here ourselves - the
// randomizer picks one of these five names at random for every roll.
const SYNTH_WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];

// One entry per preset. Each `factory` asks BT.synthPreset for a fresh, hand-tuned recipe
// (a SynthParams object) for that sound. `label` is the button text (which doubles as the
// keyboard hint), and `code` is the bound key.
const PRESET_DEFINITIONS = [
    { code: 'KeyJ', label: 'J - Jump', name: 'Jump', factory: () => BT.synthPreset.jump() },
    { code: 'KeyP', label: 'P - Pickup', name: 'Pickup', factory: () => BT.synthPreset.pickup() },
    { code: 'KeyE', label: 'E - Explosion', name: 'Explosion', factory: () => BT.synthPreset.explosion() },
    { code: 'KeyL', label: 'L - Laser', name: 'Laser', factory: () => BT.synthPreset.laser() },
    { code: 'KeyH', label: 'H - Hit', name: 'Hit', factory: () => BT.synthPreset.hit() },
    { code: 'KeyB', label: 'B - Blip', name: 'Blip', factory: () => BT.synthPreset.blip() },
];

// All preset buttons share one width so the left panel reads as a tidy keypad.
const PRESET_BUTTON_W = 96;

// Safe ranges for the randomizer. Every one of these stays inside the bounds
// AudioClip.synth() actually accepts (see blit386's synthValidation.ts): frequencies and
// durations above zero, everything described as a fraction kept between 0 and 1.
const RANDOM_FREQUENCY_MIN_HZ = 80;
const RANDOM_FREQUENCY_MAX_HZ = 1200;
const RANDOM_DURATION_MIN_S = 0.05;
const RANDOM_DURATION_MAX_S = 1.0;
const RANDOM_VOLUME_MIN = 0.8;
const RANDOM_VOLUME_MAX = 1.0;
const RANDOM_ATTACK_MAX_S = 0.1;
const RANDOM_DECAY_MAX_S = 0.3;
const RANDOM_RELEASE_MIN_S = 0.02;
const RANDOM_RELEASE_MAX_S = 0.4;

// A pitch sweep (the sound's pitch gliding from its starting frequency to a new one) is only
// added to the random recipe about half the time, so you get to compare "sweeps" against
// "flat pitch" sounds.
const RANDOM_PITCH_SWEEP_CHANCE = 0.5;
const RANDOM_PITCH_SWEEP_MIN_MULTIPLIER = 0.3;
const RANDOM_PITCH_SWEEP_MAX_MULTIPLIER = 3.0;

// Upper bound for the random seed handed to AudioClip.synth(). This seed only feeds the
// engine's internal noise generator - it is not something we need to remember or reproduce
// here, so any number in this range works.
const RANDOM_SEED_MAX = 1_000_000;

/**
 * Builds a brand new SynthParams recipe with every field chosen at random, inside the safe
 * ranges above. Unlike the six named presets (which only nudge a couple of fields), this
 * touches every knob AudioClip.synth() understands, so pressing Randomize is a tour of the
 * whole parameter space rather than a small variation on one sound.
 *
 * @returns {SynthParams}
 */
function buildRandomSynthParams() {
    const waveform = SYNTH_WAVEFORMS[Math.floor(Math.random() * SYNTH_WAVEFORMS.length)];
    const frequency = randFloat(RANDOM_FREQUENCY_MIN_HZ, RANDOM_FREQUENCY_MAX_HZ);
    const duration = randFloat(RANDOM_DURATION_MIN_S, RANDOM_DURATION_MAX_S);
    const hasPitchSweep = Math.random() < RANDOM_PITCH_SWEEP_CHANCE;

    return {
        waveform,
        frequency,
        duration,
        volume: randFloat(RANDOM_VOLUME_MIN, RANDOM_VOLUME_MAX),
        envelope: {
            attack: randFloat(0, RANDOM_ATTACK_MAX_S),
            decay: randFloat(0, RANDOM_DECAY_MAX_S),
            sustain: Math.random(),
            release: randFloat(RANDOM_RELEASE_MIN_S, RANDOM_RELEASE_MAX_S),
        },
        noiseMix: Math.random(),
        dutyCycle: Math.random(),
        seed: Math.floor(Math.random() * RANDOM_SEED_MAX),
        // Only glide the pitch about half the time, and only when we do, add the field at
        // all - AudioClip.synth() treats a missing pitchSweep as "stay at one pitch."
        ...(hasPitchSweep
            ? {
                  pitchSweep: {
                      toFrequency:
                          frequency * randFloat(RANDOM_PITCH_SWEEP_MIN_MULTIPLIER, RANDOM_PITCH_SWEEP_MAX_MULTIPLIER),
                  },
              }
            : {}),
    };
}

/**
 * Preset button playback plus a "roll the dice" randomizer, both built on AudioClip.synth().
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    /** Palette slots of the shared UI theme colors, filled by applyTheme() in init(). */
    theme = null;

    /** @type {AudioClip[]} Pre-rendered clips, one per PRESET_DEFINITIONS entry. */
    presetClips = [];

    /** @type {number | null} Index into PRESET_DEFINITIONS of the last preset played. */
    lastPresetIndex = null;

    /** @type {SynthParams | null} The most recently rolled random recipe, or null before the first roll. */
    lastRandomParams = null;

    /**
     * Turns on the engine's built-in audio meters, shows the overlay from the very first
     * frame, and styles the overlay so its gaps match the demo's background color.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            // Live per-bus level meters and a voice-count readout in the overlay (explained in the header above).
            isOverlayAudioMetersEnabled: true,

            // Shows the overlay body (title, FPS, backend, and the audio meters above) right
            // from the first frame instead of waiting for a Backquote press or a click in the
            // toggle-hint corner. This demo is all about sound, so the meters should be
            // visible immediately.
            isOverlayVisibleAtStart: true,

            // gapPaletteIndex fills both the thin seams between overlay rows and the empty
            // (unfilled) track behind each audio meter bar, so it must match the screen
            // background or those seams would show up as a mismatched color. The shared UI
            // theme puts its background color at THEME_DEFAULT_START_SLOT (applyTheme()'s
            // default start slot - see init() below); configure() runs before init(), so we
            // reference the constant directly instead of calling applyTheme() early.
            overlayStyle: {
                gapPaletteIndex: THEME_DEFAULT_START_SLOT,
            },
        };
    }

    /**
     * Renders every preset's SynthParams recipe into a ready-to-play clip, so pressing a
     * preset later has zero delay, and installs the shared UI theme.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // AudioClip.synth() is async - it has to calculate every sample before it can hand
        // back a clip. Promise.all() starts all six calculations at once and waits for them
        // all to finish, the same way 036-audio-basics preloads its sound files up front.
        this.presetClips = await Promise.all(PRESET_DEFINITIONS.map((def) => AudioClip.synth(def.factory())));

        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors and reports their slots, so
        // render() can clear the screen with the theme's background color.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Runs the UI kit's once-per-tick housekeeping.
     *
     * The preset keys (J/P/E/L/H/B and R) are bound to the buttons declared in render()
     * via their { key } option. ui.tick() is where the kit safely catches those presses -
     * keyboard "was it just pressed?" flags can only be read reliably here in update(),
     * never in render() (028-keyboard-input explains why in detail).
     */
    update() {
        ui.tick();
    }

    /**
     * Clears the screen and declares the whole UI: title bar, unlock message, the preset
     * keypad on the left, and the randomizer readout on the right.
     */
    render() {
        BT.clear(this.theme.bg);

        // The full-width title strip along the top edge.
        ui.begin('topBar');
        ui.panel('Synth Toy - six presets and a randomizer');
        ui.end();

        this.renderUnlockPrompt();
        this.renderPresetPanel();
        this.renderRandomPanel();
    }

    /**
     * Shows the shared unlock reminder until audio is unlocked, then switches to a plain
     * reminder of the controls. A borderless group - just one line of text pinned under
     * the title strip.
     */
    renderUnlockPrompt() {
        ui.begin('topLeft', { y: 28 });

        // The shared "click to enable sound" row - it draws itself only while sound is
        // still locked, and disappears on its own after the first click or key press.
        ui.audioUnlockHint();

        // Once sound works, swap in a short reminder of the controls instead.
        if (BT.isAudioUnlocked) {
            ui.label('Tap a button, or press its key', { color: 'dim' });
        }

        ui.end();
    }

    /**
     * Left-hand panel: one button per preset, plus the last one played. Each button fires
     * on click, tap, or its keyboard shortcut - ui.button() treats all three the same.
     */
    renderPresetPanel() {
        ui.begin('bottomLeft');
        ui.panel('Presets');

        for (let i = 0; i < PRESET_DEFINITIONS.length; i++) {
            const def = PRESET_DEFINITIONS[i];

            if (ui.button(def.label, { key: def.code, width: PRESET_BUTTON_W })) {
                // Play the pre-rendered clip and remember it for the "Last" row below.
                BT.soundPlay(this.presetClips[i]);
                this.lastPresetIndex = i;
            }
        }

        const lastLabel = this.lastPresetIndex === null ? '-' : PRESET_DEFINITIONS[this.lastPresetIndex].name;

        ui.kv('Last', lastLabel);
        ui.end();
    }

    /**
     * Right-hand panel: the Randomize button and the most recently rolled recipe, one
     * field per row.
     */
    renderRandomPanel() {
        const params = this.lastRandomParams;

        ui.begin('bottomRight');
        ui.panel('Randomizer');

        if (ui.button('R - Randomize', { key: 'KeyR' })) {
            this.triggerRandomize();
        }

        // Each row reports one part of the rolled recipe ('-' before the first roll).
        ui.kv('Waveform', params === null ? '-' : params.waveform);
        ui.kv('Frequency', params === null ? '-' : `${Math.round(params.frequency)} Hz`);
        ui.kv('Duration', params === null ? '-' : `${params.duration.toFixed(2)} s`);

        // Noise mix: how much white noise is mixed into the tone (0 is a pure, clean tone;
        // 1 is pure hiss). The meter bar fills up left-to-right with the amount.
        ui.kv('Noise mix', params === null ? '-' : params.noiseMix.toFixed(2));
        ui.meter(null, params === null ? 0 : params.noiseMix);

        const sweepLabel =
            params === null ? '-' : params.pitchSweep ? `${Math.round(params.pitchSweep.toFrequency)} Hz` : 'none';

        ui.kv('Sweep', sweepLabel);

        // The duty cycle only shapes square waves, so other waveforms show 'n/a'.
        const dutyLabel = params === null ? '-' : params.waveform === 'square' ? params.dutyCycle.toFixed(2) : 'n/a';

        ui.kv('Duty', dutyLabel);
        ui.end();
    }

    /**
     * Rolls a new random SynthParams recipe and starts rendering + playing it.
     *
     * This method itself stays synchronous: it builds the recipe and updates what the panel
     * will show right away, so the numbers on screen always match the most recent press
     * even though the actual sound takes a moment longer to render (see playRandomParams()).
     */
    triggerRandomize() {
        const params = buildRandomSynthParams();

        this.lastRandomParams = params;

        // The kit calls render() synchronously, and this handler cannot be async, so we
        // start the render-and-play and let it run in the background instead of waiting for
        // it. The .catch() just logs a problem instead of crashing the page, as a safety
        // net - it should never actually trigger with the ranges above.
        this.playRandomParams(params).catch((error) => console.error(error));
    }

    /**
     * Renders a SynthParams recipe into a clip and plays it.
     *
     * @param {SynthParams} params - Recipe to render and play.
     * @returns {Promise<void>}
     */
    async playRandomParams(params) {
        const clip = await AudioClip.synth(params);
        BT.soundPlay(clip);
    }
}

bootstrap(Demo);
