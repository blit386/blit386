/*

Synth Toy: procedural chip-tune sound effects with no audio files at all.
@description Procedural chip-tune sound effects with no audio files: six presets plus a key that rolls a new one.

Part of the BLIT386 demo series.

Prerequisites:
  - Keyboard Input: https://demos.blit386.dev/keyboard-input
  - Audio Basics: https://demos.blit386.dev/audio-basics

Live version: https://demos.blit386.dev/synth-toy

Guides:
  - Audio: https://blit386.dev/docs/guides/audio#design-a-sound
  - Random: https://blit386.dev/docs/guides/random#deterministic-by-default
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Audio: https://blit386.dev/docs/api/audio#synth
  - Random: https://blit386.dev/docs/api/random#generators
  - Overlay: https://blit386.dev/docs/api/overlay#audio-meters-optional

---

WHAT YOU WILL SEE
-----------------

The engine overlay is open from the start: white bars along the top with the audio meter
band (three bus level bars - main, music, sfx - and a voice count), and a hint bar along
the bottom. Between them, one centered line of text reads "Click or press a key to enable
sound" in warm orange until sound is unlocked, then a dim "Tap a button, or press its
key."

Two panels of the same height sit side by side under that line. "Presets" on the left is
a keypad of six equal buttons in two columns - "J Jump", "P Pickup", "E Explosion",
"L Laser", "H Hit", and "B Blip" - with a "Last" row naming the preset played most
recently. "Randomizer" on the right has an "R - Randomize" button and a readout of the
last rolled recipe: Waveform, Frequency in Hz, Duration in seconds, Noise mix with a meter
bar, Sweep, and Duty.

WHAT YOU WILL LEARN
-------------------

- AudioClip.synth(params) calculates every sample of a sound from a SynthParams recipe:
  a waveform, a frequency, a duration, and optional knobs (volume, an
  attack/decay/sustain/release envelope, a pitchSweep, a noiseMix, a dutyCycle, a seed).
- BT.synthPreset.jump(), .pickup(), .explosion(), .laser(), .hit(), and .blip() return
  hand-tuned recipes for common game sounds.
- Rendering the six presets once in init() with Promise.all(), so pressing a button later
  plays instantly.
- BT.random.pick(), .float(), .bool(), .next(), and .int() build a brand new recipe with
  every field chosen at random inside safe ranges.
- Kicking off an async render-and-play from a synchronous button handler.
- isOverlayVisibleAtStart: true and isOverlayAudioMetersEnabled: true show the overlay
  and its audio meters from the first frame, and overlayStyle / overlayAudioMeterStyle
  pick its colors from the palette.
- Laying buttons out in a grid: the UI kit stacks a group's rows, so each keypad button
  gets its own tiny group pinned to an exact spot on top of the panel.

HOW A SYNTH RECIPE WORKS
------------------------

Every sound on this page is built from scratch by the computer the instant you ask for
it; there are no sound files to download. The recipe is a small plain object called
SynthParams. The waveform is the basic shape of the wave (sine is smooth and pure, square
is hollow, triangle sits in between, sawtooth is harsh, noise is hiss). The frequency is
the pitch in Hz and the duration the length in seconds. The envelope shapes the loudness
over time: attack is how fast it ramps up, decay how fast it falls to the sustain level,
and release how it fades out at the end. A pitchSweep glides the pitch toward another
frequency, noiseMix blends in white noise, and dutyCycle changes the character of a square
wave only.

The six presets are recipes tuned by hand so they sound right without you picking every
number yourself. The Randomize button goes the other way: it rolls a brand new recipe with
every field chosen at random and shows exactly what was rolled in the right-hand panel.
Play it a few times and you will hear how much variety a handful of numbers can produce -
from a clean sine "boop" to a noisy sawtooth growl. (The engine also supports a vibrato
wobble on top of all this; the demo leaves it out to keep the panel small.)

TRY THIS
--------

- Click anywhere, or press any key, to unlock sound - watch the line under the overlay
  change once you do.
- Tap the preset buttons (or press J, P, E, L, H, or B) to hear the jump, pickup,
  explosion, laser, hit, and blip presets. The "Last" row names the one you played.
- Tap Randomize (or press R) and watch the right-hand panel update with the waveform,
  frequency, duration, noise mix, pitch sweep target, and duty cycle that were rolled. The
  Duty row shows a number only for square waves and "n/a" otherwise; Sweep reads "none"
  about half the time.
- Randomize again and again - notice how differently the same few lines of "roll a random
  number" code can make the engine sound each time.
- Watch the overlay's audio meters (already open) jump every time a preset or a randomized
  sound plays.

*/

