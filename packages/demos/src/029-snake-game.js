/**
 * Snake - grid snake with walls, food, keyboard steering, and PipBoy CRT post-processing.
 *
 * Demo 029 in the BLIT386 demo series.
 * Prerequisites:
 *   001-Basics         https://demos.blit386.dev/001-basics
 *   023-PipBoy CRT     https://demos.blit386.dev/023-crt-pipboy
 *   028-Keyboard Input https://demos.blit386.dev/028-keyboard-input
 *
 * Live version: https://demos.blit386.dev/029-snake-game
 *
 * Move with WASD or the arrow keys (both are mapped to player 0 face buttons). On a phone
 * or tablet, steer with the on-screen D-pad in the bottom-right corner (it appears at the
 * first touch) or simply swipe anywhere in the direction you want to go - both come from
 * the shared UI kit in src/shared/ui.js. Each food dot grows the snake and makes it
 * one step faster. Hitting the boundary wall or your own body ends the run; the game
 * restarts after two seconds.
 * Gameplay uses rectangles; a short systemPrint note appears in software mode.
 *
 * Post-processing matches demo 023 when WebGPU is active. In software fallback mode the
 * snake game still runs; CRT effects are skipped and a short note is shown on canvas.
 *
 * WebGPU path: PixelGlitch on the logical index buffer, then palette resolve + upscale,
 * then display-tier barrel distortion, chromatic aberration, interference, rolling scan
 * line, scanlines, RGB mask, vignette, noise, flicker, bloom, and the glitch state machine.
 *
 * Eating food and dying both play a synthesized sound effect (built with AudioClip.synth(),
 * the same technique 041-Synth Toy explores in depth). An upbeat music loop plays in the
 * background; each food multiplies its playback rate so the beat climbs with snake length.
 */

import {
    AudioClip,
    BarrelDistortion,
    Bloom,
    bootstrap,
    BT,
    ChromaticAberration,
    Color32,
    Flicker,
    Interference,
    Noise,
    PixelGlitch,
    Rect2i,
    RGBMask,
    RollLine,
    Scanlines,
    Vector2i,
    Vignette,
} from 'blit386';

import { isAvailable, SOFTWARE_FALLBACK_NOTE } from './shared/post-process-backend.js';
import { randFloat, randInt, randIntInclusive, randPick } from './shared/rand.js';
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Palette indices (slot 0 reserved).
const C_BG = 1;
const C_WALL = 2;
const C_SNAKE = 3;
const C_FOOD = 4;
const C_FOOTER_DIM = 5;
const C_FOOTER_WHITE = 6;

// Logical resolution: small playfield as requested.
const DISPLAY_W = 160;
const DISPLAY_H = 120;

// Canvas output size: 4x logical resolution so display-tier CRT effects have enough pixels.
const OUTPUT_W = 640;
const OUTPUT_H = 480;

const TARGET_FPS = 60;

// Wall thickness in pixels (also one grid cell tall/wide).
const WALL = 8;

// Snake and food are drawn on a coarse grid so movement stays chunky and readable.
const CELL = 8;

// Inner playable area after subtracting the wall strip from each side.
const INNER_X0 = WALL;
const INNER_Y0 = WALL;
const INNER_W = DISPLAY_W - 2 * WALL;
const INNER_H = DISPLAY_H - 2 * WALL;

// How many cells fit inside the inner rectangle (should divide evenly).
const CELLS_X = INNER_W / CELL;
const CELLS_Y = INNER_H / CELL;

// Ticks between snake steps (lower = faster). A new round starts slow, then each food
// shortens the wait by MOVE_INTERVAL_STEP until MOVE_INTERVAL_MIN. At 60 FPS, 20 ticks
// is three steps per second; 4 ticks is fifteen steps per second.
const MOVE_INTERVAL_START = 20;
const MOVE_INTERVAL_MIN = 4;
const MOVE_INTERVAL_STEP = 1;

// Background-loop playback rate (Web Audio pitch). 1.0 is the file's natural tempo;
// higher values play faster and higher, like speeding up a cassette.
// MUSIC_PITCH_AT_START is the rate on a fresh round; each food multiplies that rate by
// MUSIC_PITCH_SCALE_PER_GROWTH (for example 0.57, then 0.57 * 1.03, then 0.57 * 1.03^2, ...).
const MUSIC_PITCH_AT_START = 0.57;
const MUSIC_PITCH_SCALE_PER_GROWTH = 1.03;

