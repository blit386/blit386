/*

Snake Game: grid snake with walls, food, three ways to steer, and a PipBoy CRT finish.
@description Grid snake with walls, food, keyboard, D-pad, and swipe steering, plus PipBoy CRT post-processing.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - PipBoy CRT: https://demos.blit386.dev/crt-pipboy
  - Keyboard Input: https://demos.blit386.dev/keyboard-input

Live version: https://demos.blit386.dev/snake-game

Guides:
  - Input: https://blit386.dev/docs/guides/input#keyboard
  - Post-Process Effects: https://blit386.dev/docs/guides/post-process-effects#display-tier-effects
  - Audio: https://blit386.dev/docs/guides/audio#playing-sfx
  - Random: https://blit386.dev/docs/guides/random#deterministic-by-default
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Audio: https://blit386.dev/docs/api/audio#playback-sfx
  - Overlay: https://blit386.dev/docs/api/overlay#event-tags

---

WHAT YOU WILL SEE
-----------------

A small 160x120 playfield, shown at 4x size, framed by a sand-colored wall. A green snake
three cells long starts in the middle heading right, and a red food dot sits somewhere on
the grid. Eating the dot grows the snake by one cell and shortens the wait between steps
by one tick (from 20 ticks down to a floor of 4), so the snake gets faster and faster.
Hitting the wall or your own body ends the round; two seconds later a new one starts.

When WebGPU is active, the whole picture goes through the PipBoy CRT chain from the
PipBoy CRT demo: a pixel-tier PixelGlitch on the index buffer, then palette resolve and
upscale, then display-tier barrel distortion, chromatic aberration, interference, a
rolling scan line, scanlines, an RGB mask, vignette, noise, flicker, and bloom. Every few
seconds a random glitch burst (horizontal tear, chroma split, snow, brightness waver, or
ghosting) sweeps the screen. When the player prefers reduced motion, the grain, the
brightness flicker, the rolling band, the row jitter, and the glitch bursts are left out.
In software fallback mode the game runs without the effects, and a short note at the
bottom of the playfield says so.

Eating and dying each play a synthesized sound effect, and an upbeat music loop plays in
the background. Each food eaten nudges the loop's playback rate up by 3 percent, so the
beat climbs with the snake's length. On a touchscreen a D-pad appears in the bottom-right
corner after the first touch.

WHAT YOU WILL LEARN
-------------------

- keyboardLayout: 'single' in configure() puts both WASD and the arrow keys on player 0,
  the one-player layout (the default gives the arrows to player 1).
- BT.isPressed(button, 0) as an edge (true once per key press), combined with the shared
  UI kit's ui.dpad.isPressed(dir) and ui.swipe() so one check covers all three inputs.
- A tick-driven game: BT.ticks for the restart timer, a step cooldown that shrinks as the
  snake grows, and a pending direction that blocks 180-degree turns.
- The same CRT effect chain as the PipBoy CRT demo, built by createPipboyChain() from
  src/shared/crt-glitch.js and gated on isAvailable() from
  src/shared/post-process-backend.js so the game still runs in software mode.
- The PipBoy demo's glitch state machine, shared as stepGlitchMachine(), and
  BT.isReducedMotionPreferred: applyCrtChain() leaves the moving effects out, and
  onReducedMotionChange() rebuilds the chain when the preference changes mid-game.
- BT.synthPreset.pickup() and BT.synthPreset.explosion() rendered once with
  AudioClip.synth(), then played with BT.soundPlay().
- Music through BT.soundPlay(clip, { loop, volume, pitch, priority }) instead of
  BT.musicPlay(), because only the SFX path exposes pitch, changed live with
  BT.soundPitchSet(ref, rate, { fadeMs }).
- configure() flags: isWakeLockEnabled so phones stay awake, isOverlayToggleHintVisible:
  false to hide the overlay hint, and overlayStyle to color the overlay bars with scene
  slots. keyboardLayout: 'single' also stops the arrows scrolling the page.

TRY THIS
--------

- Steer with W, A, S, D or the arrow keys. A key press counts once, so tap, do not hold.
- On a phone or tablet, tap the D-pad keys in the bottom-right corner, or swipe anywhere
  on the playfield in the direction you want to go.
- Eat a few dots and listen: the music speeds up a little with every one, and resets
  when a new round starts.
- Press the backquote key (`) to open the engine overlay (its corner hint is hidden
  here). "Round start" and "Game over" tags land on the timing chart.
- Add ?backend=software to the URL to see the game without the CRT chain.

*/