import { AudioClip, bootstrap, BT } from 'blit386';

import { applyTheme, FONT_W, THEME_OVERLAY_AUDIO_METER_STYLE, THEME_OVERLAY_STYLE, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SynthParams} SynthParams */

// The waveform shapes AudioClip.synth() accepts. The engine exports this list only as a
// TypeScript type, not as a runtime value, so we spell it out here ourselves - the
// randomizer picks one of these five names at random for every roll.
const SYNTH_WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];

// One entry per preset. Each `factory` asks BT.synthPreset for a fresh, hand-tuned recipe
// (a SynthParams object) for that sound. `label` is the button text (which doubles as the
// keyboard hint), `name` is what the "Last" row shows, and `code` is the bound key.
const PRESET_DEFINITIONS = [
    { code: 'KeyJ', label: 'J Jump', name: 'Jump', factory: () => BT.synthPreset.jump() },
    { code: 'KeyP', label: 'P Pickup', name: 'Pickup', factory: () => BT.synthPreset.pickup() },
    { code: 'KeyE', label: 'E Explosion', name: 'Explosion', factory: () => BT.synthPreset.explosion() },
    { code: 'KeyL', label: 'L Laser', name: 'Laser', factory: () => BT.synthPreset.laser() },
    { code: 'KeyH', label: 'H Hit', name: 'Hit', factory: () => BT.synthPreset.hit() },
    { code: 'KeyB', label: 'B Blip', name: 'Blip', factory: () => BT.synthPreset.blip() },
];

// Screen layout, in display pixels. The engine overlay is open from the start: its bars
// cover the top 56 rows and its hint bar the bottom 14, so everything sits in the band
// between them. The status line comes first, then two panels side by side, equally tall.
const STATUS_Y = 64;
const PANEL_Y = 76;
const PRESET_PANEL_X = 4;
const PRESET_PANEL_W = 174;
const RANDOM_PANEL_X = 184;
const RANDOM_PANEL_W = 132;

// Panel metrics from the UI kit: content starts 22 pixels below a panel's top edge
// (under its title) and 9 pixels in from its left edge, and is 20 pixels narrower than
// the panel.
const PANEL_CONTENT_TOP = 22;
const PANEL_CONTENT_X = 9;
const PANEL_CONTENT_SHRINK = 20;

// The presets form a keypad of two columns and three rows, all buttons the same width.
// The kit stacks a group's rows top to bottom, so the keypad reserves its space inside
// the panel with an empty row and then places each button with its own tiny group.
const PRESET_COLUMNS = 2;
const PRESET_GAP_X = 6;
const PRESET_BUTTON_W = (PRESET_PANEL_W - PANEL_CONTENT_SHRINK - PRESET_GAP_X) / PRESET_COLUMNS;
const PRESET_ROW_H = 27;
const PRESET_GRID_X = PRESET_PANEL_X + PANEL_CONTENT_X;

// The keypad starts under the panel title and the one-line key hint.
const PRESET_GRID_Y = PANEL_Y + PANEL_CONTENT_TOP + 14;
const PRESET_GRID_H = (PRESET_DEFINITIONS.length / PRESET_COLUMNS) * PRESET_ROW_H;

// A group pinned with pad 0 starts its first row 5 pixels above the y it is given, so
// each button group is placed this much lower to land on its keypad row.
const PINNED_ROW_SHIFT = 5;

// Breathing room: under the keypad before the "Last" row, under the Randomize button
// before the readout, and at the bottom of both panels. These make both panels end on
// the same line, with "Last" and "Duty" on the same row.
const PRESET_PANEL_FILLER = 1;
const RANDOM_PANEL_FILLER = 6;
const PANEL_TRAILING_SPACE = 5;

