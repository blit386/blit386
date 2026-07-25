// Demo 009 - Animation and timing: how to animate sprites using tick-based timing.
//
// Prerequisites: 001-Basics (https://demos.blit386.dev/001-basics),
// 008-Sprites (https://demos.blit386.dev/008-sprites).
// Live article: https://vancura.dev/articles/blit386-animation
//
// In BLIT386, the tick counter goes up once per update() call at a fixed rate (targetFPS),
// not once per screen refresh. render() can run more often than update() on a high refresh
// monitor, so there can be more drawn frames than ticks. This demo shows the most common
// patterns for making things happen over time:
//
//   1. State machines: an object can be in one of several states
//      (Idle, Walking, Jumping) and behavior changes accordingly.
//
//   2. Cooldown timers: track how many ticks must pass before an ability
//      can be used again (like a spell cooldown in an RPG).
//
//   3. Periodic events: spawn a new particle every N ticks.
//
//   4. Jump arc: a smooth sine-curve arc using Math.sin (not gravity-style parabola).
//
// All timing is done by comparing BT.ticks to a stored "start tick".
// Each tick is one update() call; at targetFPS = 60, one tick is 1/60 of a second.
//
// HOW PARTICLE COLORS WORK:
//
// Each particle gets its own palette slot at the moment it is spawned.
// In update(), we compute the color (hue from spawn time, alpha from age)
// and write it into that slot with palette.set(). In render(), we just
// use the particle's slot number - no Color32 objects needed there.
//
// Demo 016 explores this palette-animation idea in depth:
// https://demos.blit386.dev/016-palette-animation
//
// The cooldown readout, spawn timer, concept summary, and state badge are drawn with the
// shared UI kit (src/shared/ui.js), which installs its twelve UI colors high in the
// palette (slots 240-251) via applyTheme().

import { applyEasing, bootstrap, BT, Color32, Rect2i, SpriteSheet, Timer, Vector2i } from 'blit386';

import { canvasToImage, registerCanvasColors } from './shared/canvas-sprites.js';
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */

// AnimState defines the three states the moving rock can be in.
// Object.freeze prevents these values from being changed by accident.
const AnimState = Object.freeze({
    Idle: 'Idle', // The rock is sitting still.
    Walking: 'Walking', // The rock is sliding across the screen.
    Jumping: 'Jumping', // The rock is following a jump arc.
});

// How many particles can be alive at once. Each gets its own palette slot.
const MAX_PARTICLES = 20;

// Where in the palette particle colors are stored (slots 50..69).
const PARTICLE_SLOT_START = 50;

// Where the sprite's colors start (slots 20..20+N-1, where N is extracted at runtime).
const SPRITE_BASE = 20;

// Walk animation: four source rects in one horizontal strip (idle + three walk poses).
const WALK_FRAME_W = 18;
const WALK_FRAME_COUNT = 4;

// Scene color slots (low palette slots - text and panels use the shared UI theme instead).
const C_GROUND = 1; // (40, 60, 40) dark green ground strip.
const C_SHADOW = 2; // (0, 0, 0, 100) semi-transparent shadow under the rock.
const C_STATE_IDLE = 3; // (150, 150, 150) calm gray - the Idle state color.
const C_STATE_WALK = 4; // (100, 255, 100) "go" green - the Walking state color.
const C_STATE_JUMP = 5; // (255, 100, 100) alert red - the Jumping state color.

// Palette slots of the shared UI theme. applyTheme() in init() writes the twelve UI kit
// colors into slots 240-251 (its default start slot). configure() runs BEFORE init(), so
// the overlay styles below cannot read this.theme yet - these constants spell out where
// each theme color will land once init() runs.
const UI_BG = 240; // 'ui_bg' - deep navy screen background.
const UI_HEADER = 246; // 'ui_header' - warm amber (render bars, chart tags).
const UI_ACCENT = 247; // 'ui_accent' - phosphor green (update bars).
const UI_WARM = 248; // 'ui_accent_warm' - orange (chart warning and error frames).
const UI_INFO = 249; // 'ui_info' - light blue (overlay row text).

/**
 * Draws one character pose into a walk-strip cell.
 * Frame 0 = idle; frames 1-3 = walk cycle with alternating leg positions.
 *
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {number} frameIndex
 */
