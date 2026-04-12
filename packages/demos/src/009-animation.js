// Demo 009 -- Animation and timing: how to animate sprites using tick-based timing.
//
// Prerequisites: 001-Basics (https://vancura.dev/articles/blit-tech-basics),
// 008-Sprites (https://vancura.dev/articles/blit-tech-sprites).
// Live article: https://vancura.dev/articles/blit-tech-animation
//
// In Blit-Tech, the tick counter goes up once per update() call at a fixed rate (targetFPS),
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
// All timing is done by comparing BT.ticks() to a stored "start tick".
// Each tick is one update() call; at targetFPS = 60, one tick is 1/60 of a second.
//
// HOW PARTICLE COLORS WORK:
//
// Each particle gets its own palette slot at the moment it is spawned.
// In update(), we compute the color (hue from spawn time, alpha from age)
// and write it into that slot with palette.set(). In render(), we just
// use the particle's slot number -- no Color32 objects needed there.
//
// We used the same idea in Demo 016-Palette-Animation:
// https://vancura.dev/articles/blit-tech-palette-animation

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region State Constants

// AnimState defines the three states the moving rock can be in.
// Object.freeze prevents these values from being changed by accident.
const AnimState = Object.freeze({
    Idle: 'Idle', // The rock is sitting still.
    Walking: 'Walking', // The rock is sliding across the screen.
    Jumping: 'Jumping', // The rock is following a jump arc.
});

// #endregion

// #region Configuration

// How many particles can be alive at once. Each gets its own palette slot.
const MAX_PARTICLES = 20;

// Where in the palette particle colors are stored (slots 50..69).
const PARTICLE_SLOT_START = 50;

// Where the sprite's colors start (slots 20..20+N-1, where N is extracted at runtime).
const SPRITE_BASE = 20;

// UI color slots (1..18).
const C_WHITE = 1;
const C_BG = 2; // (30, 20, 40) dark purple.
const C_GROUND = 3; // (40, 60, 40) dark green.
const C_SHADOW = 4; // (0, 0, 0, 100) semi-transparent shadow.
const C_STATE_TEXT = 5; // (100, 200, 255) blue info text.
const C_STAT_DIM = 6; // (150, 150, 150) gray stat text.
const C_COOLDOWN_ACTIVE = 7; // (255, 100, 100) red cooldown label.
const C_COOLDOWN_READY = 8; // (100, 255, 100) green ready label.
const C_COOLDOWN_BG = 9; // (40, 40, 40) dark bar background.
const C_COOLDOWN_BAR = 10; // (255, 100, 100) red bar fill.
const C_COOLDOWN_BORDER = 11; // (150, 150, 150) bar outline.
const C_SPAWN_TEXT = 12; // (200, 200, 100) yellow spawn text.
const C_INFO_HEADER = 13; // (255, 200, 100) golden section header.
const C_INFO_TEXT = 14; // (180, 180, 180) gray info text.
const C_FPS = 15; // (100, 100, 100) dim FPS text.

// #endregion

// #region Demo Class

