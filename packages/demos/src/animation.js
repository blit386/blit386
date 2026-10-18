/*

Animation: tick-based timing for walk cycles, state machines, cooldowns, and particles.
@description Tick-based animation: cycle walk frames, drive a small state machine, and spawn particles that fade.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Sprites: https://demos.blit386.dev/sprites

Live version: https://demos.blit386.dev/animation

Guides:
  - Game Loop: https://blit386.dev/docs/guides/game-loop#why-motion-can-look-stale-or-jittery
  - Palette: https://blit386.dev/docs/guides/palette#layout-swap-vs-value-swap
  - Overlay: https://blit386.dev/docs/guides/overlay#custom-rows
  - Random: https://blit386.dev/docs/guides/random#deterministic-by-default

Reference:
  - Game Loop: https://blit386.dev/docs/api/game-loop#timer
  - Easing: https://blit386.dev/docs/api/easing#applyeasing
  - Core Types: https://blit386.dev/docs/api/core-types#color32
  - Overlay: https://blit386.dev/docs/api/overlay#custom-rows-optional

---

WHAT YOU WILL SEE
-----------------

A small gray walker - an 8x8 body with one eye on two short legs, built on an offscreen
canvas and drawn at twice its size - stands on a dark green ground strip along the bottom
of a 320x240 screen, with a soft shadow under its feet. Every 2 seconds it changes state,
in a loop that repeats every 6 seconds:

  1. Idle - it stands still.
  2. Walking - it slides sideways 1 pixel per tick, legs cycling through three poses,
     turning around (and facing the other way) whenever it reaches x = 64 or x = 220.
  3. Jumping - it rises along a smooth arc up to 40 pixels high and lands again after one
     second, twice in a row, while its shadow stays on the ground and shrinks as it rises.

Two UI kit panels sit along the top edge. Timers, on the left, shows an ability cooldown
(a countdown and a meter), the ticks until the next particle spawn, and how many
particles are alive. State, on the right, lists the three states with a lit pip next to
the current one. On the ground strip, a short list names the concepts on show.

Every 45 ticks (three quarters of a second) a burst of 32 tiny sparks shoots up from the
walker's feet like a fountain, arcs over under gravity, and falls back to the ground. Each
burst has its own hue, tied to the moment it spawned. A spark glows for most of its
1.5-second life and then winks out quickly. The engine overlay gets a custom row with the
state and the tick count, and the timing chart is on.

WHAT YOU WILL LEARN
-------------------

- BT.ticks goes up once per update() call at a fixed rate (targetFPS), not once per screen
  refresh. All timing here compares BT.ticks with a stored start tick; at 60 ticks per
  second, one tick is 1/60 of a second.
- A state machine: AnimState names the three states, and update() switches between them
  on a 360-tick cycle with `tick % 360`.
- A cooldown timer: a tick count that counts down to zero, shown as seconds and as a
  ui.meter().
- Periodic events with the Timer class: new Timer(45), timer.fireIfElapsed(tick), and
  timer.remainingTicks(tick).
- Simple particle physics: each spark has a velocity, and gravity adds a little to its
  downward speed every tick, which bends its path into an arc.
- A jump arc from Math.sin(): progress from 0 to 1 becomes a smooth hill.
- Palette animation for particles: each particle owns a palette slot, update() writes its
  current color there with palette.set(), and render() just passes the slot number.
- applyEasing(t, 'ease-in') and Color32.fromHSL(hue, saturation, lightness) for the fade
  and the hue.
- Building a four-frame walk strip on an OffscreenCanvas and cutting frames out of it with
  sheet.tileRect().
- Drawing one sprite at twice its size, mirrored to face the way it walks, with the
  params form of BT.drawSprite(): { scale: 2, flags: BT.FLIP_H }.

HOW PARTICLE COLORS WORK
------------------------

Each particle gets its own palette slot (50-177, a rotating pool of 128) the moment it is
spawned. In update(), the color is computed - hue picked at spawn time, alpha from age -
and written into that slot with palette.set(). In render(), the particle is drawn with
the slot number alone; no Color32 objects are needed there. The Palette Animation demo
explores this idea in depth: https://demos.blit386.dev/palette-animation

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. The custom row shows the state
  on the left and the tick count on the right - watch the state flip every 120 ticks.
- Watch the cooldown: it starts at 2 seconds when a jump begins, turns from orange to
  green as it reaches zero, and the meter empties with it.

*/