import { AudioClip, bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import {
    applyCrtChain,
    createPipboyChain,
    GLITCH_COOLDOWN_MAX,
    GLITCH_COOLDOWN_MIN,
    GLITCH_TYPE,
    resetGlitchUniforms,
    stepGlitchMachine,
} from './shared/crt-glitch.js';
import { isAvailable } from './shared/post-process-backend.js';
import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// Palette slots for the scene (slot 0 is reserved as transparent).
const C_BG = 1;
const C_WALL = 2;
const C_SNAKE = 3;
const C_FOOD = 4;
const C_FOOTER_DIM = 5;
const C_FOOTER_WHITE = 6;

// Logical resolution: a small playfield.
const DISPLAY_W = 160;
const DISPLAY_H = 120;

// Canvas output size: 4x the logical resolution, so the display-tier CRT effects have
// enough pixels to work with.
const OUTPUT_W = 640;
const OUTPUT_H = 480;

const TARGET_FPS = 60;

// Wall thickness in pixels (also one grid cell tall and wide).
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
// shortens the wait by MOVE_INTERVAL_STEP until MOVE_INTERVAL_MIN. At 60 ticks per
// second, 20 ticks is three steps per second; 4 ticks is fifteen steps per second.
const MOVE_INTERVAL_START = 20;
const MOVE_INTERVAL_MIN = 4;
const MOVE_INTERVAL_STEP = 1;

// Background-loop playback rate (Web Audio pitch). 1.0 is the file's natural tempo;
// higher values play faster and higher, like speeding up a cassette.
// MUSIC_PITCH_AT_START is the rate on a fresh round; each food multiplies that rate by
// MUSIC_PITCH_SCALE_PER_GROWTH (so 0.57, then 0.57 * 1.03, then 0.57 * 1.03 * 1.03, ...).
const MUSIC_PITCH_AT_START = 0.57;
const MUSIC_PITCH_SCALE_PER_GROWTH = 1.03;

// How many growths it takes for moveInterval to reach MOVE_INTERVAL_MIN. Music pitch uses
// the same ceiling so the loop stops speeding up once the snake is already at top speed.
const MUSIC_PITCH_GROWTH_CAP = (MOVE_INTERVAL_START - MOVE_INTERVAL_MIN) / MOVE_INTERVAL_STEP;

// High enough that short eat and death blips never steal the looping music voice from
// the SFX pool (BT.soundPlay uses priority stealing when every voice is busy).
const MUSIC_VOICE_PRIORITY = 100;

// Soft glide when the loop speeds up or slows down after a food eat or a new round.
const MUSIC_PITCH_FADE_MS = 120;

// Two seconds at 60 ticks per second before a new round starts.
const RESTART_DELAY_TICKS = 120;

// The software-mode note, in lines short enough for the 160-pixel playfield (the shared
// SOFTWARE_FALLBACK_LINES are up to 168 pixels wide in the 6-pixel font).
const SOFTWARE_NOTE_LINES = ['Software renderer:', 'no CRT effects.'];

// How strongly the CRT glass bends: 0.2, a deeper curve than the PipBoy CRT demo's 0.05.
// 0 would be a perfectly flat screen.
const CRT_CURVATURE = 0.2;

// Minimal snake with the PipBoy CRT post-processing stack from the PipBoy CRT demo.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Sound played when the snake eats food.
    /** @type {AudioClip | null} */
    eatClip = null;

    // Sound played when the snake dies.
    /** @type {AudioClip | null} */
    gameOverClip = null;

    // Looping background music.
    /** @type {AudioClip | null} */
    musicClip = null;

    // Live handle for the looping music voice, or null before unlock or if the music
    // failed to load. We use BT.soundPlay (not BT.musicPlay) so we can change pitch each
    // time the snake speeds up - the music player has volume and crossfade controls, but
    // no pitch.
    /** @type {import('blit386').SoundRef | null} */
    musicRef = null;

    // Head first, tail last (grid coordinates).
    /** @type {{ x: number; y: number }[]} */
    snake = [];

    // Food cell in grid coordinates.
    /** @type {{ x: number; y: number }} */
    food = { x: 0, y: 0 };

    // Current step direction (grid units per move).
    dx = 1;

    dy = 0;

    // Next direction chosen by the player (applied when the snake steps).
    pendingDx = 1;

    pendingDy = 0;

    // Counts ticks until the next snake step while the game is running.
    moveCooldown = 0;

    // Current ticks between steps. Starts at MOVE_INTERVAL_START each round and drops
    // toward MOVE_INTERVAL_MIN every time the snake eats food.
    moveInterval = MOVE_INTERVAL_START;

    // How many food dots the snake has eaten this round. Music pitch uses this count
    // capped at MUSIC_PITCH_GROWTH_CAP so tempo plateaus with move speed.
    growthCount = 0;

    // When true, the snake does not move until restart.
    gameOver = false;

    // Tick index when the snake died (BT.ticks); null while playing.
    /** @type {number | null} */
    deathTick = null;

    // True when the WebGPU backend is active, so the CRT effect chain can run (set in
    // init()).
    effectsAvailable = false;

    // CRT effects. createPipboyChain() in setupCrtEffects() (WebGPU only) stores each one
    // on the demo by name (pixelGlitch, barrel, noise, ...), and crtEffects keeps the
    // display-tier ones in chain order so applyCrtChain() can rebuild the chain.
    crtEffects = [];

    // Ticks until the next glitch burst may start.
    glitchCooldown = 0;

    // How many ticks remain in the current glitch burst; 0 means no glitch is running.
    glitchTicksLeft = 0;

    // Total length of the current burst in ticks, used to shape its envelope.
    glitchDuration = 0;

    // Which glitch is running - a key from GLITCH_TYPES_CHROMA, or GLITCH_TYPE.NONE.
    /** @type {string} */
    glitchType = GLITCH_TYPE.NONE;

    // Peak intensity of the current burst, from GLITCH_INTENSITY_MIN to MAX.
    glitchPeak = 0;

    // 160x120 framebuffer, 4x upscale for the CRT chain, 60 fixed updates per second.
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            drawingBufferSize: new Vector2i(OUTPUT_W, OUTPUT_H),
            maxCanvasSize: new Vector2i(OUTPUT_W, OUTPUT_H),
            outputUpscaleFilter: 'nearest',
            targetFPS: TARGET_FPS,

            // Phones and tablets dim, then lock, the screen after 30-60 seconds without a
            // touch - annoying mid-game when you are only pressing arrow keys or swiping
            // every few seconds. This asks the browser to keep the screen on while you
            // are playing. Browsers that do not support the request just ignore it, so
            // this is safe everywhere.
            isWakeLockEnabled: true,

            // A one-player game: WASD and the arrow keys both steer player 0. Without
            // this the arrows belong to player 1. It also stops them scrolling the page.
            keyboardLayout: 'single',

            // Hide the small "~" toggle hint in the bottom-left corner so the game board
            // stays clean. Players who want the stats overlay can still press the
            // backquote key (`) to show it and press ` again to hide it - hiding the hint
            // does not turn the overlay off.
            isOverlayToggleHintVisible: false,

            // The overlay bars and the timing chart borrow the scene's own palette slots
            // so the overlay matches the game's look.
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

    // Sounds, palette, the PipBoy CRT stack, the glitch machine, then the first round.
    async init() {
        // BT.synthPreset bundles ready-tuned sound recipes (Synth Toy explores all six).
        // Rendering them once here means eating and dying play back with zero delay
        // later.
        this.eatClip = await AudioClip.synth(BT.synthPreset.pickup());
        this.gameOverClip = await AudioClip.synth(BT.synthPreset.explosion());

        // The background music file is loaded separately from the sound effects above,
        // and wrapped in its own try/catch. Unlike the effects (built on the spot by the
        // synth engine, so they cannot fail), this loads an actual audio file over the
        // network - if it is missing or the browser cannot decode it, we do not want that
        // one file to stop the whole game from starting. Catching the error here means
        // Snake stays fully playable with sound effects but no music, instead of getting
        // stuck on a blank screen.
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

        // The six scene colors: dark blue-gray background, sand wall, green snake, red
        // food, and two footer text shades.
        this.palette.set(C_BG, new Color32(25, 35, 45));
        this.palette.set(C_WALL, new Color32(180, 170, 140));
        this.palette.set(C_SNAKE, new Color32(90, 220, 120));
        this.palette.set(C_FOOD, new Color32(240, 90, 70));
        this.palette.set(C_FOOTER_DIM, new Color32(120, 130, 150));
        this.palette.set(C_FOOTER_WHITE, new Color32(220, 230, 240));

        // The shared UI kit draws the touch D-pad, and it needs its theme colors in the
        // palette. applyTheme() writes them into high slots (240 and up), far away from
        // the six scene colors above, so the game's look does not change at all.
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

    // Drives the CRT animation and glitch machine every tick; runs snake logic when
    // alive.
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

        // The glitch bursts stay off while the player prefers reduced motion.
        if (this.effectsAvailable) {
            this.tickCrtClock();

            if (!BT.isReducedMotionPreferred) {
                stepGlitchMachine(this);
            }
        }

        if (this.tickRestartAfterDeath()) {
            return;
        }

        this.pollDirectionInput(swipe);

        // Count down to the next step; nothing else happens until the cooldown runs out.
        this.moveCooldown -= 1;

        if (this.moveCooldown > 0) {
            return;
        }

        // Use the live interval so food-driven speed-ups take effect on the next step.
        this.moveCooldown = this.moveInterval;

        // Apply the player's pending direction, unless it is the exact opposite of the
        // current one - a snake cannot reverse into its own neck.
        if (!(this.pendingDx === -this.dx && this.pendingDy === -this.dy)) {
            this.dx = this.pendingDx;
            this.dy = this.pendingDy;
        }

        this.step();
    }

    // Clears to the background, then draws the walls, the food, the snake segments, the
    // software-mode note, the audio hint, and the touch D-pad.
    render() {
        BT.clear(C_BG);

        this.renderWalls();

        // (-1, -1) is the "board is full" sentinel from placeFood(); skip the dot then.
        if (this.food.x >= 0 && this.food.y >= 0) {
            BT.drawRectFill(this.gridRect(this.food.x, this.food.y), C_FOOD);
        }

        // One filled cell per segment, head first.
        for (let i = 0; i < this.snake.length; i++) {
            const seg = this.snake[i];
            BT.drawRectFill(this.gridRect(seg.x, seg.y), C_SNAKE);
        }

        // In software mode, say why there is no CRT look: two short kit labels in the
        // bottom-left corner of the playfield, one per line, since kit labels do not
        // wrap. A margin of one wall width keeps them off the sand-colored wall.
        if (!this.effectsAvailable) {
            ui.begin(UI_ANCHORS.BOTTOM_LEFT, { margin: WALL });

            for (const line of SOFTWARE_NOTE_LINES) {
                ui.label(line, { color: 'dim' });
            }

            ui.end();
        }

        // Browsers keep all sound muted until the player clicks or presses a key. This
        // shared row shows a warm "enable sound" hint only while audio is still locked,
        // then disappears on its own the moment the first key press or tap unlocks it.
        // The default sentence is too long for this 160-wide playfield, so we pass a
        // short override.
        ui.begin(UI_ANCHORS.TOP_LEFT, { margin: 3 });
        ui.audioUnlockHint({ text: 'Click for sound' });
        ui.end();

        // The touch D-pad, drawn over the playfield in the bottom-right corner. It stays
        // invisible until the first touch contact, so mouse-and-keyboard players never
        // see it. This playfield is only 160x120 logical pixels, so the keys are scaled
        // down from the kit's phone-sized default.
        ui.dpadWidget({ size: 22, gap: 3, margin: 4 });
    }

    // Builds the WebGPU CRT effect chain (the PipBoy CRT demo's stack, every effect and
    // number explained in createPipboyChain() in src/shared/crt-glitch.js) and seeds the
    // glitch state machine. Called from init() only when WebGPU is active.
    setupCrtEffects() {
        // The pixel-tier glitch runs on the index buffer, so it is added on its own; the
        // display-tier list goes through applyCrtChain(), which leaves out the moving
        // effects while the player prefers reduced motion.
        this.crtEffects = createPipboyChain(this, CRT_CURVATURE, DISPLAY_H);
        BT.effectAdd(this.pixelGlitch);
        applyCrtChain(this.crtEffects);

        // BT.random is the engine's shared random number generator. Its int() method
        // returns a whole number from the first value up to (but not including) the
        // second, so this picks how many ticks to wait before the first glitch burst.
        this.glitchCooldown = BT.random.int(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchTicksLeft = 0;
        this.glitchDuration = 0;
        this.glitchType = GLITCH_TYPE.NONE;
        this.glitchPeak = 0;
    }

    // While game over, waits for the restart delay and then starts a new round. Returns
    // true when the snake should not move this tick.
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

    // Reads all three steering inputs and updates the pending direction (no instant
    // reverse): player 0 face buttons (WASD, arrows, or gamepad), the on-screen touch
    // D-pad, and swipes. We use BT.isPressed (edge: up -> down this tick), not BT.isDown
    // (held every tick), and the D-pad's matching ui.dpad.isPressed. That way one tap per
    // direction per move interval feels like a classic D-pad. The `this.dy !== 1` checks
    // block a 180-degree turn: you cannot go straight back into your body on the next
    // step. `swipe` is the swipe finished this tick, if any (from ui.swipe() in
    // update()).
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

    // Combines the three ways to steer in one direction: the engine face button (keyboard
    // or gamepad), the on-screen touch D-pad key, and a swipe that way. `button` is the
    // face button mask (BT.BTN_UP and friends), `dir` the D-pad and swipe direction name.
    // Returns true when any of the three pressed that direction this tick.
    isSteerPressed(button, dir, swipe) {
        return BT.isPressed(button, 0) || ui.dpad.isPressed(dir) || swipe === dir;
    }

    // Updates the time-driven values for the roll line, noise, and interference effects.
    tickCrtClock() {
        const seconds = BT.ticks / TARGET_FPS;

        this.rollLine.time = seconds;
        this.noise.time = seconds;
        this.interference.time = seconds;
    }

    // The engine calls this when the reduced-motion preference changes while the game
    // runs. A burst in flight is cut short so the screen settles at once, and the chain
    // is rebuilt with or without the moving effects.
    onReducedMotionChange() {
        if (!this.effectsAvailable) {
            return;
        }

        if (this.glitchTicksLeft > 0) {
            this.glitchTicksLeft = 0;
            this.glitchType = GLITCH_TYPE.NONE;
            resetGlitchUniforms(this);
        }

        applyCrtChain(this.crtEffects);
    }

    // Pixel rectangle for one grid cell at (gx, gy), inside the inner playfield.
    gridRect(gx, gy) {
        const px = INNER_X0 + gx * CELL;
        const py = INNER_Y0 + gy * CELL;

        return new Rect2i(px, py, CELL, CELL);
    }

    // Four filled bars form the boundary the snake must not cross.
    renderWalls() {
        BT.drawRectFill(new Rect2i(0, 0, DISPLAY_W, WALL), C_WALL);
        BT.drawRectFill(new Rect2i(0, DISPLAY_H - WALL, DISPLAY_W, WALL), C_WALL);
        BT.drawRectFill(new Rect2i(0, WALL, WALL, DISPLAY_H - 2 * WALL), C_WALL);
        BT.drawRectFill(new Rect2i(DISPLAY_W - WALL, WALL, WALL, DISPLAY_H - 2 * WALL), C_WALL);
    }

    // Playback rate for the background loop from the starting pitch and how many times
    // the snake has grown this round. One food is start * scale, two foods is
    // start * scale * scale, and so on; zero growths leaves the rate at the start pitch.
    // Growth above MUSIC_PITCH_GROWTH_CAP no longer raises the rate (matches top speed).
    // Returns the rate to pass to BT.soundPlay or BT.soundPitchSet.
    currentMusicPitch() {
        // The ** operator is "to the power of": a ** b means a multiplied by itself b
        // times. growthCount 0 gives 1, so the rate stays at MUSIC_PITCH_AT_START on a
        // fresh round. Cap at MUSIC_PITCH_GROWTH_CAP so pitch plateaus with moveInterval
        // at top speed.
        const growthForPitch = Math.min(this.growthCount, MUSIC_PITCH_GROWTH_CAP);

        return MUSIC_PITCH_AT_START * MUSIC_PITCH_SCALE_PER_GROWTH ** growthForPitch;
    }

    // Starts the looping music voice once audio is unlocked, or restarts it if the voice
    // was somehow lost. Safe to call every tick - it does nothing while already playing.
    // Why BT.soundPlay instead of BT.musicPlay: only the SFX path exposes pitch (playback
    // rate), which is how we keep the beat tied to snake growth. The tradeoff is that
    // soundPlay is dropped before unlock, so we wait for BT.isAudioUnlocked here.
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

    // Glides the live music loop to the playback rate for the current growth count. Does
    // nothing before the loop has started (still locked, or music failed to load).
    syncMusicTempo() {
        if (this.musicRef === null || !BT.isSoundPlaying(this.musicRef)) {
            return;
        }

        BT.soundPitchSet(this.musicRef, this.currentMusicPitch(), {
            fadeMs: MUSIC_PITCH_FADE_MS,
        });
    }

    // Places a short snake in the middle, resets speed to the slow start, and spawns the
    // first food dot.
    startRound() {
        this.gameOver = false;
        this.deathTick = null;

        // Every new round begins at the slow pace; eating food will speed things up
        // again.
        this.moveInterval = MOVE_INTERVAL_START;
        this.moveCooldown = this.moveInterval;

        // Zero foods eaten - music returns to MUSIC_PITCH_AT_START for the new round.
        this.growthCount = 0;
        this.syncMusicTempo();

        // Three cells in the middle row, head on the right, heading right.
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

    // Picks a random empty grid cell for food.
    placeFood() {
        // Collect every cell the snake covers as "x,y" text keys, so a quick Set lookup
        // tells us whether a candidate cell is free.
        const occupied = new Set();

        for (let i = 0; i < this.snake.length; i++) {
            const s = this.snake[i];
            occupied.add(`${s.x},${s.y}`);
        }

        for (let attempt = 0; attempt < 4000; attempt++) {
            // int() with a single argument counts from 0, so int(CELLS_X) lands on any
            // column from 0 to CELLS_X - 1 - exactly the valid grid positions.
            const x = BT.random.int(CELLS_X);
            const y = BT.random.int(CELLS_Y);
            const key = `${x},${y}`;

            if (!occupied.has(key)) {
                this.food = { x, y };

                return;
            }
        }

        // Board full - no free cell found. (-1, -1) is a sentinel that render() sees and
        // skips drawing the food dot.
        this.food = { x: -1, y: -1 };
    }

    // One grid step: wall check, self check, grow or shift the tail.
    step() {
        const head = this.snake[0];
        const nx = head.x + this.dx;
        const ny = head.y + this.dy;

        // Off the grid means into the wall.
        if (nx < 0 || nx >= CELLS_X || ny < 0 || ny >= CELLS_Y) {
            this.endGame();

            return;
        }

        const eating = nx === this.food.x && ny === this.food.y;

        // Self check. The tail cell is about to move away unless we are eating, so it
        // does not count as a collision in that case.
        const limit = eating ? this.snake.length : this.snake.length - 1;

        for (let i = 0; i < limit; i++) {
            const s = this.snake[i];

            if (s.x === nx && s.y === ny) {
                this.endGame();

                return;
            }
        }

        // Add the new head cell at the front of the list.
        this.snake.unshift({ x: nx, y: ny });

        if (eating) {
            BT.soundPlay(this.eatClip);

            // Shorter wait between steps = faster snake. Clamp so it never goes below
            // MOVE_INTERVAL_MIN; Math.max picks the larger of the floor and the
            // stepped-down value, which is how we stop the interval from dropping into
            // the negatives.
            this.moveInterval = Math.max(MOVE_INTERVAL_MIN, this.moveInterval - MOVE_INTERVAL_STEP);

            // Keep counting every food; currentMusicPitch() caps the exponent at
            // MUSIC_PITCH_GROWTH_CAP so tempo stops climbing once speed has already maxed
            // out.
            this.growthCount += 1;
            this.syncMusicTempo();

            this.placeFood();
        } else {
            // Not eating: drop the tail cell so the snake keeps its length.
            this.snake.pop();
        }
    }

    // Freezes movement and remembers when to restart.
    endGame() {
        this.gameOver = true;
        this.deathTick = BT.ticks;
        BT.soundPlay(this.gameOverClip);
        BT.assignTag('Game over');
    }
}

bootstrap(Demo);
