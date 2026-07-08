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
 * key - there are no sound files to download. AudioClip.synth() takes a small recipe called
 * SynthParams (a waveform shape, a pitch, a length, and a few optional knobs like an
 * attack/decay/sustain/release envelope, a pitch sweep, and a noise mix) and calculates every
 * single sample of the resulting sound on the spot. BT.synthPreset bundles six of these
 * recipes for common game sounds - jump, pickup, explosion, laser, hit, and a UI blip - tuned
 * by hand so they sound right without you needing to pick every number yourself.
 *
 * The Randomize key goes the other way: instead of a hand-tuned recipe, it rolls a brand new
 * SynthParams object with every field chosen at random, inside safe ranges, and shows you
 * exactly what was rolled in the right-hand panel. Play it a few times and you will hear (and
 * see) how much variety a handful of numbers can produce - from a clean sine "boop" to a noisy
 * sawtooth growl. (The synth engine also supports a vibrato wobble on top of all this - this
 * demo leaves it out to keep the panel small, but it is worth trying yourself.)
 *
 * This page loads sound the same "click or press a key first" way 036-audio-basics does -
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
 * - Press J, P, E, L, H, or B to hear the jump, pickup, explosion, laser, hit, and blip
 *   presets.
 * - Press R to hear a randomized sound - watch the right-hand panel update with the waveform,
 *   frequency, duration, noise mix, and pitch sweep target that were rolled.
 * - Press R again and again - notice how differently the exact same few lines of "roll a
 *   random number" code can make the engine sound each time.
 */

import { AudioClip, bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SynthParams} SynthParams */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */

// Palette indices. Slot 0 stays transparent.
const C_WHITE = 1;
const C_BG = 2;
const C_AMBER = 3;
const C_DIM = 4;
const C_LIT = 5;
const C_PANEL = 6;
const C_PANEL_BORDER = 7;
const C_ACCENT = 8;
const C_METER_FILL = 9;

// How many fixed ticks a key-press flash stays lit before fading back to normal.
// The engine runs 60 ticks per second by default, so 12 ticks is about 200ms.
const FLASH_TICKS = 12;

// The waveform shapes AudioClip.synth() accepts. The engine does not export this list as a
// runtime value (only as a TypeScript type), so we spell it out here ourselves - the
// randomizer picks one of these five names at random for every roll.
const SYNTH_WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];

// One entry per preset key. Each `factory` asks BT.synthPreset for a fresh, hand-tuned recipe
// (a SynthParams object) for that sound - jump, pickup, explosion, laser, hit, or a UI blip.
const PRESET_DEFINITIONS = [
    { code: 'KeyJ', label: 'J', name: 'Jump', factory: () => BT.synthPreset.jump() },
    { code: 'KeyP', label: 'P', name: 'Pickup', factory: () => BT.synthPreset.pickup() },
    { code: 'KeyE', label: 'E', name: 'Explosion', factory: () => BT.synthPreset.explosion() },
    { code: 'KeyL', label: 'L', name: 'Laser', factory: () => BT.synthPreset.laser() },
    { code: 'KeyH', label: 'H', name: 'Hit', factory: () => BT.synthPreset.hit() },
    { code: 'KeyB', label: 'B', name: 'Blip', factory: () => BT.synthPreset.blip() },
];

// Layout for the two side-by-side panels near the bottom of the screen. PANEL_H leaves room
// for every row below plus a couple of pixels of breathing room above the bottom border - the
// last row's text is one full font-cell (14px) tall, so the panel has to extend well past
// where that row starts, not just past where it starts drawing.
const PANEL_Y = 94;
const PANEL_W = 148;
const PANEL_H = 124;
const PANEL_LEFT_X = 8;
const PANEL_RIGHT_X = 164;

// Position of the one-line unlock/controls reminder that sits above both panels.
const UNLOCK_PROMPT_Y = 62;

// Row spacing inside the preset panel: the first row starts this many pixels below the
// panel's top edge, and each following row sits one step further down.
const PRESET_ROW_START_Y = 20;
const PRESET_ROW_STEP = 14;
const PRESET_LAST_LINE_Y = 108;