import { applyEasing, bootstrap, BT, Color32, Rect2i, SpriteSheet, Timer, Vector2i } from 'blit386';

import { canvasToImage, registerCanvasColors } from './shared/canvas-sprites.js';
import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */

// AnimState names the three states the walker can be in. Object.freeze prevents these
// values from being changed by accident.
const AnimState = Object.freeze({
    Idle: 'Idle', // standing still
    Walking: 'Walking', // sliding across the screen
    Jumping: 'Jumping', // following a jump arc
});

// How many particles can be alive at once. Each gets its own palette slot. A burst lives
// for two spawn intervals, so at most about 64 are alive - 128 slots leave plenty of
// room.
const MAX_PARTICLES = 128;

// Every SPAWN_INTERVAL ticks, BURST_SIZE particles shoot up from the walker's feet.
const SPAWN_INTERVAL = 45;
const BURST_SIZE = 32;

// How many ticks one particle lives (90 ticks = 1.5 seconds at 60 FPS).
const PARTICLE_LIFETIME = 90;

// How much faster a particle falls each tick, in pixels per tick. Small numbers make
// floaty sparks, big numbers make them drop like stones.
const GRAVITY = 0.06;

// Where in the palette particle colors are stored (slots 50-177).
const PARTICLE_SLOT_START = 50;

// The states in the order the State panel lists them (and the order they play in).
const STATE_ORDER = [AnimState.Idle, AnimState.Walking, AnimState.Jumping];

// Where the walker's colors start (slot 20 and up; the canvas has three colors).
const SPRITE_BASE = 20;

// Walk animation: four 18x18 frames in one horizontal strip (idle + three walk poses).
const WALK_FRAME_W = 18;
const WALK_FRAME_COUNT = 4;

// The walker is drawn at twice its size, so each canvas pixel becomes a 2x2 block.
const WALKER_SCALE = 2;

// The y coordinate of the ground's top edge. The walker's feet rest on this line.
const GROUND_Y = 172;

// The walker turns around when its left edge reaches one of these x positions. The
// range is centered: 64 pixels of room on the left, 64 on the right of the 36-pixel-wide
// walker.
const WALK_MIN_X = 64;
const WALK_MAX_X = 220;

// Scene color slots (low palette slots - text and panels use the shared UI theme
// instead).
const C_GROUND = 1; // (40, 60, 40) dark green ground strip
const C_SHADOW = 2; // (0, 0, 0, 100) semi-transparent shadow under the walker
const C_GROUND_EDGE = 3; // (72, 104, 60) lighter green line along the ground's top edge

// Palette slots of the shared UI theme. applyTheme() in init() writes the twelve UI kit
// colors into slots 240-251 (its default start slot). configure() runs before init(), so
// the overlay styles below cannot read this.theme yet - these constants spell out where
// each theme color will land once init() runs.
const UI_BG = 240; // deep navy screen background
const UI_HEADER = 246; // warm amber (render bars, chart tags)
const UI_ACCENT = 247; // phosphor green (update bars)
const UI_WARM = 248; // orange (chart warning and error frames)
const UI_INFO = 249; // light blue (overlay row text)