/**
 * Demonstrates tick-based animation timing and state management.
 * Shows state machines, cooldowns, periodic particle events, and jump arcs.
 * The "character" is the rock sprite from test.png.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The palette holds all colors used in this demo.
    palette = null;

    // The sprite sheet loaded from /sprites/test.png.
    spriteSheet = null;

    // The source rectangle for the rock sprite (set after loading).
    charSprite = null;

    // How many unique colors the sprite has (used to compute palette offset).
    spriteColorCount = 0;

    // Animation state tracks what the rock is currently doing.
    animState = AnimState.Idle;

    // The rock's position on screen (top-left corner).
    charPos = new Vector2i(80, 100);

    // abilityCooldownTicks counts down how many ticks the ability is still unavailable.
    abilityCooldownTicks = 0;

    // Total duration of the cooldown (2 seconds at 60 FPS = 120 ticks).
    abilityCooldownDuration = 120;

    // lastSpawnTick records when the last particle was spawned.
    lastSpawnTick = 0;

    // How many ticks between particle spawns (3 seconds at 60 FPS = 180 ticks).
    spawnInterval = 180;

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

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Tells the engine the screen size and target frame rate.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    queryHardware() {
        return {
            displaySize: new Vector2i(320, 240),
            canvasDisplaySize: new Vector2i(640, 480),
            targetFPS: 60,
        };
    }

    /**
     * Sets up the palette, loads the sprite and font.
     *
     * @returns {Promise<boolean>} Returns true when everything is ready.
     */
    async initialize() {
        console.log('[AnimationDemo] Initializing...');

        // --- Create palette and fill static UI colors ---
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(30, 20, 40));
        this.palette.set(C_GROUND, new Color32(40, 60, 40));
        this.palette.set(C_SHADOW, new Color32(0, 0, 0, 100));
        this.palette.set(C_STATE_TEXT, new Color32(100, 200, 255));
        this.palette.set(C_STAT_DIM, new Color32(150, 150, 150));
        this.palette.set(C_COOLDOWN_ACTIVE, new Color32(255, 100, 100));
        this.palette.set(C_COOLDOWN_READY, new Color32(100, 255, 100));
        this.palette.set(C_COOLDOWN_BG, new Color32(40, 40, 40));
        this.palette.set(C_COOLDOWN_BAR, new Color32(255, 100, 100));
        this.palette.set(C_COOLDOWN_BORDER, new Color32(150, 150, 150));
        this.palette.set(C_SPAWN_TEXT, new Color32(200, 200, 100));
        this.palette.set(C_INFO_HEADER, new Color32(255, 200, 100));
        this.palette.set(C_INFO_TEXT, new Color32(180, 180, 180));
        this.palette.set(C_FPS, new Color32(100, 100, 100));

        // Particle slots (50..69) start as transparent -- update() fills them when particles spawn.
        // We pre-fill with a dim white so nothing shows before the first particle.
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.palette.set(PARTICLE_SLOT_START + i, new Color32(0, 0, 0, 0));
        }

        // --- Extract sprite colors and register in palette at SPRITE_BASE ---
        this.spriteColorCount = await this.extractSpriteColors('/sprites/test.png', SPRITE_BASE);

        // --- Activate the palette ---
        BT.paletteSet(this.palette);

        // --- Load sprite ---
        try {
            this.spriteSheet = await SpriteSheet.load('/sprites/test.png');

            // Get sprite dimensions for the src rectangle.
            const img = new Image();
            img.src = '/sprites/test.png';
            await new Promise((resolve) => {
                img.onload = () => resolve();
            });
            this.charSprite = new Rect2i(0, 0, img.naturalWidth, img.naturalHeight);

            // Link sprite pixels to palette indices.
            this.spriteSheet.indexize(this.palette);
            console.log(`[AnimationDemo] Loaded sprite: ${img.naturalWidth}x${img.naturalHeight}px`);
        } catch (error) {
            console.error('[AnimationDemo] Failed to load sprite:', error);
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
        const tick = BT.ticks();

        // Auto-cycle through states every 2 seconds (120 ticks at 60 FPS).
        this.autoCycleStates(tick);

        // Count down the cooldown. It never goes below zero.
        if (this.abilityCooldownTicks > 0) {
            this.abilityCooldownTicks--;
        }

        // Spawn a particle batch every spawnInterval ticks.
        if (tick - this.lastSpawnTick >= this.spawnInterval) {
            this.spawnParticle();
            this.lastSpawnTick = tick;
        }

        // Remove dead particles (older than 3 seconds = 180 ticks).
        // Array.filter returns a new array with only the entries that pass the test.
        this.particles = this.particles.filter((p) => tick - p.spawnTick < 180);

        // Update each particle's palette slot with its current color.
        // The hue is fixed at spawn time; only alpha changes as the particle ages.
        for (const p of this.particles) {
            const age = tick - p.spawnTick;
            const lifetime = 180;

            // Alpha fades from 255 (solid) to 0 (invisible) as the particle ages.
            const alpha = Math.floor(255 * (1 - age / lifetime));

            // Hue is based on when the particle was spawned -- no two batches look the same.
            const hue = (p.spawnTick * 3) % 360;

            // Compute the color and write it into this particle's reserved palette slot.
            const color = Color32.fromHSL(hue, 100, 60);
            this.palette.set(p.paletteSlot, new Color32(color.r, color.g, color.b, alpha));
        }

        // Update rock position in the Walking and Jumping states.
        this.updateRockPosition(tick);
    }

    /**
     * Runs once per screen refresh to draw the rock, particles, and UI.
     * Notice: NO Color32 objects appear in draw calls -- only palette indices and offsets.
     */
    render() {
        BT.clear(C_BG);

        if (!this.spriteSheet) {
            BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'Loading...');
            return;
        }

        // Green ground strip the rock stands on.
        BT.drawRectFill(new Rect2i(0, 150, 320, 90), C_GROUND);

        // Draw the rock with a shadow below it.
        this.renderCharacter();

        // Draw any active particles.
        this.renderParticles();

        // Draw the info panel.
        this.renderUI();
    }

    // #endregion

    // #region State Machine

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
     *
     * @param {number} _tick - Current tick count (reserved for future use).
     */
    updateRockPosition(_tick) {
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

    // #endregion

    // #region Rendering

    /**
     * Draws the rock sprite at the correct position, with a shadow below.
     * During a jump the sprite moves up in an arc while the shadow stays on the ground.
     *
     * The sprite is drawn with paletteOffset=0, meaning it uses its original colors
     * (whatever palette[SPRITE_BASE..] was filled with from the PNG).
     */
    renderCharacter() {
        if (!this.spriteSheet || !this.charSprite) {
            return;
        }

        // Calculate the vertical offset for the jump arc.
        let yOffset = 0;

        if (this.animState === AnimState.Jumping) {
            // jumpProgress goes 0 (just launched) to 1 (landing).
            const jumpProgress = (BT.ticks() - this.jumpStartTick) / this.jumpDuration;

            // Math.sin(0) = 0, Math.sin(PI/2) = 1, Math.sin(PI) = 0.
            // Multiplying by PI gives an arc that starts and ends at 0.
            // Negative means "up" (y=0 is the top of the screen).
            yOffset = -Math.abs(Math.sin(jumpProgress * Math.PI) * 35);
        }

        // Draw the rock sprite. paletteOffset=0 uses the original stone colors.
        const drawPos = new Vector2i(this.charPos.x, this.charPos.y + Math.floor(yOffset));
        BT.drawSprite(this.spriteSheet, this.charSprite, drawPos, 0);

        // Shadow: a dark semi-transparent rectangle that always stays on the ground.
        const shadowY = this.charPos.y + this.charSprite.height - 4;
        BT.drawRectFill(new Rect2i(this.charPos.x + 4, shadowY, this.charSprite.width - 8, 4), C_SHADOW);
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
            spawnTick: BT.ticks(),
            paletteSlot: slot, // This particle "owns" this palette slot.
        });
    }

    /**
     * Draws all active particles as small colored squares.
     * The color for each particle was already updated in update() via palette.set().
     * Here we just use the slot number -- no Color32 needed.
     */
    renderParticles() {
        for (const p of this.particles) {
            // Draw a 4x4 square. The color is whatever update() put in p.paletteSlot.
            BT.drawRectFill(new Rect2i(p.pos.x - 2, p.pos.y - 2, 4, 4), p.paletteSlot);
        }
    }

    /**
     * Draws the information panel showing state, tick count, cooldown, and spawn timer.
     */
    renderUI() {
        // Title in white. systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'ANIMATION & TIMING DEMO');

        // Current state (e.g. "State: Jumping").
        BT.systemPrint(new Vector2i(10, 28), C_STATE_TEXT, `State: ${this.animState}`);

        // Ticks since start.
        BT.systemPrint(new Vector2i(10, 42), C_STAT_DIM, `Ticks: ${BT.ticks()}`);

        // Cooldown bar.
        this.renderCooldownUI();

        // Particle spawn timer.
        this.renderSpawnTimerUI();

        // Concept summary.
        BT.systemPrint(new Vector2i(10, 168), C_INFO_HEADER, 'Tick-based timing:');
        BT.systemPrint(new Vector2i(10, 182), C_INFO_TEXT, '- Deterministic frame timing');
        BT.systemPrint(new Vector2i(10, 196), C_INFO_TEXT, '- Cooldown & event scheduling');
        BT.systemPrint(new Vector2i(10, 210), C_INFO_TEXT, '- State machine transitions');

        // FPS.
        BT.systemPrint(new Vector2i(250, 225), C_FPS, `FPS: ${BT.fps()}`);
    }

    /**
     * Draws the ability cooldown bar and timer.
     */
    renderCooldownUI() {
        const cooldownPercent = Math.max(0, this.abilityCooldownTicks / this.abilityCooldownDuration);

        // Red when counting down, green when ready. systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(
            new Vector2i(10, 58),
            cooldownPercent > 0 ? C_COOLDOWN_ACTIVE : C_COOLDOWN_READY,
            `Cooldown: ${Math.ceil(this.abilityCooldownTicks / 60)}s`,
        );

        // Bar background.
        const barWidth = 100;
        const barHeight = 8;
        const barX = 10;
        const barY = 75;
        BT.drawRectFill(new Rect2i(barX, barY, barWidth, barHeight), C_COOLDOWN_BG);

        // Bar fill (scales with remaining fraction).
        if (cooldownPercent > 0) {
            const fillWidth = Math.floor(barWidth * cooldownPercent);
            BT.drawRectFill(new Rect2i(barX, barY, fillWidth, barHeight), C_COOLDOWN_BAR);
        }

        // Bar border.
        BT.drawRect(new Rect2i(barX, barY, barWidth, barHeight), C_COOLDOWN_BORDER);
    }

    /**
     * Shows the spawn timer countdown and particle count.
     */
    renderSpawnTimerUI() {
        const ticksUntilSpawn = this.spawnInterval - (BT.ticks() - this.lastSpawnTick);

        // systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(new Vector2i(10, 95), C_SPAWN_TEXT, `Next spawn: ${Math.ceil(ticksUntilSpawn / 60)}s`);
        BT.systemPrint(new Vector2i(10, 110), C_STAT_DIM, `Particles: ${this.particles.length}`);
    }

    // #endregion

    // #region Sprite Color Extraction

    /**
     * Loads a PNG, finds all unique non-transparent pixel colors, sorts them by
     * brightness (darkest first), and registers them in the palette at startSlot.
     *
     * @param {string} imageUrl - URL of the PNG file to sample.
     * @param {number} startSlot - First palette slot to use.
     * @returns {Promise<number>} Number of unique colors registered.
     */
    async extractSpriteColors(imageUrl, startSlot) {
        const img = new Image();
        img.src = imageUrl;
        await new Promise((resolve) => {
            img.onload = () => resolve();
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const { data } = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);

        const seen = new Map();
        const unique = [];

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a === 0) {
                continue;
            }

            const key = `${r},${g},${b},${a}`;

            if (!seen.has(key)) {
                seen.set(key, true);
                unique.push(new Color32(r, g, b, a));
            }
        }

        unique.sort((a, b) => {
            return a.r * 0.299 + a.g * 0.587 + a.b * 0.114 - (b.r * 0.299 + b.g * 0.587 + b.b * 0.114);
        });

        for (let i = 0; i < unique.length; i++) {
            this.palette.set(startSlot + i, unique[i]);
        }

        return unique.length;
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