// Row positions inside the randomizer panel (each line reports one part of the rolled recipe).
const RANDOM_WAVEFORM_Y = 20;
const RANDOM_FREQUENCY_Y = 34;
const RANDOM_DURATION_Y = 48;
const RANDOM_NOISE_LABEL_Y = 62;
const RANDOM_NOISE_BAR_Y = 74;
const RANDOM_SWEEP_Y = 90;
const RANDOM_DUTY_Y = 108;

// Geometry for the noise-mix meter bar (same outline + proportional fill idiom as the volume
// bar in 036-audio-basics).
const METER_BAR_X_OFFSET = 6;
const METER_BAR_W = 120;
const METER_BAR_H = 8;

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
 * Picks a random number between `min` and `max` (inclusive of `min`, exclusive of `max`).
 *
 * @param {number} min - Smallest possible result.
 * @param {number} max - Upper bound the result stays below.
 * @returns {number}
 */
function randomInRange(min, max) {
    return min + Math.random() * (max - min);
}

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
    const frequency = randomInRange(RANDOM_FREQUENCY_MIN_HZ, RANDOM_FREQUENCY_MAX_HZ);
    const duration = randomInRange(RANDOM_DURATION_MIN_S, RANDOM_DURATION_MAX_S);
    const hasPitchSweep = Math.random() < RANDOM_PITCH_SWEEP_CHANCE;

    return {
        waveform,
        frequency,
        duration,
        volume: randomInRange(RANDOM_VOLUME_MIN, RANDOM_VOLUME_MAX),
        envelope: {
            attack: randomInRange(0, RANDOM_ATTACK_MAX_S),
            decay: randomInRange(0, RANDOM_DECAY_MAX_S),
            sustain: Math.random(),
            release: randomInRange(RANDOM_RELEASE_MIN_S, RANDOM_RELEASE_MAX_S),
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
                          frequency *
                          randomInRange(RANDOM_PITCH_SWEEP_MIN_MULTIPLIER, RANDOM_PITCH_SWEEP_MAX_MULTIPLIER),
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

    /** @type {AudioClip[]} Pre-rendered clips, one per PRESET_DEFINITIONS entry. */
    presetClips = [];

    // One flash-countdown per preset, so each key's row lights up on its own.
    presetFlashTimers = [0, 0, 0, 0, 0, 0];

    /** @type {number | null} Index into PRESET_DEFINITIONS of the last preset played. */
    lastPresetIndex = null;

    // Flash countdown for the randomizer panel's pip.
    randomizeFlashTimer = 0;

    /** @type {SynthParams | null} The most recently rolled random recipe, or null before the first roll. */
    lastRandomParams = null;

    /**
     * Turns on the engine's built-in audio meters in the overlay.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            // Adds live bar-graph meters (main/music/sfx bus levels) plus a voice-count
            // readout to the overlay. Off by default, since measuring audio levels costs a
            // little extra CPU work the engine skips unless a demo asks for it.
            isOverlayAudioMetersEnabled: true,

            // Shows the overlay body (title, FPS, backend, and the audio meters above) right
            // from the first frame instead of waiting for a Backquote press or a click in the
            // toggle-hint corner. This demo is all about sound, so the meters should be
            // visible immediately.
            isOverlayVisibleAtStart: true,

            // gapPaletteIndex fills both the thin seams between overlay rows and the empty
            // (unfilled) track behind each audio meter bar, so it must match the screen
            // background - slot {@link C_BG} - or those seams and meter tracks would show up
            // as a mismatched color instead of blending in. Filled in init() below.
            overlayStyle: {
                gapPaletteIndex: C_BG,
            },
        };
    }

    /**
     * Renders every preset's SynthParams recipe into a ready-to-play clip, so pressing a
     * preset key later has zero delay, and sets up the palette.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // AudioClip.synth() is async - it has to calculate every sample before it can hand
        // back a clip. Promise.all() starts all six calculations at once and waits for them
        // all to finish, the same way 036-audio-basics preloads its sound files up front.
        this.presetClips = await Promise.all(PRESET_DEFINITIONS.map((def) => AudioClip.synth(def.factory())));

        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(18, 22, 38));
        this.palette.set(C_AMBER, new Color32(255, 200, 120));
        this.palette.set(C_DIM, new Color32(130, 140, 160));
        this.palette.set(C_LIT, new Color32(120, 255, 160));
        this.palette.set(C_PANEL, new Color32(35, 42, 62));
        this.palette.set(C_PANEL_BORDER, new Color32(90, 98, 120));
        this.palette.set(C_ACCENT, new Color32(255, 140, 90));
        this.palette.set(C_METER_FILL, new Color32(120, 190, 255));

        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Reads keyboard input for this tick and plays sounds in response.
     *
     * We check for key presses here in update(), not in render(). The engine clears "was
     * this just pressed?" flags once per tick, and that tick always finishes before this
     * frame's render() runs - checking in render() instead would randomly miss fast taps
     * (028-keyboard-input explains this in more detail).
     */
    update() {
        // Each preset key plays its pre-rendered clip and lights up its own row.
        for (let i = 0; i < PRESET_DEFINITIONS.length; i++) {
            if (!BT.isKeyPressed(PRESET_DEFINITIONS[i].code)) {
                continue;
            }

            BT.soundPlay(this.presetClips[i]);
            this.presetFlashTimers[i] = FLASH_TICKS;
            this.lastPresetIndex = i;
        }

        for (let i = 0; i < this.presetFlashTimers.length; i++) {
            if (this.presetFlashTimers[i] > 0) {
                this.presetFlashTimers[i] -= 1;
            }
        }

        if (BT.isKeyPressed('KeyR')) {
            this.triggerRandomize();
        }

        if (this.randomizeFlashTimer > 0) {
            this.randomizeFlashTimer -= 1;
        }
    }

    /**
     * Rolls a new random SynthParams recipe and starts rendering + playing it.
     *
     * This method itself stays synchronous: it builds the recipe and updates what the panel
     * will show right away, so the numbers on screen always match the most recent key press
     * even though the actual sound takes a moment longer to render (see playRandomParams()).
     */
    triggerRandomize() {
        const params = buildRandomSynthParams();

        this.lastRandomParams = params;
        this.randomizeFlashTimer = FLASH_TICKS;

        // update() cannot be async, so we start this and let it run in the background instead
        // of waiting for it. The .catch() just logs a problem instead of crashing the page,
        // as a safety net - it should never actually trigger with the ranges above.
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

    /**
     * Clears the screen and draws the unlock message and both info panels.
     */
    render() {
        BT.clear(C_BG);

        this.renderUnlockPrompt();
        this.renderPresetPanel(PANEL_LEFT_X, PANEL_Y);
        this.renderRandomPanel(PANEL_RIGHT_X, PANEL_Y);
    }

    /**
     * Shows the "please click or press a key" message until audio is unlocked, then switches
     * to a plain reminder of the controls.
     */
    renderUnlockPrompt() {
        const pos = new Vector2i(PANEL_LEFT_X, UNLOCK_PROMPT_Y);

        if (BT.isAudioUnlocked) {
            BT.systemPrint(pos, C_DIM, 'Press J/P/E/L/H/B for presets, R to randomize');
        } else {
            BT.systemPrint(pos, C_ACCENT, 'Click or press a key to enable sound');
        }
    }

    /**
     * Left-hand panel: the six preset keys and the last one played.
     *
     * @param {number} x - Left edge of the panel in display pixels.
     * @param {number} y - Top edge of the panel.
     */
    renderPresetPanel(x, y) {
        BT.drawRectFill(new Rect2i(x, y, PANEL_W, PANEL_H), C_PANEL);
        BT.drawRect(new Rect2i(x, y, PANEL_W, PANEL_H), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(x + 4, y + 4), C_AMBER, 'Presets (keys)');

        for (let i = 0; i < PRESET_DEFINITIONS.length; i++) {
            const def = PRESET_DEFINITIONS[i];
            const rowY = y + PRESET_ROW_START_Y + i * PRESET_ROW_STEP;
            const flashing = this.presetFlashTimers[i] > 0;
            const pip = new Rect2i(x + 6, rowY, 8, 8);

            if (flashing) {
                BT.drawRectFill(pip, C_LIT);
            } else {
                BT.drawRect(pip, C_PANEL_BORDER);
            }

            const rowColor = flashing ? C_LIT : C_DIM;
            BT.systemPrint(new Vector2i(x + 20, rowY - 1), rowColor, `${def.label} = ${def.name}`);
        }

        const lastLabel = this.lastPresetIndex === null ? '-' : PRESET_DEFINITIONS[this.lastPresetIndex].name;
        BT.systemPrint(new Vector2i(x + 6, y + PRESET_LAST_LINE_Y), C_DIM, `Last: ${lastLabel}`);
    }

    /**
     * Right-hand panel: the most recently rolled random recipe, one field per line.
     *
     * @param {number} x - Left edge of the panel in display pixels.
     * @param {number} y - Top edge of the panel.
     */
    renderRandomPanel(x, y) {
        BT.drawRectFill(new Rect2i(x, y, PANEL_W, PANEL_H), C_PANEL);
        BT.drawRect(new Rect2i(x, y, PANEL_W, PANEL_H), C_PANEL_BORDER);

        BT.systemPrint(new Vector2i(x + 4, y + 4), C_AMBER, 'Randomizer (R)');

        const flashing = this.randomizeFlashTimer > 0;
        const params = this.lastRandomParams;
        const rowColor = flashing ? C_LIT : C_DIM;

        const pip = new Rect2i(x + 6, y + RANDOM_WAVEFORM_Y, 8, 8);
        if (flashing) {
            BT.drawRectFill(pip, C_LIT);
        } else {
            BT.drawRect(pip, C_PANEL_BORDER);
        }

        const waveformLabel = params === null ? '-' : params.waveform;
        BT.systemPrint(new Vector2i(x + 20, y + RANDOM_WAVEFORM_Y - 1), rowColor, `Waveform: ${waveformLabel}`);

        const frequencyLabel = params === null ? '-' : `${Math.round(params.frequency)} Hz`;
        BT.systemPrint(new Vector2i(x + 6, y + RANDOM_FREQUENCY_Y), C_DIM, `Frequency: ${frequencyLabel}`);

        const durationLabel = params === null ? '-' : `${params.duration.toFixed(2)} s`;
        BT.systemPrint(new Vector2i(x + 6, y + RANDOM_DURATION_Y), C_DIM, `Duration: ${durationLabel}`);

        // Noise mix bar: an empty outline that fills up left-to-right with how much white
        // noise is mixed into the tone (0 is a pure, clean tone; 1 is pure hiss).
        const noiseMixLabel = params === null ? '-' : params.noiseMix.toFixed(2);
        BT.systemPrint(new Vector2i(x + 6, y + RANDOM_NOISE_LABEL_Y), C_DIM, `Noise mix: ${noiseMixLabel}`);

        const barX = x + METER_BAR_X_OFFSET;
        const barY = y + RANDOM_NOISE_BAR_Y;
        BT.drawRect(new Rect2i(barX, barY, METER_BAR_W, METER_BAR_H), C_PANEL_BORDER);

        if (params !== null) {
            const fillW = Math.round(METER_BAR_W * params.noiseMix);
            BT.drawRectFill(new Rect2i(barX, barY, fillW, METER_BAR_H), flashing ? C_LIT : C_METER_FILL);
        }

        const sweepLabel =
            params === null ? '-' : params.pitchSweep ? `${Math.round(params.pitchSweep.toFrequency)} Hz` : 'none';
        BT.systemPrint(new Vector2i(x + 6, y + RANDOM_SWEEP_Y), C_DIM, `Sweep: ${sweepLabel}`);

        const dutyLabel = params === null ? '-' : params.waveform === 'square' ? params.dutyCycle.toFixed(2) : 'n/a';
        BT.systemPrint(new Vector2i(x + 6, y + RANDOM_DUTY_Y), C_DIM, `Duty: ${dutyLabel}`);
    }
}

bootstrap(Demo);