// Draws one frame of the walker onto the canvas: a body square with one eye, plus two
// legs whose positions change with `frameIndex` (0 idle, 1 left foot forward, 2 mid
// stride, 3 right foot forward). The eye sits on the right, so the walker faces right;
// renderCharacter() mirrors it to face left.
function drawWalkFrame(ctx, frameIndex) {
    const ox = frameIndex * WALK_FRAME_W;
    const bodyColor = '#b0b0c8';
    const legColor = '#8080a0';
    const eyeColor = '#1a1c2c';

    ctx.fillStyle = bodyColor;
    ctx.fillRect(ox + 5, 4, 8, 8);
    ctx.fillStyle = eyeColor;
    ctx.fillRect(ox + 10, 6, 2, 2);
    ctx.fillStyle = legColor;

    if (frameIndex === 0) {
        // Idle: feet apart under the body, lined up with the body edges.
        ctx.fillRect(ox + 5, 12, 3, 4);
        ctx.fillRect(ox + 10, 12, 3, 4);
    } else if (frameIndex === 1) {
        // Left foot forward.
        ctx.fillRect(ox + 4, 12, 3, 4);
        ctx.fillRect(ox + 10, 13, 3, 3);
    } else if (frameIndex === 2) {
        // Mid stride: feet under the hips.
        ctx.fillRect(ox + 6, 12, 3, 4);
        ctx.fillRect(ox + 9, 12, 3, 4);
    } else {
        // Right foot forward.
        ctx.fillRect(ox + 5, 13, 3, 3);
        ctx.fillRect(ox + 11, 12, 3, 4);
    }
}

// Builds the walk strip: an offscreen canvas with all four frames side by side. Returns
// the canvas and its 2D drawing context. Throws if the browser cannot give us a 2D
// context.
function buildWalkSheet() {
    const sheetW = WALK_FRAME_W * WALK_FRAME_COUNT;
    const sheetH = WALK_FRAME_W;
    const canvas = new OffscreenCanvas(sheetW, sheetH);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Could not create 2D context for walk sheet');
    }

    ctx.clearRect(0, 0, sheetW, sheetH);

    for (let f = 0; f < WALK_FRAME_COUNT; f++) {
        drawWalkFrame(ctx, f);
    }

    return { canvas, ctx };
}

// Tick-based animation timing and state management: a state machine, a cooldown, periodic
// particle spawns, and a jump arc, all driven by BT.ticks.
class Demo {
    // The palette holds all colors used in this demo.
    /** @type {Palette | null} */
    palette = null;

    // The walk strip built in init() on an offscreen canvas.
    /** @type {SpriteSheet | null} */
    spriteSheet = null;

    // One Rect2i per walk-strip frame (idle + three walk poses).
    walkFrames = [];

    // Which state the walker is in right now.
    animState = AnimState.Idle;

    // The walker's position on screen (top-left corner of its frame). Its feet end 16
    // canvas rows below the frame's top, so at 2x the frame's top sits 32 pixels above
    // the ground line.
    charPos = new Vector2i(80, GROUND_Y - 16 * WALKER_SCALE);

    // Counts down how many ticks the ability is still unavailable.
    abilityCooldownTicks = 0;

    // Total duration of the cooldown (2 seconds at 60 FPS = 120 ticks).
    abilityCooldownDuration = 120;

    // Fires every 45 ticks (0.75 seconds at 60 FPS) to spawn the next burst.
    spawnTimer = new Timer(SPAWN_INTERVAL);

    // The active particles: each has a position (x, y), a velocity (vx, vy), a
    // spawnTick, a hue, and a paletteSlot. Position and velocity are fractional numbers
    // so slow sparks still move smoothly; they are rounded to whole pixels only when
    // drawn.
    particles = [];

    // Counts spawned particles so the palette slots are handed out in a circle.
    nextParticleSlot = 0;

    // When the current jump started (used to calculate the arc height).
    jumpStartTick = 0;

    // How many ticks one hop takes from launch to landing (1 second = 60 ticks). The
    // Jumping state lasts 2 seconds, so the walker hops twice.
    jumpDuration = 60;

    // The walker's horizontal direction (+1 = right, -1 = left).
    walkDir = 1;

    // Where the current walk started; the leg pose is picked from the distance walked.
    walkStartX = 80;

    // Reused every frame for BT.drawSprite(): the scale stays at 2, and flags flips to
    // BT.FLIP_H (a mirror image) while the walker faces left.
    spriteParams = { scale: WALKER_SCALE, flags: 0 };