// How many growths it takes for moveInterval to reach MOVE_INTERVAL_MIN. Music pitch uses
// the same ceiling so the loop stops speeding up once the snake is already at top speed.
const MUSIC_PITCH_GROWTH_CAP = (MOVE_INTERVAL_START - MOVE_INTERVAL_MIN) / MOVE_INTERVAL_STEP;

// High enough that short eat / death blips never steal the looping music voice from the
// SFX pool (BT.soundPlay uses priority stealing when every voice is busy).
const MUSIC_VOICE_PRIORITY = 100;

// Soft glide when the loop speeds up or slows down after a food eat or a new round.
const MUSIC_PITCH_FADE_MS = 120;

// Two seconds at 60 ticks per second before a new round starts.
const RESTART_DELAY_TICKS = 120;

// CRT glitch state machine (same tuning as demo 023)
const GLITCH_COOLDOWN_MIN = 120;
const GLITCH_COOLDOWN_MAX = 360;
const GLITCH_ACTIVE_MIN = 5;
const GLITCH_ACTIVE_MAX = 30;

const GLITCH_TYPES = ['hshift', 'chromasplit', 'noise', 'flicker', 'interference'];

const GLITCH_INTENSITY_MIN = 0.35;
const GLITCH_INTENSITY_MAX = 1.0;

const FLICKER_BASE = 1.0;
const FLICKER_DIP = 0.6;

const ABERRATION_BASE = 0;
const NOISE_BASE = 0.025;

