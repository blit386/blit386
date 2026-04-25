// @pageTitle Blit-Tech Demo 023 - PipBoy CRT
//
// Demo 023 - PipBoy CRT: a faux Fallout terminal with scanlines, glitches, and bloom.
//
// Demo 023 in the Blit-Tech demo series.
// We learned about the demo loop in the Basics demo: https://vancura.dev/articles/blit-tech-basics
// We learned about bitmap fonts in the Bitmap Font demo: https://vancura.dev/articles/blit-tech-bitmap-font
//
// Live article: https://vancura.dev/articles/blit-tech-pipboy-crt
//
// WHAT YOU WILL SEE
// A green-on-black terminal that looks like an old curved CRT screen. Scanlines, a soft glow
// (called "bloom"), and tiny noise speckles make the picture look like it is coming from a
// real cathode-ray tube. Every few seconds the picture glitches: a band of pixels jumps
// sideways, the color channels split apart, the whole screen flickers darker, or static rolls.
//
// WHAT YOU WILL LEARN
//   - "Post-processing": running an effect on the WHOLE screen after we are done drawing it.
//   - The PipBoyEffect class - a built-in CRT shader you can add with one line of code.
//   - The BloomEffect class - a soft-glow shader you can stack on top of the CRT.
//   - A "state machine": a tiny set of rules that decides when to start a glitch, what kind,
//     and how long it lasts. We pick one of four glitch styles each time.
//
// HOW POST-PROCESSING WORKS
// Normally the engine draws straight to the screen. When you add a "post-process effect"
// with BT.effectAdd(...), the engine instead draws to an off-screen picture, then runs your
// effect on that picture, and only THEN puts the final result on the screen. You can stack
// more than one effect: each one reads the previous result and writes a new one.
//
// HOW THE GLITCH STATE MACHINE WORKS
// We keep two counters:
//   - cooldown: ticks remaining until the NEXT glitch starts.
//   - active:   ticks remaining in the CURRENT glitch (0 means "no glitch right now").
// Every frame we count one down. When `active` runs out we decrement `cooldown`. When
// `cooldown` runs out we roll a new glitch (random type, random duration, random strength)
// and reset `active` to that duration. The shader itself is uniform-driven, so all we do
// in JS is set numbers on the effect each frame.
//
// HOW THE BITMAP FONT COLORS WORK
// The font is loaded as a sprite sheet of WHITE glyph pixels. We "indexize" the sheet
// against our palette, which replaces each white pixel with the index of the white slot
// (C_WHITE). When we draw with BT.printFont(font, pos, text, offset), the engine adds
// `offset` to that index. So passing `C_GREEN - C_WHITE` shifts every glyph pixel from
// the white slot to the green slot. Same trick the Sprite Effects demo uses for tints.

// #region Imports

import { BitmapFont, BloomEffect, bootstrap, BT, Color32, PipBoyEffect, Rect2i, Vector2i } from 'blit-tech';

// #endregion

// #region Configuration

// The internal pixel resolution of the demo. Small numbers keep the pixel art look.
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// We update at this rate (60 ticks per second). The glitch state machine measures
// time in ticks, so changing this also changes how often glitches trigger.
const TARGET_FPS = 60;

// Palette indices. Index 0 is always transparent. Slot order matters: the bitmap font
// is indexized against C_WHITE, and we shift that index up to reach the colored slots.
const C_BG = 1; // Almost-black: the inside of the screen. Used by BT.clear.
const C_WHITE = 2; // Pure white: the slot the font's pixels indexize to. Never drawn directly.
const C_GREEN_DIM = 3; // Faded green: low-priority text and chrome.
const C_GREEN = 4; // PipBoy green: the main text color.
const C_GREEN_BRIGHT = 5; // Hot green: highlights and the cursor.
const C_AMBER = 6; // Amber: warning numbers (a wink at the alternative PipBoy palette).

// Layout for the terminal text. We pre-compute everything in pixels so render()
// stays a list of draw calls rather than a math exercise.
const TEXT_LEFT = 14;
const TEXT_TOP = 18;
const LINE_HEIGHT = 14;

// How many ticks each "boot line" takes to type out. 6 ticks at 60 FPS = 100ms per line spacer.
// Each character within a line is revealed every `BOOT_TICKS_PER_CHAR` ticks.
const BOOT_LINE_SPACER_TICKS = 6;
const BOOT_TICKS_PER_CHAR = 2;