    // Slot map for the shared UI kit theme, filled in init() by applyTheme(). theme.bg,
    // theme.text, and friends are palette indices for our own drawing.
    theme = null;

    // Reused every frame for the engine overlay status row (state + ticks).
    overlayRowData = [{ leftText: 'State: Idle', rightText: 'Ticks: 0', textPaletteIndex: UI_INFO }];

    // Tells the engine which palette slots to use for the overlay bars and the timing
    // chart.
    configure() {
        return {
            overlayStyle: {
                barPaletteIndex: UI_BG,
                textPaletteIndex: UI_INFO,
                gapPaletteIndex: UI_BG,
            },

            // Show the scrolling timing chart in the overlay so each frame's
            // update/render cost is visible.
            isOverlayTimingChartEnabled: true,

            overlayTimingChartStyle: {
                // Theme green for update() bars, matching the "ready" cooldown color.
                updateBarPaletteIndex: UI_ACCENT,

                // Theme amber for render() bars.
                renderBarPaletteIndex: UI_HEADER,

                // Theme orange flags frames that are close to the frame budget, and the
                // same orange marks frames that went over it.
                warningPaletteIndex: UI_WARM,
                errorPaletteIndex: UI_WARM,

                // Theme amber for milestone labels such as BT.assignTag() calls.
                tagPaletteIndex: UI_HEADER,
            },
        };
    }

    // Sets up the palette and builds the walk strip.
    async init() {
        console.log('[AnimationDemo] Initializing...');

        // Create the palette and fill the scene colors (ground, its edge, shadow).
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_GROUND, new Color32(40, 60, 40));
        this.palette.set(C_SHADOW, new Color32(0, 0, 0, 100));
        this.palette.set(C_GROUND_EDGE, new Color32(72, 104, 60));

        // Install the shared UI theme: applyTheme() writes the twelve UI kit colors into
        // high palette slots (240-251), far above this demo's sprite colors (slots 20-21)
        // and particle slots (50-177), and returns a map of friendly names to those slots
        // (this.theme.bg, .text, ...). All on-screen text and the cooldown meter use
        // them.
        this.theme = applyTheme(this.palette);

