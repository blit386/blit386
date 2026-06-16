/**
 * Snake - grid snake with walls, food, keyboard steering, and PipBoy CRT post-processing.
 *
 * Demo 029 in the Blit-Tech demo series.
 * Prerequisites:
 *   001-Basics         https://blit-tech-demos.vancura.dev/001-basics
 *   023-PipBoy CRT     https://blit-tech-demos.vancura.dev/023-crt-pipboy
 *   028-Keyboard Input https://blit-tech-demos.vancura.dev/028-keyboard-input
 *
 * Live version: https://blit-tech-demos.vancura.dev/029-snake-game
 *
 * Move with player 1 face buttons (W, A, S, D): Up, Down, Left, Right. Each food dot grows
 * the snake. Hitting the boundary wall or your own body ends the run; the game restarts after
 * two seconds. Gameplay uses rectangles; a short systemPrint note appears in software mode.
 *
 * Post-processing matches demo 023 when WebGPU is active. In software fallback mode the
 * snake game still runs; CRT effects are skipped and a short note is shown on canvas.
 *
 * WebGPU path: PixelGlitch on the logical index buffer, then palette resolve + upscale,
 * then display-tier barrel distortion, chromatic aberration, interference, rolling scan
 * line, scanlines, RGB mask, vignette, noise, flicker, bloom, and the glitch state machine.
 */

// @pageTitle Blit-Tech Demo 029 - Snake Game

import {
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
} from 'blit-tech';

import { isAvailable, SOFTWARE_FALLBACK_NOTE } from './shared/post-process-backend.js';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

/** @typedef {import('blit-tech').HardwareSettings} HardwareSettings */
/** @typedef {import('blit-tech').Palette} Palette */

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

// Fixed ticks between snake steps (lower = faster snake).
const MOVE_INTERVAL = 10;

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
 * Random integer from min through max inclusive.
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Random integer in [min, max) - used by glitch cooldown rolls (demo 023 style).
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randIntHalfOpen(min, max) {
    return min + Math.floor(Math.random() * (max - min));
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * @template T
 * @param {readonly T[]} arr
 * @returns {T}
 */
function randPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Minimal snake with PipBoy CRT post-processing from demo 023.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

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

    /** When true, the snake does not move until restart. */
    gameOver = false;

    /** Tick index when the snake died (`BT.ticks`); null while playing. */
    /** @type {number | null} */
    deathTick = null;

    // CRT effects (initialized in init())
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

    glitchActive = 0;

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

        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(25, 35, 45));
        this.palette.set(C_WALL, new Color32(180, 170, 140));
        this.palette.set(C_SNAKE, new Color32(90, 220, 120));
        this.palette.set(C_FOOD, new Color32(240, 90, 70));
        this.palette.set(C_FOOTER_DIM, new Color32(120, 130, 150));
        this.palette.set(C_FOOTER_WHITE, new Color32(220, 230, 240));

        BT.paletteSet(this.palette);

        this.effectsAvailable = isAvailable();

        if (!this.effectsAvailable) {
            this.startRound();
            return true;
        }

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

        this.glitchCooldown = randIntHalfOpen(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchActive = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;

        this.startRound();

        return true;
    }

    /**
     * Drive CRT animation and glitch machine every tick; run snake logic when alive.
     */
    update() {
        if (this.effectsAvailable) {
            this.tickCrtClock();
            this.tickGlitchMachine();
        }

        if (this.tickRestartAfterDeath()) {
            return;
        }

        this.pollDirectionInput();

        this.moveCooldown -= 1;

        if (this.moveCooldown > 0) {
            return;
        }

        this.moveCooldown = MOVE_INTERVAL;

        if (!(this.pendingDx === -this.dx && this.pendingDy === -this.dy)) {
            this.dx = this.pendingDx;
            this.dy = this.pendingDy;
        }

        this.step();
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
     * Reads player 1 face buttons and updates pending direction (no instant reverse).
     *
     * We use BT.isPressed (edge: up -> down this tick), not BT.isDown (held every tick).
     * That way one tap per direction per move interval feels like a classic D-pad.
     * The `this.dy !== 1` checks block a 180-degree turn: you cannot go straight back
     * into your body on the next step.
     */
    pollDirectionInput() {
        // Up: only if we are not currently moving down (would reverse into the tail).
        if (BT.isPressed(BT.BTN_UP, 0) && this.dy !== 1) {
            this.pendingDx = 0;
            this.pendingDy = -1;
        }

        // Down: only if we are not currently moving up.
        if (BT.isPressed(BT.BTN_DOWN, 0) && this.dy !== -1) {
            this.pendingDx = 0;
            this.pendingDy = 1;
        }

        // Left: only if we are not currently moving right.
        if (BT.isPressed(BT.BTN_LEFT, 0) && this.dx !== 1) {
            this.pendingDx = -1;
            this.pendingDy = 0;
        }

        // Right: only if we are not currently moving left.
        if (BT.isPressed(BT.BTN_RIGHT, 0) && this.dx !== -1) {
            this.pendingDx = 1;
            this.pendingDy = 0;
        }
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
        if (this.glitchActive > 0) {
            const t = 1 - this.glitchActive / this.glitchDuration;
            const envelope = Math.sin(t * Math.PI);

            this.applyGlitchUniforms(envelope);

            this.glitchActive--;

            if (this.glitchActive === 0) {
                this.resetGlitchUniforms();
                this.glitchCooldown = randIntHalfOpen(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }

            return;
        }

        this.glitchCooldown--;

        if (this.glitchCooldown <= 0) {
            this.glitchType = randPick(GLITCH_TYPES);
            this.glitchDuration = randIntHalfOpen(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
            this.glitchActive = this.glitchDuration;
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
     * Places a short snake in the middle and spawns the first food dot.
     */
    startRound() {
        this.gameOver = false;
        this.deathTick = null;
        this.moveCooldown = MOVE_INTERVAL;

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
            const x = randomInt(0, CELLS_X - 1);
            const y = randomInt(0, CELLS_Y - 1);
            const key = `${x},${y}`;

            if (!occupied.has(key)) {
                this.food = { x, y };

                return;
            }
        }

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
        BT.assignTag('Game over');
    }
}

bootstrap(Demo);