function drawWalkFrame(ctx, frameIndex) {
    const ox = frameIndex * WALK_FRAME_W;
    const bodyColor = '#b0b0c8';
    const legColor = '#8080a0';

    ctx.fillStyle = bodyColor;
    ctx.fillRect(ox + 5, 4, 8, 8);

    ctx.fillStyle = legColor;

    if (frameIndex === 0) {
        // Idle: feet together under the body.
        ctx.fillRect(ox + 6, 12, 3, 4);
        ctx.fillRect(ox + 9, 12, 3, 4);
    } else if (frameIndex === 1) {
        // Left foot forward.
        ctx.fillRect(ox + 4, 12, 3, 4);
        ctx.fillRect(ox + 10, 13, 3, 3);
    } else if (frameIndex === 2) {
        // Mid stride: feet under hips.
        ctx.fillRect(ox + 6, 12, 3, 4);
        ctx.fillRect(ox + 9, 12, 3, 4);
    } else {
        // Right foot forward.
        ctx.fillRect(ox + 5, 13, 3, 3);
        ctx.fillRect(ox + 11, 12, 3, 4);
    }
}

/**
 * Builds a horizontal strip with idle + three walk frames.
 *
 * @returns {{ canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, frames: Rect2i[] }}
 */
function buildWalkSheet() {
    const sheetW = WALK_FRAME_W * WALK_FRAME_COUNT;
    const sheetH = WALK_FRAME_W;
    const canvas = new OffscreenCanvas(sheetW, sheetH);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Could not create 2D context for walk sheet');
    }

    ctx.clearRect(0, 0, sheetW, sheetH);

    const frames = [];

    for (let f = 0; f < WALK_FRAME_COUNT; f++) {
        drawWalkFrame(ctx, f);
        frames.push(new Rect2i(f * WALK_FRAME_W, 0, WALK_FRAME_W, WALK_FRAME_W));
    }

    return { canvas, ctx, frames };
}