        // Particle slots (50-177) start fully transparent (alpha 0) so they stay
        // invisible until update() writes real colors into them when particles spawn.
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.palette.set(PARTICLE_SLOT_START + i, new Color32(0, 0, 0, 0));
        }

        // Build a four-frame walk strip on an offscreen canvas (idle + three walk poses).
        try {
            const { canvas, ctx } = buildWalkSheet();

            // Read the canvas colors into palette slots starting at SPRITE_BASE.
            registerCanvasColors(this.palette, ctx, canvas.width, canvas.height, SPRITE_BASE);

            // Turn the canvas into an image the engine can use, then convert its pixels
            // to palette slot numbers.
            const image = await canvasToImage(canvas);

            this.spriteSheet = new SpriteSheet(image);
            this.spriteSheet.indexize(this.palette);

            // The strip is WALK_FRAME_COUNT square cells; tileRect(f) cuts frame f out of
            // it.
            this.spriteSheet.tileSize = WALK_FRAME_W;
            this.walkFrames = Array.from({ length: WALK_FRAME_COUNT }, (_, f) => this.spriteSheet.tileRect(f));

            BT.paletteSet(this.palette);

            console.log(`[AnimationDemo] Built walk sheet: ${canvas.width}x${canvas.height}px, 4 frames`);
        } catch (error) {
            console.error('[AnimationDemo] Failed to build walk sheet:', error);

            return false;
        }

        console.log('[AnimationDemo] Initialization complete!');

        return true;
    }

    // Runs at a fixed rate (60 times per second). Advances the state machine, counts down
    // the cooldown, spawns and ages particles, and writes each particle's current color
    // into its palette slot.
    update() {
        const tick = BT.ticks;

        // Auto-cycle through the states every 2 seconds (120 ticks at 60 FPS).
        this.autoCycleStates(tick);

        // Count down the cooldown. It never goes below zero.
        if (this.abilityCooldownTicks > 0) {
            this.abilityCooldownTicks--;
        }

        // Spawn a burst of particles every SPAWN_INTERVAL ticks.
        if (this.spawnTimer.fireIfElapsed(tick)) {
            this.spawnBurst();
        }

        // Move every particle: add its velocity to its position, then let gravity pull a
        // little harder on it. Adding to vy each tick is what bends a straight line into
        // an arc - the spark slows as it rises, stops at the top, and falls faster and
        // faster on the way down.
        for (const p of this.particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += GRAVITY;
        }

        // Remove dead particles: too old, or fallen back down to the ground's edge (a 2x2
        // spark at y = GROUND_Y - 1 would already cover the edge line). Array.filter
        // returns a new array with only the entries that pass the test.
        this.particles = this.particles.filter((p) => tick - p.spawnTick < PARTICLE_LIFETIME && p.y < GROUND_Y - 1);

        // Update each particle's palette slot with its current color. The hue is fixed at
        // spawn time; only the alpha changes as the particle ages.
        for (const p of this.particles) {
            const age = tick - p.spawnTick;

            // t goes from 0 (just born) to 1 (fully aged, about to disappear). Think of
            // it like a candle burning down: 0 is a fresh candle, 1 is gone.
            const t = age / PARTICLE_LIFETIME;

            // applyEasing(t, 'ease-in') starts slow and accelerates toward the end.
            // Subtracting from 1 flips it: alpha stays high for most of the particle's
            // life, then drops quickly right before it disappears - like a real spark
            // that glows brightly, then winks out all at once instead of fading evenly.
            const alpha = Math.floor(255 * (1 - applyEasing(t, 'ease-in')));

            // Compute the color and write it into this particle's reserved palette slot.
            const color = Color32.fromHSL(p.hue, 100, 60);
            this.palette.set(p.paletteSlot, new Color32(color.r, color.g, color.b, alpha));
        }

        // Move the walker sideways while in the Walking state.
        this.updateRockPosition();
    }

    // Runs once per screen refresh to draw the walker, particles, and UI. Notice: no
    // Color32 objects appear in draw calls - only palette slot numbers.
    render() {
        // Clear the whole screen with the shared UI theme's background color.
        BT.clear(this.theme.bg);

        // Green ground strip the walker stands on, from GROUND_Y down to the bottom of
        // the screen, with a 2-pixel lighter line on top so the edge reads clearly.
        BT.drawRectFill(new Rect2i(0, GROUND_Y, 320, 240 - GROUND_Y), C_GROUND);
        BT.drawRectFill(new Rect2i(0, GROUND_Y, 320, 2), C_GROUND_EDGE);

        // Draw the walker with a shadow below it.
        this.renderCharacter();

        // The State panel (the overlay row also shows state + ticks).
        this.renderStateIndicator();

        // Draw any active particles.
        this.renderParticles();

        // Draw the timer readouts and the concept summary (shared UI kit groups).
        this.renderUI();
    }

    // Status row in the engine overlay: animation state (left) and tick count (right).
    overlayRows() {
        const row = this.overlayRowData[0];

        row.leftText = `State: ${this.animState}`;
        row.rightText = `Ticks: ${BT.ticks}`;

        return this.overlayRowData;
    }

    // Automatically cycles through Idle -> Walking -> Jumping, 2 seconds each. The full
    // cycle is 6 seconds (360 ticks at 60 FPS).
    autoCycleStates(tick) {
        // cyclePos goes 0-359, repeating: `%` gives the remainder after dividing by 360.
        const cyclePos = tick % 360;

        if (cyclePos < 120) {
            // First 2 seconds: Idle. The walker stands still.
            if (this.animState !== AnimState.Idle) {
                this.animState = AnimState.Idle;
            }
        } else if (cyclePos < 240) {
            // Second 2 seconds: Walking. The walker slides sideways.
            if (this.animState !== AnimState.Walking) {
                this.animState = AnimState.Walking;
                this.walkStartX = this.charPos.x;
                this.walkDir = 1;
            }
        } else {
            // Last 2 seconds: Jumping. The walker follows a sine arc.
            if (this.animState !== AnimState.Jumping) {
                this.animState = AnimState.Jumping;
                this.jumpStartTick = tick;

                // Trigger the ability cooldown at the start of a jump.
                if (this.abilityCooldownTicks === 0) {
                    this.abilityCooldownTicks = this.abilityCooldownDuration;
                }
            }
        }
    }

    // Moves the walker based on the current state. Only Walking moves it sideways; the
    // jump arc is a vertical offset computed in renderCharacter().
    updateRockPosition() {
        if (this.animState === AnimState.Walking) {
            // Move 1 pixel per tick; turn around near the screen edges.
            this.charPos.x += this.walkDir;

            if (this.charPos.x >= WALK_MAX_X) {
                this.walkDir = -1;
            }

            if (this.charPos.x <= WALK_MIN_X) {
                this.walkDir = 1;
            }
        }
    }

    // Draws the walker at the correct position, with a shadow below. While Walking, the
    // frame cycles through the three walk poses based on the distance from walkStartX.
    // While Jumping, the sprite moves up in an arc while the shadow stays on the ground.
    renderCharacter() {
        let srcRect = this.walkFrames[0];

        if (this.animState === AnimState.Walking) {
            // walkStartX is where the walk began; every 3 pixels, advance to the next of
            // the three walk poses (frames 1, 2, 3).
            const steps = Math.abs(this.charPos.x - this.walkStartX);
            const walkFrame = 1 + (Math.floor(steps / 3) % 3);

            srcRect = this.walkFrames[walkFrame];
        }

        // Calculate the vertical offset for the jump arc.
        let yOffset = 0;

        if (this.animState === AnimState.Jumping) {
            // jumpProgress runs from 0 at launch to 1 at landing (and on to 2 for the
            // second hop). Math.sin(progress * PI) traces a hill from 0 up to 1 and back
            // to 0; Math.abs keeps the second hop pointing up too. Negative y is up on
            // screen.
            const jumpProgress = (BT.ticks - this.jumpStartTick) / this.jumpDuration;

            yOffset = -Math.abs(Math.sin(jumpProgress * Math.PI) * 40);
        }

        const drawPos = new Vector2i(this.charPos.x, this.charPos.y + Math.floor(yOffset));

        // Face the way we are walking: the frames face right, so mirror them with
        // BT.FLIP_H while walkDir is -1. The walker keeps its last facing while it idles
        // and jumps.
        this.spriteParams.flags = this.walkDir < 0 ? BT.FLIP_H : 0;

        BT.drawSprite(this.spriteSheet, srcRect, drawPos, this.spriteParams);

        // The shadow is a 1-pixel line on the ground's top edge, right under the feet, no
        // matter how high the jump is. It gets 2 pixels narrower on each side for every
        // 10 pixels of height, like a real shadow shrinking as the thing casting it
        // moves away from the ground.
        const shrink = 2 * Math.floor(-yOffset / 10);
        const shadowW = 24 - 2 * shrink;

        BT.drawRectFill(new Rect2i(this.charPos.x + 6 + shrink, GROUND_Y, shadowW, 1), C_SHADOW);
    }

    // Draws the state machine as a kit panel in the top-right corner: all three states in
    // the order they play, with a lit pip (a small filled square) next to the current
    // one. Watching the lit pip step down the list makes the Idle -> Walking -> Jumping
    // loop obvious at a glance.
    renderStateIndicator() {
        ui.begin(UI_ANCHORS.TOP_RIGHT);
        ui.panel('State');

        for (const state of STATE_ORDER) {
            ui.pip(state, state === this.animState);
        }

        ui.end();
    }

    // Spawns a burst of BURST_SIZE particles at the walker's feet, all flying upward at
    // slightly different speeds and angles, like a little fountain. Each particle gets
    // its own palette slot from the rotating pool.
    spawnBurst() {
        // The whole burst shares a base hue picked from the spawn tick, so each burst has
        // its own color. The % keeps the hue within 0-359 degrees of the color wheel.
        const baseHue = (BT.ticks * 3) % 360;

        // The fountain starts at the middle of the walker's feet (it is 36 pixels wide,
        // so the middle is 18 pixels in from its left edge), just above the ground line.
        const originX = this.charPos.x + 18;
        const originY = GROUND_Y - 2;

        for (let i = 0; i < BURST_SIZE; i++) {
            // Rotate through the 128 slots in a circle: `%` wraps the count back to 0
            // after 127, so the oldest particle's slot gets reused.
            const slot = PARTICLE_SLOT_START + (this.nextParticleSlot % MAX_PARTICLES);
            this.nextParticleSlot++;

            // BT.random is the engine's shared random number generator. float(a, b)
            // returns a fractional number from a up to (but not including) b. vx spreads
            // the sparks left and right; vy is always negative, which on screen means
            // upward, so every spark starts by rising. int(0, 40) nudges each spark's hue
            // a little away from the burst's base hue, so the burst shimmers.
            this.particles.push({
                x: originX + BT.random.float(-4, 4),
                y: originY,
                vx: BT.random.float(-1.2, 1.2),
                vy: BT.random.float(-3, -1.2),
                spawnTick: BT.ticks,
                hue: (baseHue + BT.random.int(0, 40)) % 360,
                paletteSlot: slot, // this particle "owns" this palette slot
            });
        }
    }

    // Draws all active particles as tiny colored squares. The color for each particle
    // was already written in update() via palette.set(); here we just use the slot
    // number.
    renderParticles() {
        for (const p of this.particles) {
            // Draw a 2x2 square. Math.floor turns the fractional position into a whole
            // pixel, and the color is whatever update() put in p.paletteSlot.
            BT.drawRectFill(new Rect2i(Math.floor(p.x), Math.floor(p.y), 2, 2), p.paletteSlot);
        }
    }

    // Draws the timer readouts and the concept summary with the shared UI kit. State and
    // tick count are shown in overlayRows() above the bottom FPS bar.
    renderUI() {
        // How much of the cooldown is still left, as a fraction from 0 (ready) to 1
        // (full).
        const cooldownPercent = Math.max(0, this.abilityCooldownTicks / this.abilityCooldownDuration);

        // Ask the timer how many ticks are left until the next spawn event.
        const ticksUntilSpawn = this.spawnTimer.remainingTicks(BT.ticks);

        // Timer readouts: a kit panel in the top-left corner, level with the State panel
        // on the right. kvCols: 10 makes the key column of the ui.kv() rows wide enough
        // for "Particles" plus a space.
        ui.begin(UI_ANCHORS.TOP_LEFT, { kvCols: 10 });
        ui.panel('Timers');

        // Orange while counting down, green once the ability is ready again. Math.ceil
        // rounds up, so "1s" shows until the very last tick of the cooldown.
        const cooldownSecs = Math.ceil(this.abilityCooldownTicks / 60);
        ui.label(`Cooldown: ${cooldownSecs}s`, { color: cooldownPercent > 0 ? 'warm' : 'accent' });

        // A read-only kit meter shows the same fraction as a bar.
        ui.meter(null, cooldownPercent, { color: 'warm', width: 100 });

        // Key-value rows: the key on the left in a dim color, the value lined up in a
        // column on the right. The next burst is under a second away, so it is counted
        // in ticks rather than seconds. padStart(2) adds a space in front of one-digit
        // numbers, so the text keeps the same width and the panel does not twitch.
        ui.kv('Spawn in', `${String(ticksUntilSpawn).padStart(2)} ticks`);
        ui.kv('Particles', this.particles.length);
        ui.end();

        // Concept summary: a borderless kit group on the ground strip, a little below its
        // top edge so the walker's feet never touch the text.
        ui.begin(UI_ANCHORS.TOP_LEFT, { y: GROUND_Y + 10 });
        ui.label('Tick-based timing', { color: 'header' });
        ui.label('- Fixed-rate ticks (BT.ticks)', { color: 'dim' });
        ui.label('- Cooldowns and Timer events', { color: 'dim' });
        ui.label('- State machine transitions', { color: 'dim' });
        ui.end();
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