// One text row of the UI kit, and where the "Last" row sits: under the keypad.
const ROW_H = 10;
const LAST_ROW_Y = PRESET_GRID_Y + PRESET_GRID_H + PRESET_PANEL_FILLER;

// The value column of the randomizer readout starts after this many characters, so the
// longest key, "Frequency", keeps a space after it.
const RANDOM_KV_COLS = 10;

// Safe ranges for the randomizer. Every one of these stays inside the bounds
// AudioClip.synth() actually accepts (see the engine's synthValidation.ts): frequencies
// and durations above zero, envelope times at or above zero, and everything described as
// a fraction kept between 0 and 1.
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

// A pitch sweep (the pitch gliding from its starting frequency to a new one) is only
// added to the random recipe about half the time, so you get to compare "sweep" sounds
// against "flat pitch" sounds. The target is the start frequency times a number in this
// range.
const RANDOM_PITCH_SWEEP_CHANCE = 0.5;
const RANDOM_PITCH_SWEEP_MIN_MULTIPLIER = 0.3;
const RANDOM_PITCH_SWEEP_MAX_MULTIPLIER = 3.0;

// Upper bound for the random seed handed to AudioClip.synth(). This seed only feeds the
// engine's internal noise generator - it is not something we need to remember or
// reproduce here, so any number in this range works.
const RANDOM_SEED_MAX = 1_000_000;

// Builds a brand new SynthParams recipe with every field chosen at random, inside the
// safe ranges above. The six presets are hand-tuned recipes where a seed only nudges a
// couple of fields; this touches every knob AudioClip.synth() understands except vibrato,
// so pressing Randomize is a tour of the whole parameter space rather than a small
// variation on one sound.
function buildRandomSynthParams() {
    // BT.random is the engine's shared random number generator. pick() draws one item out
    // of a list, float() returns a decimal between two values, bool() flips a weighted
    // coin, next() gives a decimal from 0 up to (but not including) 1 - exactly the range
    // the fraction knobs want - and int() gives a whole number from 0 up to a limit.
    const waveform = BT.random.pick(SYNTH_WAVEFORMS);
    const frequency = BT.random.float(RANDOM_FREQUENCY_MIN_HZ, RANDOM_FREQUENCY_MAX_HZ);
    const duration = BT.random.float(RANDOM_DURATION_MIN_S, RANDOM_DURATION_MAX_S);
    const hasPitchSweep = BT.random.bool(RANDOM_PITCH_SWEEP_CHANCE);

    return {
        waveform,
        frequency,
        duration,
        volume: BT.random.float(RANDOM_VOLUME_MIN, RANDOM_VOLUME_MAX),
        envelope: {
            attack: BT.random.float(0, RANDOM_ATTACK_MAX_S),
            decay: BT.random.float(0, RANDOM_DECAY_MAX_S),
            sustain: BT.random.next(),
            release: BT.random.float(RANDOM_RELEASE_MIN_S, RANDOM_RELEASE_MAX_S),
        },
        noiseMix: BT.random.next(),
        dutyCycle: BT.random.next(),
        seed: BT.random.int(RANDOM_SEED_MAX),
        // Only glide the pitch about half the time, and only then add the field at all -
        // AudioClip.synth() treats a missing pitchSweep as "stay at one pitch". The `...`
        // spreads either a one-field object or an empty one into the recipe.
        ...(hasPitchSweep
            ? {
                  pitchSweep: {
                      toFrequency:
                          frequency *
                          BT.random.float(RANDOM_PITCH_SWEEP_MIN_MULTIPLIER, RANDOM_PITCH_SWEEP_MAX_MULTIPLIER),
                  },
              }
            : {}),
    };
}