/**
 * Demonstrates tick-based animation timing and state management.
 * Shows state machines, cooldowns, periodic particle events, and jump arcs.
 * The "character" is the rock sprite from test.png.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // The palette holds all colors used in this demo.
    /** @type {Palette | null} */
    palette = null;

    // The sprite sheet loaded from /sprites/test.png.
    /** @type {SpriteSheet | null} */
    spriteSheet = null;

    // One Rect2i per walk-strip frame (idle + three walk poses).
    walkFrames = [];

    // Animation state tracks what the rock is currently doing.
    animState = AnimState.Idle;

    // The rock's position on screen (top-left corner).
    charPos = new Vector2i(80, 100);

    // abilityCooldownTicks counts down how many ticks the ability is still unavailable.
    abilityCooldownTicks = 0;

    // Total duration of the cooldown (2 seconds at 60 FPS = 120 ticks).
    abilityCooldownDuration = 120;

    // Fires every 180 ticks (3 seconds at 60 FPS) to spawn the next particle batch.
    spawnTimer = new Timer(180);

    // particles is an array of active particle objects.
    // Each particle: { pos: Vector2i, spawnTick: number, paletteSlot: number }
    particles = [];

    // Tracks which particle slots are currently in use (a rotating pool).
    nextParticleSlot = 0;

    // When the current jump started (used to calculate the arc height).
    jumpStartTick = 0;

    // How many ticks a jump takes from launch to landing (1 second = 60 ticks).
    jumpDuration = 60;

    // The rock's horizontal "walk" direction (+1 = right, -1 = left).
    walkDir = 1;

    // Starting X position for the walk state.
    walkStartX = 80;

    // Slot map for the shared UI kit theme, filled in init() by applyTheme().
    // theme.bg, theme.text, and friends are palette indices for our own drawing.
    theme = null;

    // Reused every frame for the engine overlay status row (state + ticks).
    overlayRowData = [{ leftText: 'State: Idle', rightText: 'Ticks: 0', textPaletteIndex: UI_INFO }];

    /**
     * Tells the engine which palette slots to use for overlay bars and timing chart.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            overlayStyle: {
                barPaletteIndex: UI_BG,
                textPaletteIndex: UI_INFO,
                gapPaletteIndex: UI_BG,
            },
            // Show the scrolling timing chart in the overlay so each frame's update/render cost is visible.
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                // Theme green - used for update() bars, matching the "ready" cooldown color.
                updateBarPaletteIndex: UI_ACCENT,
                // Theme amber - used for render() bars.
                renderBarPaletteIndex: UI_HEADER,
                // Theme orange - flags frames that are close to the frame budget.
                warningPaletteIndex: UI_WARM,
                // Theme orange again - the old palette also shared one red for warning and error.
                errorPaletteIndex: UI_WARM,
                // Theme amber - used for milestone labels such as "Start" or BT.assignTag() calls.
                tagPaletteIndex: UI_HEADER,
            },
        };
    }

    /**
     * Sets up the palette, loads the sprite and font.
     *
     * @returns {Promise<boolean>} Returns true when everything is ready.
     */
    async init() {
        console.log('[AnimationDemo] Initializing...');

        // Create the palette and fill the scene colors (ground, shadow, state indicator).
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_GROUND, new Color32(40, 60, 40));
        this.palette.set(C_SHADOW, new Color32(0, 0, 0, 100));
        this.palette.set(C_STATE_IDLE, new Color32(150, 150, 150));
        this.palette.set(C_STATE_WALK, new Color32(100, 255, 100));
        this.palette.set(C_STATE_JUMP, new Color32(255, 100, 100));

        // Install the shared UI theme: applyTheme() writes the twelve UI kit colors into
        // high palette slots (240-251), far above this demo's sprite colors (slots 20-21)
        // and particle slots (50-69), and returns a map of friendly names to those slots
        // (this.theme.bg, .text, ...). All on-screen text and the cooldown meter use them.
        this.theme = applyTheme(this.palette);

        // Particle slots (50..69) start as transparent - update() fills them when particles spawn.
        // We pre-fill with a dim white so nothing shows before the first particle.
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.palette.set(PARTICLE_SLOT_START + i, new Color32(0, 0, 0, 0));
        }

        // Build a four-frame walk strip on an offscreen canvas (idle + three walk poses).
        try {
            const { canvas, ctx, frames } = buildWalkSheet();
            this.walkFrames = frames;

            registerCanvasColors(this.palette, ctx, canvas.width, canvas.height, SPRITE_BASE);

            const image = await canvasToImage(canvas);
            this.spriteSheet = new SpriteSheet(image);
            this.spriteSheet.indexize(this.palette);

            BT.paletteSet(this.palette);
            console.log(`[AnimationDemo] Built walk sheet: ${canvas.width}x${canvas.height}px, 4 frames`);
        } catch (error) {
            console.error('[AnimationDemo] Failed to build walk sheet:', error);
            return false;
        }

        console.log('[AnimationDemo] Initialization complete!');
        return true;
    }

    /**
     * Runs at a fixed rate (60 times per second) to:
     *   1. Advance the state machine (Idle -> Walking -> Jumping cycle).
     *   2. Count down the cooldown timer.
     *   3. Spawn new particles and age existing ones.
     *   4. Update each particle's palette slot with its current color.
     */
    update() {
        const tick = BT.ticks;

        // Auto-cycle through states every 2 seconds (120 ticks at 60 FPS).
        this.autoCycleStates(tick);

        // Count down the cooldown. It never goes below zero.
        if (this.abilityCooldownTicks > 0) {
            this.abilityCooldownTicks--;
        }

        // Spawn a particle batch every 180 ticks.
        if (this.spawnTimer.fireIfElapsed(tick)) {
            this.spawnParticle();
        }

        // Remove dead particles (older than 3 seconds = 180 ticks).
        // Array.filter returns a new array with only the entries that pass the test.
        this.particles = this.particles.filter((p) => tick - p.spawnTick < 180);

        // Update each particle's palette slot with its current color.
        // The hue is fixed at spawn time; only alpha changes as the particle ages.
        for (const p of this.particles) {
            const age = tick - p.spawnTick;
            const lifetime = 180;

            // t goes from 0 (just born) to 1 (fully aged, about to disappear).
            // Think of it like a candle burning down: 0 is a fresh candle, 1 is gone.
            const t = age / lifetime;

            // applyEasing(t, 'ease-in') starts slow and accelerates toward the end.
            // Subtracting from 1 flips it: alpha stays high for most of the particle's life,
            // then drops quickly right before it disappears - like a real spark that glows
            // brightly, then winks out all at once instead of fading evenly.
            const alpha = Math.floor(255 * (1 - applyEasing(t, 'ease-in')));

            // Hue is based on when the particle was spawned - no two batches look the same.
            const hue = (p.spawnTick * 3) % 360;

            // Compute the color and write it into this particle's reserved palette slot.
            const color = Color32.fromHSL(hue, 100, 60);
            this.palette.set(p.paletteSlot, new Color32(color.r, color.g, color.b, alpha));
        }

        // Update rock position in the Walking and Jumping states.
        this.updateRockPosition();
    }

    /**
     * Runs once per screen refresh to draw the rock, particles, and UI.
     * Notice: NO Color32 objects appear in draw calls - only palette indices and offsets.
     */
    render() {
        // Clear the whole screen with the shared UI theme's background color.
        BT.clear(this.theme.bg);

        // Green ground strip the rock stands on.
        BT.drawRectFill(new Rect2i(0, 150, 320, 90), C_GROUND);

        // Draw the character with a shadow below it.
        this.renderCharacter();

        // Large on-screen state indicator (overlay row also shows state + ticks).
        this.renderStateIndicator();

        // Draw any active particles.
        this.renderParticles();

        // Draw the timer readouts and the concept summary (shared UI kit groups).
        this.renderUI();
    }

    /**
     * Status row in the engine overlay: animation state (left) and tick count (right).
     *
     * @returns {readonly { leftText: string, rightText?: string }[]}
     */
    overlayRows() {
        const row = this.overlayRowData[0];
        row.leftText = `State: ${this.animState}`;
        row.rightText = `Ticks: ${BT.ticks}`;

        return this.overlayRowData;
    }

    /**
     * Automatically cycles through Idle -> Walking -> Jumping every 2 seconds each.
     * The full cycle is 6 seconds (360 ticks at 60 FPS).
     *
     * @param {number} tick - Current tick count.
     */
    autoCycleStates(tick) {
        // cyclePos goes 0..359, repeating.
        const cyclePos = tick % 360;

        if (cyclePos < 120) {
            // First 2 seconds: Idle. Rock sits still.
            if (this.animState !== AnimState.Idle) {
                this.animState = AnimState.Idle;
            }
        } else if (cyclePos < 240) {
            // Second 2 seconds: Walking. Rock slides sideways.
            if (this.animState !== AnimState.Walking) {
                this.animState = AnimState.Walking;
                this.walkStartX = this.charPos.x;
                this.walkDir = 1;
            }
        } else {
            // Last 2 seconds: Jumping. Rock follows a sine arc.
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

    /**
     * Moves the rock based on the current state.
     * Walk: slide left/right; Idle/Jump: handled via jump arc in render.
     */
    updateRockPosition() {
        if (this.animState === AnimState.Walking) {
            // Move 1 pixel per tick; bounce off screen edges.
            this.charPos.x += this.walkDir;

            if (this.charPos.x > 220) {
                this.walkDir = -1;
            }

            if (this.charPos.x < 60) {
                this.walkDir = 1;
            }
        }
    }

    /**
     * Draws the character sprite at the correct position, with a shadow below.
     * During Walking, srcRect cycles through walk frames based on distance from walkStartX.
     * During Jumping, the sprite moves up in an arc while the shadow stays on the ground.
     */
    renderCharacter() {
        let srcRect = this.walkFrames[0];

        if (this.animState === AnimState.Walking) {
            // walkStartX is where the walk began; every few pixels, advance to the next frame.
            const steps = Math.abs(this.charPos.x - this.walkStartX);
            const walkFrame = 1 + (Math.floor(steps / 3) % 3);
            srcRect = this.walkFrames[walkFrame];
        }

        // Calculate the vertical offset for the jump arc.
        let yOffset = 0;

        if (this.animState === AnimState.Jumping) {
            const jumpProgress = (BT.ticks - this.jumpStartTick) / this.jumpDuration;
            yOffset = -Math.abs(Math.sin(jumpProgress * Math.PI) * 35);
        }

        const drawPos = new Vector2i(this.charPos.x, this.charPos.y + Math.floor(yOffset));
        BT.drawSprite(this.spriteSheet, srcRect, drawPos, 0);

        const shadowY = this.charPos.y + srcRect.height - 4;
        BT.drawRectFill(new Rect2i(this.charPos.x + 3, shadowY, srcRect.width - 6, 4), C_SHADOW);
    }

    /**
     * Draws the state readout so the Idle / Walking / Jumping cycle is obvious on screen:
     * a small kit panel in the top-right corner plus a color strip on the ground edge.
     */
    renderStateIndicator() {
        // Pick the scene slot for the strip and the kit text role for the panel label.
        // Idle is calm gray/dim, Walking is "go" green, Jumping is alert red/orange.
        let stripColor = C_STATE_IDLE;
        let stateRole = 'dim';

        if (this.animState === AnimState.Walking) {
            stripColor = C_STATE_WALK;
            stateRole = 'accent';
        } else if (this.animState === AnimState.Jumping) {
            stripColor = C_STATE_JUMP;
            stateRole = 'warm';
        }

        // A small bordered kit panel in the top-right corner names the current state.
        ui.begin('topRight');
        ui.panel('State');
        ui.label(this.animState, { color: stateRole });
        ui.end();

        // A matching color strip painted right into the scene, on the ground edge, so
        // you can see the state change even without reading the panel text.
        BT.drawRectFill(new Rect2i(218, 152, 96, 6), stripColor);
        ui.caption(218, 161, 'State machine', { color: 'dim' });
    }

    /**
     * Spawns a new particle near the rock's position.
     * Each particle gets its own reserved palette slot from the rotating pool.
     */
    spawnParticle() {
        // Rotate through 20 slots in a circle.
        // When the pool wraps around, old particles' slots get reused.
        const slot = PARTICLE_SLOT_START + (this.nextParticleSlot % MAX_PARTICLES);
        this.nextParticleSlot++;

        const x = this.charPos.x + Math.floor(Math.random() * 30) - 5;
        const y = this.charPos.y + Math.floor(Math.random() * 20) - 15;

        this.particles.push({
            pos: new Vector2i(x, y),
            spawnTick: BT.ticks,
            paletteSlot: slot, // This particle "owns" this palette slot.
        });
    }

    /**
     * Draws all active particles as small colored squares.
     * The color for each particle was already updated in update() via palette.set().
     * Here we just use the slot number - no Color32 needed.
     */
    renderParticles() {
        for (const p of this.particles) {
            // Draw a 4x4 square. The color is whatever update() put in p.paletteSlot.
            BT.drawRectFill(new Rect2i(p.pos.x - 2, p.pos.y - 2, 4, 4), p.paletteSlot);
        }
    }

    /**
     * Draws the timer readouts and the concept summary with the shared UI kit.
     * State and tick count are shown in overlayRows() above the bottom FPS bar.
     */
    renderUI() {
        // How much of the cooldown is still left, as a fraction from 0 (ready) to 1 (full).
        const cooldownPercent = Math.max(0, this.abilityCooldownTicks / this.abilityCooldownDuration);

        // Ask the timer how many ticks are left until the next spawn event.
        const ticksUntilSpawn = this.spawnTimer.remainingTicks(BT.ticks);

        // Timer readouts: a borderless kit group pinned near the top-left corner.
        // { x, y } pin the group's top-left corner; the kit stacks the rows below it.
        ui.begin('topLeft', { x: 4, y: 22 });

        // Orange while counting down, green once the ability is ready again.
        // Math.ceil rounds up, so "1s" shows until the very last tick of the cooldown.
        const cooldownSecs = Math.ceil(this.abilityCooldownTicks / 60);
        ui.label(`Cooldown: ${cooldownSecs}s`, { color: cooldownPercent > 0 ? 'warm' : 'accent' });

        // A read-only kit meter replaces the old hand-drawn cooldown bar rectangles.
        ui.meter(null, cooldownPercent, { color: 'warm', width: 100 });

        ui.label(`Next spawn: ${Math.ceil(ticksUntilSpawn / 60)}s`, { color: 'header' });
        ui.label(`Particles: ${this.particles.length}`, { color: 'dim' });
        ui.end();

        // Concept summary: another borderless kit group, pinned over the ground strip.
        ui.begin('topLeft', { x: 4, y: 162 });
        ui.label('Tick-based timing:', { color: 'header' });
        ui.label('- Tick-based timing (update rate)', { color: 'dim' });
        ui.label('- Cooldown & event scheduling', { color: 'dim' });
        ui.label('- State machine transitions', { color: 'dim' });
        ui.end();
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