/**
 * Minimal snake with PipBoy CRT post-processing from demo 023.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    /** @type {AudioClip | null} Sound played when the snake eats food. */
    eatClip = null;

    /** @type {AudioClip | null} Sound played when the snake dies. */
    gameOverClip = null;

    /** @type {AudioClip | null} Looping background music. */
    musicClip = null;

    /**
     * Live handle for the looping music voice, or null before unlock / if music failed to
     * load. We use BT.soundPlay (not BT.musicPlay) so we can change pitch each time the
     * snake speeds up - the music player has volume and crossfade controls, but no pitch.
     *
     * @type {import('blit386').SoundRef | null}
     */
    musicRef = null;

    /** @type {{ x: number; y: number }[]} Head first, tail last (grid coords). */
    snake = [];

    /** @type {{ x: number; y: number }} Food cell in grid coords. */
    food = { x: 0, y: 0 };

    /** Current step direction (grid units per move). */
    dx = 1;

    dy = 0;

    /** Next direction chosen by the player (applied when the snake steps). */
    pendingDx = 1;

    pendingDy = 0;

    /** Counts ticks until the next snake step while the game is running. */
    moveCooldown = 0;

    /**
     * Current ticks between steps. Starts at MOVE_INTERVAL_START each round and drops
     * toward MOVE_INTERVAL_MIN every time the snake eats food.
     */
    moveInterval = MOVE_INTERVAL_START;

    /**
     * How many food dots the snake has eaten this round. Music pitch uses this count
     * capped at MUSIC_PITCH_GROWTH_CAP so tempo plateaus with move speed.
     */
    growthCount = 0;

    /** When true, the snake does not move until restart. */
    gameOver = false;

    /** @type {number | null} Tick index when the snake died (`BT.ticks`); null while playing. */
    deathTick = null;

    /** True when the WebGPU backend is active, so the CRT effect chain can run (set in init()). */
    effectsAvailable = false;

    // CRT effects (initialized in setupCrtEffects(), called from init())
    /** @type {PixelGlitch} */
    pixelGlitch;

    /** @type {BarrelDistortion} */
    barrel;

    /** @type {ChromaticAberration} */
    aberration;

    /** @type {Interference} */
    interference;

    /** @type {RollLine} */
    rollLine;

    /** @type {Scanlines} */
    scanlines;

    /** @type {RGBMask} */
    mask;

    /** @type {Vignette} */
    vignette;

    /** @type {Noise} */
    noise;

    /** @type {Flicker} */
    flicker;

    /** @type {Bloom} */
    bloom;

    glitchCooldown = 0;

    /** How many ticks remain in the current glitch burst; 0 means no glitch is running. */
    glitchTicksLeft = 0;

    glitchDuration = 0;

    /** @type {string} */
    glitchType = 'none';

    glitchPeak = 0;

    /**
     * 160x120 framebuffer, 4x upscale for CRT chain, 60 fixed updates per second.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),
            maxCanvasSize: new Vector2i(OUTPUT_W, OUTPUT_H),
            outputUpscaleFilter: 'nearest',
            targetFPS: TARGET_FPS,

            // Phones and tablets dim, then lock, the screen after 30-60 seconds without a touch -
            // annoying mid-game when you are only pressing arrow keys or swiping every few seconds.
            // This asks the browser to keep the screen on while you are playing. Browsers that do
            // not support the request just ignore it, so this is safe everywhere.
            isWakeLockEnabled: true,

            // Arrow keys (and Space) normally scroll the page. This demo maps those keys to move
            // the snake, so opt in so the browser does not scroll the demo page while you play.
            isCapturingKeyboardScroll: true,

            // Hide the small "~" toggle hint in the bottom-left corner so the game
            // board stays clean. Players who want the stats overlay can still press
            // the Backquote key (`) to show it and press ` again to hide it - hiding
            // the hint does not turn the overlay off.
            isOverlayToggleHintVisible: false,

            overlayStyle: {
                barPaletteIndex: C_BG,
                textPaletteIndex: C_FOOTER_WHITE,
                gapPaletteIndex: C_BG,
            },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_SNAKE,
                renderBarPaletteIndex: C_FOOD,
                warningPaletteIndex: C_FOOTER_DIM,
                errorPaletteIndex: C_WALL,
                tagPaletteIndex: C_FOOTER_WHITE,
            },
        };
    }

    /**
     * Palette, PipBoy CRT stack (023), glitch machine, then first round.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // Start from default keyboard maps so this demo stays independent from remapping demos.
        BT.inputMapReset();

        // Engine defaults put WASD on player 0 and arrows on player 1. This is a single-player
        // game, so fold both layouts into player 0: either set of keys steers the same snake.
        // BT.inputMap replaces the whole key list for that button; listing both codes means
        // either key counts (logical OR), the same pattern demo 030 shows with Q|E for LEFT.
        BT.inputMap(0, BT.BTN_UP, 'KeyW', 'ArrowUp');
        BT.inputMap(0, BT.BTN_DOWN, 'KeyS', 'ArrowDown');
        BT.inputMap(0, BT.BTN_LEFT, 'KeyA', 'ArrowLeft');
        BT.inputMap(0, BT.BTN_RIGHT, 'KeyD', 'ArrowRight');

        // BT.synthPreset bundles ready-tuned sound recipes (041-Synth Toy explores all six).
        // Rendering them once here means eating and dying play back with zero delay later.
        this.eatClip = await AudioClip.synth(BT.synthPreset.pickup());
        this.gameOverClip = await AudioClip.synth(BT.synthPreset.explosion());

        // The background music file is loaded separately from the sound effects above, and
        // wrapped in its own try/catch. Unlike the effects (built on the spot by the synth
        // engine, so they cannot fail), this loads an actual audio file over the network -
        // if it is missing or the browser cannot decode it, we do not want that one file to
        // stop the whole game from starting. Catching the error here means Snake stays fully
        // playable with sound effects but no music, instead of getting stuck on a blank
        // screen.
        //
        // We only load here - we do not call BT.soundPlay yet. Browsers keep audio locked
        // until the first click or key press, and unlike BT.musicPlay (which remembers a
        // request while locked), BT.soundPlay would be dropped. update() starts the loop
        // the moment BT.isAudioUnlocked flips true.
        try {
            this.musicClip = await AudioClip.load('/audio/music-upbeat.wav');
        } catch (error) {
            console.warn('Snake Game: failed to load background music, continuing without it.', error);
        }

        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(25, 35, 45));
        this.palette.set(C_WALL, new Color32(180, 170, 140));
        this.palette.set(C_SNAKE, new Color32(90, 220, 120));
        this.palette.set(C_FOOD, new Color32(240, 90, 70));
        this.palette.set(C_FOOTER_DIM, new Color32(120, 130, 150));
        this.palette.set(C_FOOTER_WHITE, new Color32(220, 230, 240));

        // The shared UI kit draws the touch D-pad, and it needs its theme colors in the
        // palette. applyTheme() writes them into high slots (240 and up), far away from the
        // six scene colors above, so the game's look does not change at all.
        applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // CRT post-processing needs WebGPU. In software fallback mode we skip the whole
        // effect chain - the snake game itself still runs fine without it.
        this.effectsAvailable = isAvailable();

        if (this.effectsAvailable) {
            this.setupCrtEffects();
        }

        this.startRound();

        return true;
    }

    /**
     * Drive CRT animation and glitch machine every tick; run snake logic when alive.
     */
    update() {
        // The UI kit's once-per-tick housekeeping: it tracks touch contacts for the D-pad
        // and watches for swipe gestures. Always the first line of update().
        ui.tick();

        // Start (or restart) the tempo-linked music loop once audio is unlocked.
        this.ensureBackgroundMusic();

        // Did a swipe finish on this tick? ui.swipe() answers with a direction name
        // ('up', 'down', 'left', 'right') or null. We read it once and hand it to the
        // steering code below, next to the keyboard and D-pad checks.
        const swipe = ui.swipe();

        if (this.effectsAvailable) {
            this.tickCrtClock();
            this.tickGlitchMachine();
        }

        if (this.tickRestartAfterDeath()) {
            return;
        }

        this.pollDirectionInput(swipe);

        this.moveCooldown -= 1;

        if (this.moveCooldown > 0) {
            return;
        }

        // Use the live interval so food-driven speed-ups take effect on the next step.
        this.moveCooldown = this.moveInterval;

        if (!(this.pendingDx === -this.dx && this.pendingDy === -this.dy)) {
            this.dx = this.pendingDx;
            this.dy = this.pendingDy;
        }

        this.step();
    }

    /**
     * Clear to background, draw walls, food, snake segments.
     */
    render() {
        BT.clear(C_BG);

        this.renderWalls();

        if (this.food.x >= 0 && this.food.y >= 0) {
            BT.drawRectFill(this.gridRect(this.food.x, this.food.y), C_FOOD);
        }

        for (let i = 0; i < this.snake.length; i++) {
            const seg = this.snake[i];
            BT.drawRectFill(this.gridRect(seg.x, seg.y), C_SNAKE);
        }

        if (!this.effectsAvailable) {
            BT.systemPrint(new Vector2i(INNER_X0, DISPLAY_H - 16), C_FOOTER_DIM, SOFTWARE_FALLBACK_NOTE);
        }

        // Browsers keep all sound muted until the player clicks or presses a key. This
        // shared row shows a warm "enable sound" hint only while audio is still locked,
        // then disappears on its own the moment a first move unlocks it - which is also
        // the same gesture that starts the snake moving, so the hint is usually only
        // visible for a single frame. The default sentence is too long for this 160-wide
        // playfield, so we pass a short override.
        ui.begin('topLeft', { margin: 3 });
        ui.audioUnlockHint({ text: 'Click for sound' });
        ui.end();

        // The touch D-pad, drawn over the playfield in the bottom-right corner. It stays
        // invisible until the first touch contact, so mouse-and-keyboard players never see
        // it. This playfield is only 160x120 logical pixels, so the keys are scaled down
        // from the kit's phone-sized default.
        ui.dpadWidget({ size: 22, gap: 3, margin: 4 });
    }

    /**
     * Builds the WebGPU CRT effect chain (same stack and tuning as demo 023) and seeds
     * the glitch state machine. Called from init() only when WebGPU is active.
     */
    setupCrtEffects() {
        // Pixel-tier glitch (same role as demo 023).
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = 6;
        this.pixelGlitch.intensity = 0;
        BT.effectAdd(this.pixelGlitch);

        this.barrel = new BarrelDistortion();
        this.barrel.curvature = 0.2;

        this.aberration = new ChromaticAberration();
        this.aberration.aberration = ABERRATION_BASE;

        this.interference = new Interference();
        this.interference.amount = 0;

        this.rollLine = new RollLine();
        this.rollLine.amount = 0.1;
        this.rollLine.speed = 1.0;

        this.scanlines = new Scanlines();
        this.scanlines.amount = 0.55;
        this.scanlines.strength = -8;
        this.scanlines.density = DISPLAY_H;

        this.mask = new RGBMask();
        this.mask.intensity = 0.18;
        this.mask.size = 6;
        this.mask.border = 0.5;

        this.vignette = new Vignette();
        this.vignette.amount = 0.35;

        this.noise = new Noise();
        this.noise.amount = NOISE_BASE;

        this.flicker = new Flicker();
        this.flicker.amount = FLICKER_BASE;

        this.bloom = new Bloom();
        this.bloom.spread = 3.0;
        this.bloom.glow = 0.18;

        for (const fx of [
            this.barrel,
            this.aberration,
            this.interference,
            this.rollLine,
            this.scanlines,
            this.mask,
            this.vignette,
            this.noise,
            this.flicker,
            this.bloom,
        ]) {
            BT.effectAdd(fx);
        }

        this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchTicksLeft = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;
    }

    /**
     * While game over, waits for the restart delay then starts a new round.
     *
     * @returns {boolean} True when the snake should not move this tick.
     */
    tickRestartAfterDeath() {
        if (!this.gameOver) {
            return false;
        }

        const tick = BT.ticks;

        if (this.deathTick !== null && tick - this.deathTick >= RESTART_DELAY_TICKS) {
            this.startRound();
        }
        return true;
    }

    /**
     * Reads all three steering inputs and updates pending direction (no instant reverse):
     * player 0 face buttons (WASD, arrows, or gamepad), the on-screen touch D-pad, and swipes.
     *
     * We use BT.isPressed (edge: up -> down this tick), not BT.isDown (held every tick),
     * and the D-pad's matching ui.dpad.isPressed. That way one tap per direction per move
     * interval feels like a classic D-pad. The `this.dy !== 1` checks block a 180-degree
     * turn: you cannot go straight back into your body on the next step.
     *
     * @param {'up' | 'down' | 'left' | 'right' | null} swipe - The swipe finished this
     *   tick, if any (from ui.swipe() in update()).
     */
    pollDirectionInput(swipe) {
        // Up: only if we are not currently moving down (would reverse into the tail).
        if (this.isSteerPressed(BT.BTN_UP, 'up', swipe) && this.dy !== 1) {
            this.pendingDx = 0;
            this.pendingDy = -1;
        }

        // Down: only if we are not currently moving up.
        if (this.isSteerPressed(BT.BTN_DOWN, 'down', swipe) && this.dy !== -1) {
            this.pendingDx = 0;
            this.pendingDy = 1;
        }

        // Left: only if we are not currently moving right.
        if (this.isSteerPressed(BT.BTN_LEFT, 'left', swipe) && this.dx !== 1) {
            this.pendingDx = -1;
            this.pendingDy = 0;
        }

        // Right: only if we are not currently moving left.
        if (this.isSteerPressed(BT.BTN_RIGHT, 'right', swipe) && this.dx !== -1) {
            this.pendingDx = 1;
            this.pendingDy = 0;
        }
    }

    /**
     * Combines the three ways to steer in one direction: the engine face button (keyboard
     * or gamepad), the on-screen touch D-pad key, and a swipe that way.
     *
     * @param {number} button - The engine face button mask (BT.BTN_UP and friends).
     * @param {'up' | 'down' | 'left' | 'right'} dir - The D-pad/swipe direction name.
     * @param {'up' | 'down' | 'left' | 'right' | null} swipe - The swipe finished this tick.
     * @returns {boolean} True when any of the three pressed that direction this tick.
     */
    isSteerPressed(button, dir, swipe) {
        return BT.isPressed(button, 0) || ui.dpad.isPressed(dir) || swipe === dir;
    }

    /**
     * Updates time-driven uniforms for rolling noise, interference, and roll line.
     */
    tickCrtClock() {
        const seconds = BT.ticks / TARGET_FPS;

        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;
    }

    /**
     * Same state machine as demo 023: cooldown, burst envelope, random glitch type.
     */
    tickGlitchMachine() {
        // A burst is running while there are ticks left on its countdown.
        if (this.glitchTicksLeft > 0) {
            const t = 1 - this.glitchTicksLeft / this.glitchDuration;
            const envelope = Math.sin(t * Math.PI);

            this.applyGlitchUniforms(envelope);

            this.glitchTicksLeft--;

            // Countdown just hit zero: the burst is over, so calm the effects down
            // and roll a fresh cooldown until the next burst.
            if (this.glitchTicksLeft === 0) {
                this.resetGlitchUniforms();
                this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }

            return;
        }

        this.glitchCooldown--;

        if (this.glitchCooldown <= 0) {
            this.glitchType = randPick(GLITCH_TYPES);
            this.glitchDuration = randInt(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
            this.glitchTicksLeft = this.glitchDuration;
            this.glitchPeak = randFloat(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
            this.pixelGlitch.seed = Math.random() * 1000;
        }
    }

    /**
     * @param {number} envelope - 0 -> 1 -> 0 over the glitch burst.
     */
    applyGlitchUniforms(envelope) {
        const peak = this.glitchPeak * envelope;

        this.resetGlitchUniforms();

        if (this.glitchType === 'hshift') {
            this.pixelGlitch.intensity = peak;
        } else if (this.glitchType === 'chromasplit') {
            this.aberration.aberration = ABERRATION_BASE + peak * 4;
        } else if (this.glitchType === 'noise') {
            this.noise.amount = NOISE_BASE + peak * 0.08;
        } else if (this.glitchType === 'flicker') {
            this.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
        } else if (this.glitchType === 'interference') {
            this.interference.amount = peak * 0.06;
        }
    }

    resetGlitchUniforms() {
        this.pixelGlitch.intensity = 0;
        this.aberration.aberration = ABERRATION_BASE;
        this.noise.amount = NOISE_BASE;
        this.flicker.amount = FLICKER_BASE;
        this.interference.amount = 0;
    }

    /**
     * Pixel rectangle for one grid cell at (gx, gy), inside the inner playfield.
     *
     * @param {number} gx
     * @param {number} gy
     * @returns {Rect2i}
     */
    gridRect(gx, gy) {
        const px = INNER_X0 + gx * CELL;
        const py = INNER_Y0 + gy * CELL;

        return new Rect2i(px, py, CELL, CELL);
    }

    /**
     * Four filled bars form the boundary the snake must not cross.
     */
    renderWalls() {
        BT.drawRectFill(new Rect2i(0, 0, DISPLAY_W, WALL), C_WALL);
        BT.drawRectFill(new Rect2i(0, DISPLAY_H - WALL, DISPLAY_W, WALL), C_WALL);
        BT.drawRectFill(new Rect2i(0, WALL, WALL, DISPLAY_H - 2 * WALL), C_WALL);
        BT.drawRectFill(new Rect2i(DISPLAY_W - WALL, WALL, WALL, DISPLAY_H - 2 * WALL), C_WALL);
    }

    /**
     * Playback rate for the background loop from the starting pitch and how many times
     * the snake has grown this round. One food is start * scale, two foods is
     * start * scale * scale, and so on; zero growths leaves the rate at the start pitch.
     * Growth above MUSIC_PITCH_GROWTH_CAP no longer raises the rate (matches top speed).
     *
     * @returns {number} Playback rate to pass to BT.soundPlay / BT.soundPitchSet.
     */
    currentMusicPitch() {
        // The ** operator is "to the power of": a ** b means a multiplied by itself b times.
        // growthCount 0 gives 1, so the rate stays at MUSIC_PITCH_AT_START on a fresh round.
        // Cap at MUSIC_PITCH_GROWTH_CAP so pitch plateaus with moveInterval at top speed.
        const growthForPitch = Math.min(this.growthCount, MUSIC_PITCH_GROWTH_CAP);

        return MUSIC_PITCH_AT_START * MUSIC_PITCH_SCALE_PER_GROWTH ** growthForPitch;
    }

    /**
     * Starts the looping music voice once audio is unlocked, or restarts it if the voice
     * was somehow lost. Safe to call every tick - it no-ops while already playing.
     *
     * Why BT.soundPlay instead of BT.musicPlay: only the SFX path exposes pitch (playback
     * rate), which is how we keep the beat tied to snake growth. The tradeoff is that
     * soundPlay is dropped before unlock, so we wait for BT.isAudioUnlocked here.
     */
    ensureBackgroundMusic() {
        if (this.musicClip === null || !BT.isAudioUnlocked) {
            return;
        }

        // Already have a live looping voice - nothing to do.
        if (this.musicRef !== null && BT.isSoundPlaying(this.musicRef)) {
            return;
        }

        // Start (or restart) at the pitch for the current growth count.
        this.musicRef = BT.soundPlay(this.musicClip, {
            loop: true,
            volume: 0.65,
            pitch: this.currentMusicPitch(),
            priority: MUSIC_VOICE_PRIORITY,
        });
    }

    /**
     * Glides the live music loop to the playback rate for the current growth count.
     * No-op before the loop has started (still locked, or music failed to load).
     */
    syncMusicTempo() {
        if (this.musicRef === null || !BT.isSoundPlaying(this.musicRef)) {
            return;
        }

        BT.soundPitchSet(this.musicRef, this.currentMusicPitch(), {
            fadeMs: MUSIC_PITCH_FADE_MS,
        });
    }

    /**
     * Places a short snake in the middle, resets speed to the slow start, and spawns
     * the first food dot.
     */
    startRound() {
        this.gameOver = false;
        this.deathTick = null;

        // Every new round begins at the slow pace; eating food will speed things up again.
        this.moveInterval = MOVE_INTERVAL_START;
        this.moveCooldown = this.moveInterval;

        // Zero foods eaten - music returns to MUSIC_PITCH_AT_START for the new round.
        this.growthCount = 0;
        this.syncMusicTempo();

        const midX = Math.floor(CELLS_X / 2);
        const midY = Math.floor(CELLS_Y / 2);

        this.snake = [
            { x: midX, y: midY },
            { x: midX - 1, y: midY },
            { x: midX - 2, y: midY },
        ];

        this.dx = 1;
        this.dy = 0;
        this.pendingDx = 1;
        this.pendingDy = 0;

        this.placeFood();
        BT.assignTag('Round start');
    }

    /**
     * Picks a random empty grid cell for food.
     */
    placeFood() {
        const occupied = new Set();

        for (let i = 0; i < this.snake.length; i++) {
            const s = this.snake[i];
            occupied.add(`${s.x},${s.y}`);
        }

        for (let attempt = 0; attempt < 4000; attempt++) {
            const x = randIntInclusive(0, CELLS_X - 1);
            const y = randIntInclusive(0, CELLS_Y - 1);
            const key = `${x},${y}`;

            if (!occupied.has(key)) {
                this.food = { x, y };

                return;
            }
        }

        // Board full - no free cell found; (-1, -1) is a sentinel that render() sees and skips drawing the food dot.
        this.food = { x: -1, y: -1 };
    }

    /**
     * One grid step: wall check, self check, grow or shift tail.
     */
    step() {
        const head = this.snake[0];
        const nx = head.x + this.dx;
        const ny = head.y + this.dy;

        if (nx < 0 || nx >= CELLS_X || ny < 0 || ny >= CELLS_Y) {
            this.endGame();

            return;
        }

        const eating = nx === this.food.x && ny === this.food.y;

        const limit = eating ? this.snake.length : this.snake.length - 1;

        for (let i = 0; i < limit; i++) {
            const s = this.snake[i];

            if (s.x === nx && s.y === ny) {
                this.endGame();

                return;
            }
        }

        this.snake.unshift({ x: nx, y: ny });

        if (eating) {
            BT.soundPlay(this.eatClip);

            // Shorter wait between steps = faster snake. Clamp so it never goes below
            // MOVE_INTERVAL_MIN; Math.max picks the larger of the floor and the stepped-down
            // value, which is how we stop the interval from dropping into the negatives.
            this.moveInterval = Math.max(MOVE_INTERVAL_MIN, this.moveInterval - MOVE_INTERVAL_STEP);

            // Keep counting every food for length / UI; currentMusicPitch() caps the exponent
            // at MUSIC_PITCH_GROWTH_CAP so tempo stops climbing once speed has already maxed out.
            this.growthCount += 1;
            this.syncMusicTempo();

            this.placeFood();
        } else {
            this.snake.pop();
        }
    }

    /**
     * Freeze movement and remember when to restart.
     */
    endGame() {
        this.gameOver = true;
        this.deathTick = BT.ticks;
        BT.soundPlay(this.gameOverClip);
        BT.assignTag('Game over');
    }
}

bootstrap(Demo);