// Preset button playback plus a "roll the dice" randomizer, both built on
// AudioClip.synth().
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    theme = null;

    // Pre-rendered clips, one per PRESET_DEFINITIONS entry, in the same order.
    /** @type {AudioClip[]} */
    presetClips = [];

    // Index into PRESET_DEFINITIONS of the last preset played, or null before the first.
    /** @type {number | null} */
    lastPresetIndex = null;

    // The most recently rolled random recipe, or null before the first roll.
    /** @type {SynthParams | null} */
    lastRandomParams = null;

    // Turns on the engine's built-in audio meters, shows the overlay from the very first
    // frame, and colors it from the shared UI theme.
    configure() {
        return {
            // Live per-bus level bars and a voices/steal/drop readout in the overlay. Off
            // by default.
            isOverlayAudioMetersEnabled: true,

            // Shows the overlay body (title, FPS, backend, and the audio meters above)
            // right from the first frame instead of waiting for a Backquote press or a
            // click in the toggle-hint corner. This demo is all about sound, so the
            // meters should be visible immediately.
            isOverlayVisibleAtStart: true,

            // The overlay's default colors live in palette slots 1 and 2, which this demo
            // never fills - they would draw solid black. These two shared styles point
            // the bars, text, and meters at the theme's colors instead, with the screen
            // background in the gaps between bands and behind each meter bar.
            overlayStyle: THEME_OVERLAY_STYLE,
            overlayAudioMeterStyle: THEME_OVERLAY_AUDIO_METER_STYLE,
        };
    }

    // Renders every preset's SynthParams recipe into a ready-to-play clip, so pressing a
    // preset later has zero delay, and installs the shared UI theme.
    async init() {
        // AudioClip.synth() is async - it has to calculate every sample before it can
        // hand back a clip. Promise.all() starts all six calculations at once and waits
        // for them all to finish, the same way music preloads its tracks up front.
        this.presetClips = await Promise.all(PRESET_DEFINITIONS.map((def) => AudioClip.synth(def.factory())));

        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors and reports their slots, so
        // render() can clear the screen with the theme's background color.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        return true;
    }

    // Runs the UI kit's once-per-tick housekeeping.
    //
    // The preset keys (J/P/E/L/H/B and R) are bound to the buttons declared in render()
    // via their { key } option. ui.tick() is where the kit safely catches those presses -
    // keyboard "was it just pressed?" flags can only be read reliably here in update(),
    // never in render() (keyboard-input explains why in detail).
    update() {
        ui.tick();
    }

    // Clears the screen and declares the whole UI: the status line, the preset keypad on
    // the left, and the randomizer readout on the right.
    render() {
        BT.clear(this.theme.bg);

        this.renderStatusLine();
        this.renderPresetPanel();
        this.renderRandomPanel();
    }

    // One centered line just under the overlay bars: the shared unlock reminder in warm
    // orange until sound is unlocked, then a dim reminder of the controls.
    renderStatusLine() {
        const isLocked = !BT.isAudioUnlocked;
        const text = isLocked ? 'Click or press a key to enable sound' : 'Tap a button, or press its key.';

        // FONT_W is the width of one character; the last one's empty spacing column is
        // left out, so the visible letters are what gets centered.
        const x = Math.floor(BT.displaySize.x / 2) - Math.floor((text.length * FONT_W - 1) / 2);

        ui.caption(x, STATUS_Y, text, { color: isLocked ? 'warm' : 'dim' });
    }

    // Left-hand panel: a keypad of six preset buttons, plus the last one played. Each
    // button fires on click, tap, or its keyboard shortcut - ui.button() treats all three
    // the same.
    //
    // A group is drawn the moment it ends, in call order, so the panel comes first with
    // empty rows where the keypad and the "Last" row go, and those are placed on top of
    // it afterwards. The "Last" row comes after the buttons, so a press shows up in it on
    // the same frame.
    renderPresetPanel() {
        ui.begin('topLeft', { x: PRESET_PANEL_X, y: PANEL_Y, width: PRESET_PANEL_W });
        ui.panel('Presets');
        ui.label('Keys J P E L H B or tap', { color: 'dim' });
        ui.spacer(4);
        ui.spacer(PRESET_GRID_H + PRESET_PANEL_FILLER + ROW_H + PANEL_TRAILING_SPACE);
        ui.end();

        for (let i = 0; i < PRESET_DEFINITIONS.length; i++) {
            const def = PRESET_DEFINITIONS[i];
            const x = PRESET_GRID_X + (i % PRESET_COLUMNS) * (PRESET_BUTTON_W + PRESET_GAP_X);
            const y = PRESET_GRID_Y + Math.floor(i / PRESET_COLUMNS) * PRESET_ROW_H + PINNED_ROW_SHIFT;

            ui.begin('topLeft', { x, y, pad: 0 });

            if (ui.button(def.label, { key: def.code, width: PRESET_BUTTON_W })) {
                // Play the pre-rendered clip and remember it for the "Last" row below.
                BT.soundPlay(this.presetClips[i]);
                this.lastPresetIndex = i;
            }

            ui.end();
        }

        const lastLabel = this.lastPresetIndex === null ? '-' : PRESET_DEFINITIONS[this.lastPresetIndex].name;

        ui.begin('topLeft', { x: PRESET_GRID_X, y: LAST_ROW_Y + PINNED_ROW_SHIFT, pad: 0 });
        ui.kv('Last', lastLabel);
        ui.end();
    }

    // Right-hand panel: the Randomize button and the most recently rolled recipe, one
    // field per row.
    renderRandomPanel() {
        ui.begin('topLeft', { x: RANDOM_PANEL_X, y: PANEL_Y, width: RANDOM_PANEL_W, kvCols: RANDOM_KV_COLS });
        ui.panel('Randomizer');

        if (ui.button('R - Randomize', { key: 'KeyR', width: RANDOM_PANEL_W - PANEL_CONTENT_SHRINK })) {
            this.triggerRandomize();
        }

        ui.spacer(RANDOM_PANEL_FILLER);

        // Read after the button, so a roll made this frame already shows below.
        const params = this.lastRandomParams;

        // Each row reports one part of the rolled recipe ('-' before the first roll).
        ui.kv('Waveform', params === null ? '-' : params.waveform);
        ui.kv('Frequency', params === null ? '-' : `${Math.round(params.frequency)} Hz`);
        ui.kv('Duration', params === null ? '-' : `${params.duration.toFixed(2)} s`);

        // Noise mix: how much white noise is mixed into the tone (0 is a pure, clean
        // tone; 1 is pure hiss). The meter bar fills up left-to-right with the amount.
        ui.kv('Noise mix', params === null ? '-' : params.noiseMix.toFixed(2));
        ui.meter(null, params === null ? 0 : params.noiseMix, { width: RANDOM_PANEL_W - PANEL_CONTENT_SHRINK });

        // The sweep target in Hz, or 'none' when this roll kept a flat pitch.
        const sweepLabel =
            params === null ? '-' : params.pitchSweep ? `${Math.round(params.pitchSweep.toFrequency)} Hz` : 'none';

        ui.kv('Sweep', sweepLabel);

        // The duty cycle only shapes square waves, so other waveforms show 'n/a'.
        const dutyLabel = params === null ? '-' : params.waveform === 'square' ? params.dutyCycle.toFixed(2) : 'n/a';

        ui.kv('Duty', dutyLabel);
        ui.spacer(PANEL_TRAILING_SPACE);
        ui.end();
    }

    // Rolls a new random SynthParams recipe and starts rendering and playing it.
    //
    // This method itself stays synchronous: it builds the recipe and updates what the
    // panel will show right away, so the numbers on screen always match the most recent
    // press even though the actual sound takes a moment longer to render (see
    // playRandomParams()).
    triggerRandomize() {
        const params = buildRandomSynthParams();

        this.lastRandomParams = params;

        // The kit calls render() synchronously, and this handler cannot be async, so we
        // start the render-and-play and let it run in the background instead of waiting
        // for it. The .catch() just logs a problem instead of crashing the page, as a
        // safety net - it should never actually trigger with the ranges above.
        this.playRandomParams(params).catch((error) => console.error(error));
    }

    // Renders a SynthParams recipe into a clip and plays it.
    async playRandomParams(params) {
        const clip = await AudioClip.synth(params);

        BT.soundPlay(clip);
    }
}

bootstrap(Demo);