// The boot sequence. Each entry is one line that appears letter-by-letter.
// Keep this short - with too many lines the demo never finishes booting.
// Tip: read this top-to-bottom to imagine how a real PipBoy might wake up.
const BOOT_LINES = [
    'ROBCO INDUSTRIES (TM) PIP-BOY 3000',
    'COPYRIGHT 2075 ROBCO IND.',
    '',
    'INITIATING BOOT SEQUENCE...',
    'LOADING FIRMWARE..............[ OK ]',
    'CHECKING RAD SENSORS..........[ OK ]',
    'GEIGER COUNTER................[ OK ]',
    'VAULT-TEC LINK................[FAIL]',
    'FALLBACK: LOCAL CACHE.........[ OK ]',
    '',
    '> WELCOME, RESIDENT 101',
];

// Status block contents, drawn AFTER the boot sequence finishes. These never animate;
// they sit on the screen so the CRT effect has something colorful to chew on.
const STATUS_LINES = [
    ['HP', '125 / 125', 'green'],
    ['AP', ' 75 /  75', 'green'],
    ['RAD', '  3 / 1000', 'dim'],
    ['CAPS', '   1248', 'amber'],
    ['WEIGHT', '  84 / 200', 'green'],
];

// The cursor blinks: ON for half a second, OFF for half a second.
// 30 ticks at 60 FPS = 0.5 seconds. The cursor is just a bright square.
const CURSOR_BLINK_TICKS = 30;

// Glitch state machine tuning. All durations are in ticks (60 per second).
// MIN/MAX cooldown = how long the screen stays calm BETWEEN glitches.
// MIN/MAX active   = how long each glitch lasts once it starts.
// Larger values = a calmer demo; smaller values = chaos.
const GLITCH_COOLDOWN_MIN = 120; // 2 seconds
const GLITCH_COOLDOWN_MAX = 360; // 6 seconds
const GLITCH_ACTIVE_MIN = 5; // 0.083 seconds (a brief stutter)
const GLITCH_ACTIVE_MAX = 30; // 0.5 seconds  (a noticeable hiccup)

// The four glitch personalities the state machine can pick from.
// All four mutate the SAME shader uniforms (glitchIntensity / glitchSeed / flickerAmount);
// the difference is which combination we drive each frame. Strings are easier to read in
// `update()` than magic numbers when you decide to tune one of them.
const GLITCH_TYPES = ['hshift', 'chromasplit', 'noise', 'flicker'];

// Multipliers per glitch type. We pick the strength for the current burst once and then
// blend it in for the lifetime of the burst (envelope: ramp up, hold, ramp down).
const GLITCH_INTENSITY_MIN = 0.35;
const GLITCH_INTENSITY_MAX = 1.0;

// Flicker dips the brightness of the WHOLE picture briefly. 1.0 = unmodulated; lower = darker.
const FLICKER_BASE = 1.0;
const FLICKER_DIP = 0.6;

// #endregion

// #region Type Definitions

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #endregion

// #region Helper Functions

/**
 * Returns a random integer in the half-open range [min, max).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min));
}

/**
 * Returns a random float in [min, max).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * Returns a random element from `arr`.
 * Used to pick a glitch personality. Strings or numbers, doesn't matter.
 * @template T
 * @param {readonly T[]} arr
 * @returns {T}
 */
function randPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Maps a status-line "color name" (kept as a string in STATUS_LINES so the table
 * is human-readable) to the matching palette slot.
 * @param {string} name
 * @returns {number}
 */
function colorSlot(name) {
    if (name === 'amber') return C_AMBER;
    if (name === 'dim') return C_GREEN_DIM;
    return C_GREEN;
}

// #endregion

// #region Main Logic

/**
 * PipBoy-style terminal showcase. Renders a tiny boot sequence + status block in green
 * bitmap text, then drives a JS-side glitch state machine that mutates the PipBoyEffect
 * uniforms each frame to produce occasional glitches. BloomEffect is stacked on top to
 * soften the phosphor glow.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    queryHardware() {
        return {
            // The internal canvas is pixel-art sized. The CSS layer can scale it up,
            // but the CRT effect is computed at this resolution - intentional for the look.
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            targetFPS: TARGET_FPS,
        };
    }

    async initialize() {
        // Build the palette. Just six colors: every effect on screen comes from these.
        const palette = BT.paletteCreate(16);
        palette.set(C_BG, new Color32(8, 14, 8, 255));
        palette.set(C_WHITE, Color32.white()); // The slot the font glyph pixels resolve to.
        palette.set(C_GREEN_DIM, new Color32(40, 100, 60, 255));
        palette.set(C_GREEN, new Color32(80, 200, 110, 255));
        palette.set(C_GREEN_BRIGHT, new Color32(170, 255, 190, 255));
        palette.set(C_AMBER, new Color32(220, 180, 60, 255));
        BT.paletteSet(palette);

        // Load the bitmap font we use for everything on screen. PragmataPro is a monospaced
        // programming font - a perfect fit for a fictional terminal.
        this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');

        // The font is loaded as a sprite sheet of white pixels. We "indexize" it: the engine
        // walks every pixel, looks up its color in the palette, and replaces the pixel with
        // the matching slot index. After this, the font's pixels carry index = C_WHITE, and
        // BT.printFont can shift that index by an offset to recolor the glyphs at draw time.
        this.font.getSpriteSheet().indexize(palette);

        // Create the two post-process effects.
        // PipBoyEffect: the CRT look (scanlines, mask, curvature, vignette, glitch hooks).
        // BloomEffect: a soft glow on bright pixels. Stacked AFTER the CRT so the bloom
        // sees the post-CRT image.
        this.pipboy = new PipBoyEffect();
        this.bloom = new BloomEffect();

        // Tune the CRT to taste. The defaults are designed to match the original PipBoy
        // snippet, but we lean into a slightly darker, glowier look here.
        this.pipboy.scanLineAmount = 0.55; // a touch lighter than default scanlines
        this.pipboy.maskIntensity = 0.18; // RGB phosphor mask is more visible
        this.pipboy.vignetteAmount = 0.35; // darker corners sell the curved-glass illusion
        this.pipboy.noiseAmount = 0.025; // subtle film grain

        // Tone the bloom down a little - defaults are "studio bright"; we want "underground vault".
        this.bloom.bloomGlow = 0.18;

        // Order matters: CRT first, bloom second. Demo 024 (CRT toggle) shows what add/remove
        // looks like without bloom in the chain.
        BT.effectAdd(this.pipboy);
        BT.effectAdd(this.bloom);

        // Boot animation state. We use ticks instead of wall-clock so it stays deterministic
        // even if the browser frame rate hiccups.
        this.bootStartTick = BT.ticks();

        // Glitch state machine state. See the file header for what each field means.
        this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchActive = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;

        return true;
    }

    update() {
        // ---- 1. Drive the boot animation timer ----
        // We don't draw here - render() reads `this._ticksSinceBoot` and computes how many
        // characters to show. update() just provides time.
        this._ticksSinceBoot = BT.ticks() - this.bootStartTick;

        // ---- 2. Drive the glitch state machine ----
        if (this.glitchActive > 0) {
            // We are inside a glitch burst. Build an "envelope": ramps up to glitchPeak,
            // holds, then ramps down. Sounds fancy - in practice it just makes a sin curve
            // over the lifetime of the burst (sin from 0 to PI is a nice 0 -> 1 -> 0 hump).
            const t = 1 - this.glitchActive / this.glitchDuration; // 0 at start, 1 at end
            const envelope = Math.sin(t * Math.PI); // 0 -> 1 -> 0

            this.applyGlitchUniforms(envelope);

            this.glitchActive--;
            // When the burst ends, reset the uniforms so the screen calms down.
            if (this.glitchActive === 0) {
                this.pipboy.glitchIntensity = 0;
                this.pipboy.flickerAmount = FLICKER_BASE;
                this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }
        } else {
            // No active glitch - count down to the next one.
            this.glitchCooldown--;
            if (this.glitchCooldown <= 0) {
                // Roll a new burst. Pick a random type, duration, and peak strength.
                this.glitchType = randPick(GLITCH_TYPES);
                this.glitchDuration = randInt(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
                this.glitchActive = this.glitchDuration;
                this.glitchPeak = randFloat(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
                // Reset the seed so the shader uses a new band-noise pattern this burst.
                this.pipboy.glitchSeed = Math.random() * 1000;
            }
        }

        // The CRT shader uses `time` for its rolling line and noise. We feed it seconds
        // so the rolling effect speed is independent of TARGET_FPS.
        this.pipboy.time = BT.ticks() / TARGET_FPS;
    }

    /**
     * Sets the glitch uniforms based on the current glitch type and an "envelope" value
     * that goes 0 -> 1 -> 0 over the lifetime of the burst.
     * @param {number} envelope
     */
    applyGlitchUniforms(envelope) {
        const peak = this.glitchPeak * envelope;

        // Reset everything to "calm" first, then layer the chosen personality on top.
        // This way two bursts back-to-back never accidentally inherit each other's settings.
        this.pipboy.glitchIntensity = 0;
        this.pipboy.flickerAmount = FLICKER_BASE;

        if (this.glitchType === 'hshift') {
            // Horizontal band shift: bands of pixels jump sideways. Drives glitchIntensity only.
            this.pipboy.glitchIntensity = peak;
        } else if (this.glitchType === 'chromasplit') {
            // The R/G/B channels split apart - the shader scales chromatic aberration with
            // glitchIntensity. Same uniform, different feel because the underlying "ABERRATION"
            // and band-shift terms both scale with it.
            this.pipboy.glitchIntensity = peak * 1.2;
        } else if (this.glitchType === 'noise') {
            // Noisy bands of static. Slightly higher intensity to emphasize the noise mix term.
            this.pipboy.glitchIntensity = peak * 0.9;
        } else if (this.glitchType === 'flicker') {
            // Whole-screen brightness dip. Doesn't touch glitchIntensity at all - just tugs
            // flickerAmount down toward FLICKER_DIP and back. This is the "lights flicker"
            // moment in a horror movie.
            this.pipboy.flickerAmount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
        }
    }

    render() {
        // Fill the background. Even with the CRT effect on top, this becomes the
        // "phosphor off" color of every empty cell.
        BT.clear(C_BG);

        // Draw the boot sequence one character at a time, line by line.
        this.renderBootSequence();

        // Once the boot lines are all visible, draw the status block on the right.
        if (this.bootFullyDone()) {
            this.renderStatusBlock();
            this.renderBlinkingCursor();
        }
    }

    /**
     * Wraps BT.printFont so callers pass a target palette slot rather than the
     * raw offset the engine wants. C_WHITE is where the font's pixels live after
     * indexize, so the offset to reach `slot` is `slot - C_WHITE`.
     * @param {Vector2i} pos
     * @param {string} text
     * @param {number} slot - target palette slot index (e.g. C_GREEN)
     */
    print(pos, text, slot) {
        BT.printFont(this.font, pos, text, slot - C_WHITE);
    }

    /**
     * Reveals the BOOT_LINES one character at a time. We compute how many ticks have
     * passed and use that to slice the strings in place.
     */
    renderBootSequence() {
        let ticksLeft = this._ticksSinceBoot;

        for (let i = 0; i < BOOT_LINES.length; i++) {
            const fullLine = BOOT_LINES[i];
            const y = TEXT_TOP + i * LINE_HEIGHT;

            // Empty lines just consume a small spacer of ticks (so the pause between sections
            // feels right) and don't draw anything.
            if (fullLine.length === 0) {
                ticksLeft -= BOOT_LINE_SPACER_TICKS;
                continue;
            }

            // How many characters of THIS line should be visible? Each char takes
            // BOOT_TICKS_PER_CHAR ticks. Clamp to [0, length].
            const charsToShow = Math.max(0, Math.min(fullLine.length, Math.floor(ticksLeft / BOOT_TICKS_PER_CHAR)));
            if (charsToShow === 0) {
                // Future line, not yet started. Stop - everything below is also invisible.
                return;
            }

            const visible = fullLine.slice(0, charsToShow);
            // Pick the colour: lines that finished get the brighter green; lines mid-typing
            // stay dim until they complete. Subtle but adds life.
            const slot = charsToShow >= fullLine.length ? C_GREEN : C_GREEN_DIM;
            this.print(new Vector2i(TEXT_LEFT, y), visible, slot);

            // Subtract this line's ticks from the running total before moving on.
            ticksLeft -= fullLine.length * BOOT_TICKS_PER_CHAR + BOOT_LINE_SPACER_TICKS;
            if (ticksLeft <= 0) return;
        }
    }

    /**
     * Returns true once every boot line has been fully typed out.
     */
    bootFullyDone() {
        // Sum: every line costs (length * ticksPerChar + spacer); empty lines cost just spacer.
        let totalTicks = 0;
        for (const line of BOOT_LINES) {
            totalTicks += (line.length === 0 ? 0 : line.length * BOOT_TICKS_PER_CHAR) + BOOT_LINE_SPACER_TICKS;
        }
        return this._ticksSinceBoot >= totalTicks;
    }

    /**
     * Draws the static "stats" block on the right half of the screen.
     */
    renderStatusBlock() {
        const x = DISPLAY_W / 2 + 6;
        const y0 = TEXT_TOP;
        this.print(new Vector2i(x, y0), '== STATUS ==', C_GREEN_BRIGHT);

        for (let i = 0; i < STATUS_LINES.length; i++) {
            const [label, value, colorName] = STATUS_LINES[i];
            const y = y0 + (i + 2) * LINE_HEIGHT;
            this.print(new Vector2i(x, y), label, C_GREEN_DIM);
            // Right-align the value. Label sits at column 0; value sits at column 70px.
            // Hand-tuned for this font size - fine because both label and value are short.
            this.print(new Vector2i(x + 70, y), value, colorSlot(colorName));
        }
    }

    /**
     * Draws a blinking cursor below the boot text. A bright square that's visible for half
     * a second and then off for half a second. (Old terminals worked exactly like this.)
     */
    renderBlinkingCursor() {
        const phase = Math.floor(BT.ticks() / CURSOR_BLINK_TICKS) % 2;
        if (phase === 0) {
            // The "I'm here" square. Sits one line below the last boot line.
            const lastLineY = TEXT_TOP + BOOT_LINES.length * LINE_HEIGHT;
            BT.drawRectFill(new Rect2i(TEXT_LEFT, lastLineY + 4, 7, 12), C_GREEN_BRIGHT);
        }
    }
}

bootstrap(Demo);

// #endregion
