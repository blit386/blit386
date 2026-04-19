// Demo 018 -- Flurry: a retro screensaver built on particle physics and palette animation.
//
// Ported from the classic macOS Flurry screensaver by Calum Robinson (2002).
// Original source: https://github.com/calumr/flurry
//
// WHAT IS FLURRY?
// Flurry was a free screensaver for macOS that showed a cloud of glowing particles
// swirling around invisible "sparks" -- points in space that pull particles toward them
// like tiny gravity wells. Twelve sparks trace beautiful figure-eight-like paths
// (called Lissajous orbits), and hundreds of particles spiral around them.
//
// HOW DOES THIS VERSION DIFFER FROM THE ORIGINAL?
// The original Flurry used "additive blending" -- overlapping particles added their light
// together to create soft glowing halos. Blit-Tech does not support that technique.
// Instead, we use palette animation: every frame, we rewrite the palette so that young
// particles appear bright and large, while old particles appear dim and small.
// The mesmerizing orbital motion and rainbow color cycling are fully preserved.
//
// KEY PHYSICS CONCEPTS:
//   Inverse-square gravity -- each particle is pulled toward every spark.
//     The closer the particle, the stronger the pull. Same law as real planets.
//   Drag -- a tiny friction force applied each tick, slowing particles gradually.
//   Lissajous orbit -- a path traced by two sine waves with different frequencies.
//     The spark's x position follows one sine wave; its y position follows another.
//     When the frequencies are slightly different, the path never exactly repeats.
//
// Prerequisites:
//   001-Basics            https://vancura.dev/articles/blit-tech-basics
//   016-Palette-Animation https://vancura.dev/articles/blit-tech-palette-animation

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Target frame rate used in queryHardware() and to advance the animation clock in update().
const TARGET_FPS = 60;

// --- World space ---
// Particles and sparks live in a virtual coordinate system measured in abstract "world units".
// FIELD_RANGE is the half-extent: the center is (0, 0), and the edges are ±FIELD_RANGE.
// Sparks are constrained to orbit within 80% of this range, so ±8000 units.
// When drawing, world units are converted to screen pixels using the formulas at the bottom.
const FIELD_RANGE = 10000;

// --- Simulation ---
// How many particles are kept alive at once.
// More particles = denser, richer swirls, but more work each frame.
// 800 particles at 60 FPS means the physics loop runs 800 × 60 = 48,000 times per second.
const PARTICLE_COUNT = 800;

// How many attractor sparks (invisible gravity wells) orbit the screen at once.
// 12 is the same count as the original Flurry screensaver.
const SPARK_COUNT = 12;

// --- Physics constants (from the original Flurry source) ---
// How strong the gravity pull is between a particle and a spark.
// A larger number means particles get sucked in faster.
const GRAVITY_CONST = 1500000;

// How much velocity the particle keeps each tick (a fraction between 0 and 1).
// The ** operator is JavaScript's "exponent" symbol: base ** exponent.
// 0.9965^(85/60) is the original Flurry formula; the result is about 0.9950.
// That means each tick a particle keeps 99.5% of its speed -- very gentle drag.
const DRAG_FACTOR = 0.9965 ** (85 / 60);

// How fast newly spawned particles shoot outward from their spark, in world units per tick.
// Combined with the spark's own velocity (added at spawn), this gives each particle
// a unique direction so they fan out rather than all travelling the same way.
const STREAM_SPEED = 15;

// How far from the exact spark position a new particle may appear, in world units.
// A small scatter means particles start in a tight cluster very close to the spark.
// Without scatter, every particle would start at the same point and overlap completely.
const SPAWN_SCATTER = 30;

// The fastest a particle is ever allowed to move, in world units per tick.
// Without this cap, a particle that passes very close to a spark could accelerate
// to enormous speeds and shoot instantly off screen.
const SPEED_CAP = 600;

// --- Palette animation ---
// How many degrees the global hue rotates per tick.
// At 60 FPS: 0.4 degrees/tick × 60 ticks/sec = 24 degrees/sec.
// One full rotation (360 degrees) takes 360 / 24 = 15 seconds.
// During those 15 seconds every particle cycles through red, orange, yellow, green,
// cyan, blue, violet, and back to red -- a complete rainbow.
const HUE_ADVANCE = 0.4;

// Lightness values (brightness) for the 5 particle age tiers.
// Tier 0 is used for newborn particles (age near 0); tier 4 is used for dying particles (age near 1).
// HSL lightness scale: 0 = pure black, 50 = vivid full color, 100 = pure white.
// Going from 85 down to 20 makes particles fade from near-white to nearly invisible as they age.
const TIER_LIGHTNESS = [85, 68, 52, 36, 20];

// --- Screen layout ---
// The logical resolution of the canvas in pixels. This is the number of "dots" in the display,
// not the size of the window (the window is 2x larger, set in queryHardware).
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Half-dimensions: the number of pixels from the center to each edge.
// Used for the world-to-screen conversion: screenX = (worldX / FIELD_RANGE) * HALF_W + HALF_W.
//   - (worldX / FIELD_RANGE) gives a fraction from -1 to +1.
//   - Multiplying by HALF_W stretches that to -HALF_W..+HALF_W pixels.
//   - Adding HALF_W shifts the result to 0..DISPLAY_W, placing (0,0) at the screen center.
const HALF_W = DISPLAY_W / 2; // 160
const HALF_H = DISPLAY_H / 2; // 120

// --- Palette strip ---
// A thin strip at the very bottom of the screen shows the live palette.
// Two rows are drawn there:
//   Top row (3 px tall): 12 spark-bright slots, each ~26 px wide.
//   Bottom row (4 px tall): 40 particle slots (8 hues x 5 tiers), each 8 px wide.
// Watching this strip is the clearest way to see the hue rotation happening in real time.
const PALETTE_STRIP_SPARK_Y = DISPLAY_H - 7; // Spark color row top edge (y = 233).
const PALETTE_STRIP_SPARK_H = 3; // 3 px tall.
const PALETTE_STRIP_PART_Y = DISPLAY_H - 4; // Particle color row top edge (y = 236).
const PALETTE_STRIP_PART_H = 4; // 4 px tall.

// Palette slot numbers -- "addresses" in the 256-slot color table.
// Slot 0 is always transparent; the engine reserves it. Never write to slot 0.
//
// Think of each slot as a numbered paint pot.
// update() refills the pots every tick with fresh Color32 objects.
// render() only reads the pot numbers -- it never touches Color32 directly.
// This separation is the essence of palette animation.
const C_WHITE = 1; // Pure white.
const C_BG = 2; // Near-black deep-space background color.
const C_TITLE = 3; // Golden yellow title text.
const C_FPS = 5; // Very dim gray FPS counter.
const C_SPARK_CORE = 6; // White-hot single-pixel center of each spark.

// Particle color ramp: 8 hue bands × 5 brightness tiers = 40 slots (10..49).
// To find the slot for a particle: C_PARTICLE_BASE + hueIndex * 5 + tier
//   hueIndex (0..7): which color family the particle belongs to.
//   tier (0..4): how bright (0 = newborn/bright, 4 = old/dim).
// Example: hueIndex=2, tier=1 → slot 10 + 2*5 + 1 = slot 21.
const C_PARTICLE_BASE = 10;

// Spark body colors: one bright vivid slot per spark. Slots 100..111 (12 sparks).
// Spark i uses slot C_SPARK_BRIGHT + i.
const C_SPARK_BRIGHT = 100;

// Spark halo colors: one dimmer slot per spark. Slots 112..123 (12 sparks).
// Same hue as the bright slot but lower lightness and saturation, to suggest a glow ring.
const C_SPARK_HALO = 112;

// Each row defines one spark's orbit parameters and color offset.
// Format: [freqX, freqY, phaseX, phaseY, hueOffset]
//
//   freqX, freqY: how fast the spark oscillates on each axis (in radians per second).
//     Slightly different values give each spark a unique, non-repeating figure-eight path.
//
//   phaseX, phaseY: starting position on the path (in radians, 0..6.28 = full circle).
//     Different phases spread the 12 sparks out so they are not all bunched up at startup.
//
//   hueOffset: this spark's "personal" color offset (0..330 degrees, in steps of 30).
//     With 12 sparks at 30-degree intervals, each one displays a different rainbow hue.
const SPARK_TABLE = [
    [1.0, 1.1, 0.0, 0.0, 0],
    [0.85, 0.95, 0.6, 1.2, 30],
    [1.2, 0.8, 1.2, 2.4, 60],
    [0.95, 1.3, 1.8, 3.6, 90],
    [1.3, 0.9, 2.4, 4.8, 120],
    [0.75, 1.2, 3.0, 0.6, 150],
    [1.1, 0.75, 3.6, 1.8, 180],
    [0.9, 1.0, 4.2, 3.0, 210],
    [1.25, 1.15, 4.8, 4.2, 240],
    [0.8, 0.85, 0.3, 5.4, 270],
    [1.05, 1.25, 5.4, 0.9, 300],
    [1.15, 0.95, 5.1, 2.1, 330],
];

// #endregion

// #region Main Logic

/**
 * Retro port of the classic macOS Flurry screensaver.
 * Twelve spark attractors trace Lissajous orbit paths; PARTICLE_COUNT particles spiral
 * around them via inverse-square gravity. Palette animation cycles a full rainbow every 15 seconds.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The 256-slot palette used for all drawing. Filled in initialize(), updated every tick.
    palette = null;

    // Total elapsed animation time, measured in seconds.
    // Grows by exactly 1/60 each tick (at 60 FPS).
    // The spark position formula uses this as its clock -- every tick the sparks move forward.
    animTime = 0;

    // Current hue rotation offset in degrees (0..359).
    // Increases by HUE_ADVANCE each tick. When it reaches 360 it wraps back to 0.
    // Every palette slot that holds a particle or spark color uses this offset, so
    // when huePhase changes by even a tiny amount, every color on screen shifts together.
    huePhase = 0;

    // Array of SPARK_COUNT spark objects (the invisible gravity-well attractors).
    // Created in initSparks(). Each spark has:
    //   x, y        -- current world position
    //   vx, vy      -- instantaneous velocity (used as a hint when spawning particles)
    //   freqX, freqY  -- oscillation frequencies for the Lissajous orbit
    //   phaseX, phaseY -- starting angles on the orbit path
    //   hueOffset   -- this spark's personal color angle on the rainbow (0..330 degrees)
    sparks = [];

    // Array of PARTICLE_COUNT particle objects. Created in initParticles(), reused forever.
    // Dead particles are respawned rather than deleted. Each particle has:
    //   x, y        -- current world position
    //   vx, vy      -- current velocity
    //   age         -- how old the particle is (0.0 = newborn, 1.0 = about to die)
    //   ageRate     -- how fast it ages each tick (varies slightly per particle)
    //   hueIndex    -- which of the 8 color families it belongs to (0..7)
    //   alive       -- false means the particle is waiting to be respawned
    particles = [];

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Tells the engine how to set up the display before anything else runs.
     *
     * displaySize is the logical resolution -- the number of pixels the demo draws into.
     * canvasDisplaySize is how large the canvas appears on screen. Setting it to 2x
     * makes each logical pixel four physical pixels (2 wide × 2 tall), giving the
     * chunky retro look of old game hardware without reducing actual pixel count.
     * targetFPS is how many times per second update() and render() are called.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    queryHardware() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            canvasDisplaySize: new Vector2i(DISPLAY_W * 2, DISPLAY_H * 2),
            targetFPS: TARGET_FPS,
        };
    }

    /**
     * Builds the palette, loads the font, and creates sparks and particles.
     * Runs once before the first update() call.
     *
     * @returns {Promise<boolean>}
     */
    async initialize() {
        console.log('[FlurryDemo] Initializing...');

        // --- Build the palette ---
        // We pre-fill all static (never-changing) slots now.
        // The dynamic particle and spark color slots start as black and are
        // overwritten every frame by updatePalette() inside update().
        this.palette = BT.paletteCreate(256);

        // Static colors that never change during the demo.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // Pure white for font.
        this.palette.set(C_BG, new Color32(4, 6, 12)); // Near-black deep-space blue.
        this.palette.set(C_TITLE, new Color32(255, 210, 80)); // Golden yellow for title.
        this.palette.set(C_FPS, new Color32(55, 55, 75)); // Very dim for FPS counter.
        this.palette.set(C_SPARK_CORE, new Color32(255, 255, 255)); // White-hot spark center.

        // Fill all 40 particle color slots with black as a placeholder.
        // 8 hues × 5 tiers = 40 total. They will be overwritten on the very first update().
        // We set them now so the palette has no uninitialized gaps.
        for (let i = 0; i < 8 * 5; i++) {
            this.palette.set(C_PARTICLE_BASE + i, new Color32(0, 0, 0));
        }

        // Fill all 24 spark color slots with black as a placeholder.
        // 12 bright slots (one per spark) and 12 halo slots (one per spark).
        for (let i = 0; i < SPARK_COUNT; i++) {
            this.palette.set(C_SPARK_BRIGHT + i, new Color32(0, 0, 0));
            this.palette.set(C_SPARK_HALO + i, new Color32(0, 0, 0));
        }

        // Activate the palette. From this point on, all drawing uses these color slots.
        BT.paletteSet(this.palette);

        // --- Create sparks ---
        // Sparks are the invisible gravity wells that all particles orbit around.
        this.initSparks();

        // --- Create particles ---
        // All PARTICLE_COUNT particles are created here and reused for the life of the demo.
        this.initParticles();

        // Run one update cycle so all palette slots have real colors before the first render.
        // Without this, every slot would be black on the very first frame.
        this.update();

        console.log('[FlurryDemo] Initialized');
        return true;
    }

    /**
     * Runs 60 times per second. Advances physics and rewrites palette colors.
     * All Color32 work happens here; render() only ever uses slot numbers.
     */
    update() {
        // Advance time. Each tick is exactly 1/60 of a second at 60 FPS.
        this.animTime += 1 / TARGET_FPS;

        // Rotate the global hue. The % operator wraps the angle back to 0 at 360.
        this.huePhase = (this.huePhase + HUE_ADVANCE) % 360;

        // Move all 12 sparks along their orbital Lissajous paths.
        this.updateSparks();

        // Update physics for every particle.
        // Alive particles get gravity, drag, and position update.
        // Dead particles are immediately respawned near a random spark.
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            if (this.particles[i].alive) {
                this.updateParticle(this.particles[i]);
            } else {
                this.spawnParticle(this.particles[i]);
            }
        }

        // Recompute all dynamic palette colors for this frame.
        this.updatePalette();
    }

    /**
     * Draws the current frame. Only palette slot numbers appear here -- no Color32 objects.
     * All color decisions were already made in update() and stored in the palette.
     */
    render() {
        // Wipe every pixel to the background color before drawing anything new.
        // Without this, the previous frame's particles would remain visible as ghost trails.
        BT.clear(C_BG);

        // Draw all particles (two passes: dim old ones first, bright young ones on top).
        this.renderParticles();

        // Draw the 12 spark attractors on top of everything.
        this.renderSparks();

        // Title in the top-left corner using the built-in system font.
        // BT.systemPrint() arguments: (position, paletteIndex, text).
        // C_TITLE (slot 3) is the golden yellow color set up in initialize().
        BT.systemPrint(new Vector2i(4, 4), C_TITLE, 'Flurry');

        // FPS counter in the top-right corner in the very dim gray (C_FPS = slot 5).
        BT.systemPrint(new Vector2i(258, 4), C_FPS, `${BT.fps()} fps`);

        // Palette strip along the very bottom of the screen.
        // Shows the live particle and spark color slots as small colored squares.
        // As huePhase advances, watch this strip cycle through the entire rainbow.
        this.renderPaletteStrip();
    }

    // #endregion

    // #region Physics Helpers

    /**
     * Creates all 12 spark objects from SPARK_TABLE and positions them at time 0.
     */
    initSparks() {
        for (let i = 0; i < SPARK_COUNT; i++) {
            // Destructuring: pull the five values out of this row of SPARK_TABLE.
            const [freqX, freqY, phaseX, phaseY, hueOffset] = SPARK_TABLE[i];

            this.sparks.push({
                x: 0, // Current world x position (set by updateSparks).
                y: 0, // Current world y position.
                vx: 0, // Instantaneous velocity on x (used for spawn direction hint).
                vy: 0, // Instantaneous velocity on y.
                freqX, // How fast the spark oscillates horizontally.
                freqY, // How fast the spark oscillates vertically.
                phaseX, // Starting angle on the x sine wave.
                phaseY, // Starting angle on the y cosine wave.
                hueOffset, // This spark's personal color angle on the rainbow wheel.
            });
        }

        // Run one updateSparks() so all sparks have correct positions before particles spawn.
        this.updateSparks();
    }

    /**
     * Creates all PARTICLE_COUNT particle objects and spreads them across random ages.
     *
     * Spreading ages (called "staggering") is important: if all particles started at
     * age 0 together, they would all reach age 1 at the same moment and all die together.
     * The screen would flash blank for one frame while they all respawned. Staggering
     * avoids this by giving each particle a different head start.
     */
    initParticles() {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            // Pre-create each particle with dummy values. spawnParticle() will overwrite them.
            // We push the object first so it exists in the array before spawnParticle() runs.
            this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, ageRate: 0.002, hueIndex: 0, alive: false });

            // Set real position, velocity, hue, and age rate using the full spawn logic.
            this.spawnParticle(this.particles[i]);

            // Override age with a random value so this particle starts mid-life.
            // Math.random() returns a different number each time it is called,
            // ranging from 0.0 (just born) to just under 1.0 (almost dead).
            this.particles[i].age = Math.random();
        }
    }

    /**
     * Moves one particle forward one tick: gravity, drag, speed cap, position.
     *
     * @param {object} p - The particle to update.
     */
    updateParticle(p) {
        // Advance the particle's age by its personal ageRate (about 0.002 per tick).
        // age counts from 0.0 (just born) toward 1.0 (end of life).
        // Think of it like a candle burning down -- each tick uses a little more.
        p.age += p.ageRate;

        if (p.age >= 1.0) {
            // The particle has reached the end of its life. Mark it dead so that the
            // main update() loop can respawn it in the next iteration.
            p.alive = false;
            return; // Nothing more to do for a dead particle this tick.
        }

        // --- Gravity from all 12 sparks ---
        // We add up the gravitational pull from every spark.
        // Each spark pulls the particle a little bit; the total is the net acceleration.
        let ax = 0; // Accumulated acceleration on the x axis.
        let ay = 0; // Accumulated acceleration on the y axis.

        for (let s = 0; s < SPARK_COUNT; s++) {
            const spark = this.sparks[s];

            // Direction vector from this particle toward the spark.
            // Positive dx means the spark is to the right; positive dy means it is below.
            const dx = spark.x - p.x;
            const dy = spark.y - p.y;

            // Squared distance. We add 250000 (= 500^2) as a "softening factor" --
            // this prevents the force from becoming infinite if the particle sits
            // exactly on top of the spark.
            const distSq = dx * dx + dy * dy + 250000;

            // Actual distance (square root of the squared distance).
            // We need this to turn (dx, dy) into a normalized direction vector (length = 1).
            const dist = Math.sqrt(distSq);

            // Gravitational force: F = G / r^2 (inverse-square law).
            // At double the distance, the force is 4x weaker.
            const force = GRAVITY_CONST / distSq;

            // Add this spark's contribution to the total acceleration.
            // Dividing dx by dist normalizes it (makes the vector length = 1),
            // then multiplying by force gives the correct magnitude.
            ax += (dx / dist) * force;
            ay += (dy / dist) * force;
        }

        // Apply acceleration to velocity. Think: velocity is like a car's speed,
        // and acceleration is like the gas pedal adding more speed each tick.
        p.vx += ax;
        p.vy += ay;

        // --- Drag ---
        // Multiply velocity by DRAG_FACTOR (~0.9950) each tick.
        // This slowly bleeds off speed, like air resistance.
        // Without drag, particles would spiral in, slingshot around, and fly away forever.
        p.vx *= DRAG_FACTOR;
        p.vy *= DRAG_FACTOR;

        // --- Speed cap ---
        // If the particle is moving faster than SPEED_CAP, scale velocity back down.
        // vx^2 + vy^2 is the squared speed (we avoid a sqrt here for performance).
        const speedSq = p.vx * p.vx + p.vy * p.vy;

        if (speedSq > SPEED_CAP * SPEED_CAP) {
            // Compute actual speed and scale velocity to the cap.
            const speed = Math.sqrt(speedSq);
            p.vx = (p.vx / speed) * SPEED_CAP;
            p.vy = (p.vy / speed) * SPEED_CAP;
        }

        // --- Move the particle ---
        // Velocity (units/tick) added to position gives the new position.
        p.x += p.vx;
        p.y += p.vy;

        // --- Soft boundary ---
        // If the particle has escaped more than 20% beyond the field boundary,
        // gently nudge it back toward center rather than letting it drift off forever.
        // 1.2^2 = 1.44, so we check against FIELD_RANGE * 1.2.
        if (p.x * p.x + p.y * p.y > FIELD_RANGE * FIELD_RANGE * 1.44) {
            // Shrink position toward center (0,0).
            p.x *= 0.9;
            p.y *= 0.9;
            // Kill some velocity so it does not immediately escape again.
            p.vx *= 0.5;
            p.vy *= 0.5;
        }
    }

    /**
     * Resets a dead particle: places it near a random spark and gives it a fresh start.
     *
     * @param {object} p - The particle object to reinitialize.
     */
    spawnParticle(p) {
        // Pick a random spark to be born near.
        const sparkIndex = Math.floor(Math.random() * SPARK_COUNT);
        const spark = this.sparks[sparkIndex];

        // Place the particle close to the spark, with a small random scatter.
        // (Math.random() - 0.5) gives a range of -0.5 to +0.5;
        // multiplying by SPAWN_SCATTER * 2 gives -SPAWN_SCATTER to +SPAWN_SCATTER.
        p.x = spark.x + (Math.random() - 0.5) * SPAWN_SCATTER * 2;
        p.y = spark.y + (Math.random() - 0.5) * SPAWN_SCATTER * 2;

        // Give the particle a random initial velocity in a random direction.
        // Math.PI is the number pi (~3.14159). Multiplying by 2 gives the full circle in radians.
        // (Radians are another way to measure angles: 2*PI radians = 360 degrees.)
        // Math.random() * Math.PI * 2 picks any angle from 0 to 360 degrees, randomly.
        const angle = Math.random() * Math.PI * 2;

        // Random speed between 50% and 150% of STREAM_SPEED.
        // (0.5 + Math.random()) gives a range of 0.5 to 1.5.
        const speed = STREAM_SPEED * (0.5 + Math.random());

        // Math.cos(angle) is the horizontal part of the direction (left/right).
        // Math.sin(angle) is the vertical part of the direction (up/down).
        // Together they form a unit vector (length = 1) pointing in the chosen direction;
        // multiplying by speed scales it to the right magnitude.
        // We also add 40% of the spark's own velocity so particles stream behind it
        // as it moves, rather than erupting in a stationary starburst.
        p.vx = Math.cos(angle) * speed + spark.vx * 0.4;
        p.vy = Math.sin(angle) * speed + spark.vy * 0.4;

        // Assign this particle to one of the 8 hue color bands.
        // There are 12 sparks but only 8 hue bands, so some bands are shared by two sparks.
        // % is the remainder operator: 10 % 8 = 2, 11 % 8 = 3. It "wraps around" at 8,
        // cycling from 0 through 7 no matter how large sparkIndex gets.
        p.hueIndex = sparkIndex % 8;

        // Each particle ages at a slightly different rate so they don't all die together.
        // 0.0018 to 0.0025 per tick gives a lifetime of roughly 400..555 ticks.
        // At 60 FPS that is 6.7 to 9.3 seconds of life per particle.
        p.ageRate = 0.0018 + Math.random() * 0.0007;

        p.age = 0;
        p.alive = true;
    }

    /**
     * Moves all 12 sparks along their Lissajous orbital paths.
     * Also computes spark velocity (the rate of change of position), which is
     * used in spawnParticle() as a directional hint for newly born particles.
     */
    updateSparks() {
        for (let i = 0; i < SPARK_COUNT; i++) {
            const spark = this.sparks[i];

            // Lissajous orbit: x follows a sine wave, y follows a cosine wave.
            // Slightly different frequencies (freqX vs freqY) mean the path slowly
            // drifts and fills in, never quite repeating itself.
            // FIELD_RANGE * 0.8: sparks orbit within 80% of the field -- they stay on screen.
            spark.x = Math.sin(this.animTime * spark.freqX + spark.phaseX) * FIELD_RANGE * 0.8;
            spark.y = Math.cos(this.animTime * spark.freqY + spark.phaseY) * FIELD_RANGE * 0.8;

            // Instantaneous velocity = the mathematical derivative of the position formula.
            //   d/dt [sin(t * f + p)] = cos(t * f + p) * f
            //   d/dt [cos(t * f + p)] = -sin(t * f + p) * f
            // Dividing by 60 converts from "per second" to "per tick".
            spark.vx = (Math.cos(this.animTime * spark.freqX + spark.phaseX) * spark.freqX * FIELD_RANGE * 0.8) / 60;
            spark.vy = (-Math.sin(this.animTime * spark.freqY + spark.phaseY) * spark.freqY * FIELD_RANGE * 0.8) / 60;
        }
    }

    // #endregion

    // #region Palette Update

    /**
     * Rewrites all dynamic palette slots for the current frame.
     * This is "palette animation": by changing what color each slot number means,
     * everything drawn with that slot number changes color instantly.
     *
     * Two groups of slots are updated:
     *   1. Particle color ramp (40 slots): 8 hue bands × 5 brightness tiers.
     *      All hues rotate with huePhase, cycling through the full rainbow over 15 seconds.
     *   2. Spark colors (24 slots): one bright + one halo slot per spark.
     *      Each spark has its own hue offset, so all 12 display different rainbow colors.
     */
    updatePalette() {
        // --- Particle color ramp ---
        for (let h = 0; h < 8; h++) {
            // The base angle for this hue band: evenly spread around the color wheel.
            //   h=0 → 0°, h=1 → 45°, h=2 → 90°, ..., h=7 → 315°.
            // Adding huePhase rotates all hue bands together like a spinning color wheel.
            // % 360 keeps the angle in the valid range.
            const hue = ((h / 8) * 360 + this.huePhase) % 360;

            for (let t = 0; t < 5; t++) {
                // Color32.fromHSL(hue, saturation, lightness):
                //   hue 0..360: position on the color wheel (0=red, 120=green, 240=blue)
                //   saturation 0..100: how vivid the color is (90 = highly saturated)
                //   lightness 0..100: brightness (0=black, 50=pure color, 100=white)
                // TIER_LIGHTNESS[t] gives the brightness for this age tier.
                this.palette.set(C_PARTICLE_BASE + h * 5 + t, Color32.fromHSL(hue, 90, TIER_LIGHTNESS[t]));
            }
        }

        // --- Spark colors ---
        // Each spark has a personal hueOffset (0°, 30°, 60°, ..., 330°) so they each
        // show a different color on the rainbow at the same time.
        // Adding the global huePhase makes all spark colors cycle along with the particles.
        for (let i = 0; i < SPARK_COUNT; i++) {
            const sparkHue = (this.huePhase + this.sparks[i].hueOffset) % 360;

            // Bright outer body of the spark: vivid, high lightness.
            this.palette.set(C_SPARK_BRIGHT + i, Color32.fromHSL(sparkHue, 95, 78));

            // Dim halo ring: same hue, but lower saturation and lightness.
            // This gives the spark a slightly "glowing" appearance.
            this.palette.set(C_SPARK_HALO + i, Color32.fromHSL(sparkHue, 60, 38));
        }
    }

    // #endregion

    // #region Render Helpers

    /**
     * Draws all alive particles in two separate passes.
     *
     * Why two passes instead of one?
     * We want dim old particles to appear underneath bright young ones.
     * The easiest way is to draw all old particles first (pass 1), then all young
     * particles on top (pass 2). Any young particle that overlaps an old one will
     * simply paint over it, which is the correct layering order.
     * This avoids sorting the particle array (which would be much slower).
     *
     * Pass 1 -- old particles (tier 3 and 4): drawn as 1×1 single pixels.
     * Pass 2 -- young particles (tier 0, 1, 2): drawn as 2×2 filled rectangles.
     */
    renderParticles() {
        // --- Pass 1: old, dim particles as single 1×1 pixels ---
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const p = this.particles[i];

            // "continue" means: stop processing this particle and jump straight
            // to the next one. It is like saying "skip this one".
            if (!p.alive) {
                continue; // Skip dead particles -- they have no position to draw.
            }

            // Convert age (0..1) to a tier index (0..4).
            // p.age * 5 maps the 0..1 range to 0..5.
            // Math.floor() rounds down to the nearest whole number: 0.7 * 5 = 3.5 -> 3.
            // Math.min(4, ...) clamps the result so it never exceeds 4 (the last tier).
            const tier = Math.min(4, Math.floor(p.age * 5));

            // Pass 1 only draws particles that are in their last two tiers (3 or 4).
            // Tier 3 is "aging" (lightness 36) and tier 4 is "near-dead" (lightness 20).
            // Tiers 0, 1, 2 are handled in pass 2 -- skip them here.
            if (tier < 3) {
                continue;
            }

            // Convert world coordinates to screen pixel coordinates.
            // See the HALF_W / HALF_H comment in the Configuration section for the formula.
            // Math.floor() snaps to the nearest whole pixel (you cannot draw half a pixel).
            const sx = Math.floor((p.x / FIELD_RANGE) * HALF_W + HALF_W);
            const sy = Math.floor((p.y / FIELD_RANGE) * HALF_H + HALF_H);

            // Skip any particle whose screen position is outside the visible area.
            // Drawing outside the canvas boundaries would cause an engine error.
            if (sx < 0 || sx >= DISPLAY_W || sy < 0 || sy >= DISPLAY_H) {
                continue;
            }

            // Look up the palette slot for this particle's hue and brightness tier.
            // Formula: base + (hue band index × 5 slots per band) + tier within band.
            // Example: hueIndex=3, tier=4 -> slot 10 + 3*5 + 4 = slot 29.
            const slot = C_PARTICLE_BASE + p.hueIndex * 5 + tier;

            // Draw a single pixel at the screen position using the computed color slot.
            BT.drawPixel(new Vector2i(sx, sy), slot);
        }

        // --- Pass 2: young, bright particles as 2×2 filled rectangles ---
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const p = this.particles[i];

            if (!p.alive) {
                continue; // Skip dead particles.
            }

            // Recompute the tier for this pass. Each particle is only handled in one pass,
            // so checking the tier again here costs very little and keeps both passes
            // independent -- no shared state needed between the two loops.
            const tier = Math.min(4, Math.floor(p.age * 5));

            // This pass only draws young particles (tiers 0, 1, and 2).
            // Old particles (tiers 3 and 4) were already drawn as pixels in pass 1.
            if (tier >= 3) {
                continue;
            }

            const sx = Math.floor((p.x / FIELD_RANGE) * HALF_W + HALF_W);
            const sy = Math.floor((p.y / FIELD_RANGE) * HALF_H + HALF_H);

            // A 2×2 rect occupies pixels at (sx, sy), (sx+1, sy), (sx, sy+1), (sx+1, sy+1).
            // We therefore need both sx and sx+1 to be inside the screen, so sx <= DISPLAY_W-2.
            // DISPLAY_W - 1 = 319, so "sx >= 319" means "sx+1 would be 320" which is off-screen.
            if (sx < 0 || sx >= DISPLAY_W - 1 || sy < 0 || sy >= DISPLAY_H - 1) {
                continue;
            }

            const slot = C_PARTICLE_BASE + p.hueIndex * 5 + tier;

            // Draw a 2×2 filled rectangle. Larger than 1 pixel, so young particles stand out.
            // Rect2i arguments are (x, y, width, height).
            BT.drawRectFill(new Rect2i(sx, sy, 2, 2), slot);
        }
    }

    /**
     * Draws all 12 sparks as three-layer colored squares to suggest a glowing light source.
     *
     * Three layers are stacked from largest (drawn first / underneath) to smallest (on top):
     *   Layer 1: 5×5 pixels, dim halo color   -- the outer glow ring.
     *   Layer 2: 3×3 pixels, bright body color -- the vivid colored core.
     *   Layer 3: 1×1 pixel,  white             -- the white-hot center point.
     *
     * Drawing larger shapes first and smaller shapes on top is how layered "glow" effects
     * are built without any actual blending or transparency.
     */
    renderSparks() {
        for (let i = 0; i < SPARK_COUNT; i++) {
            const spark = this.sparks[i];

            // Convert the spark's world position to screen pixel coordinates.
            const sx = Math.floor((spark.x / FIELD_RANGE) * HALF_W + HALF_W);
            const sy = Math.floor((spark.y / FIELD_RANGE) * HALF_H + HALF_H);

            // The outermost layer is a 5×5 rect extending 2 pixels in each direction.
            // We therefore need sx >= 2 (so sx-2 >= 0) and sx <= DISPLAY_W-3 (so sx+2 <= DISPLAY_W-1).
            // The check "sx >= DISPLAY_W - 2" catches the right-edge case in one comparison.
            if (sx < 2 || sx >= DISPLAY_W - 2 || sy < 2 || sy >= DISPLAY_H - 2) {
                continue; // Skip sparks that are too close to the edge to draw safely.
            }

            // Layer 1: 5×5 dim halo, centered on (sx, sy).
            // The top-left corner of a 5×5 rect centered at (sx, sy) is (sx-2, sy-2).
            BT.drawRectFill(new Rect2i(sx - 2, sy - 2, 5, 5), C_SPARK_HALO + i);

            // Layer 2: 3×3 bright body, centered on (sx, sy).
            // The top-left corner of a 3×3 rect centered at (sx, sy) is (sx-1, sy-1).
            BT.drawRectFill(new Rect2i(sx - 1, sy - 1, 3, 3), C_SPARK_BRIGHT + i);

            // Layer 3: single white-hot center pixel, exactly at (sx, sy).
            BT.drawPixel(new Vector2i(sx, sy), C_SPARK_CORE);
        }
    }

    /**
     * Draws two thin rows of colored squares along the very bottom of the screen.
     *
     * Top row -- 12 spark-bright slots:
     *   Each of the 12 sparks gets one rectangle ~26 px wide.
     *   All 12 span different hues (the sparks are 30 degrees apart on the color wheel),
     *   so this row always looks like a full rainbow no matter where huePhase is.
     *
     * Bottom row -- 40 particle slots (8 hues x 5 brightness tiers):
     *   The 40 particle palette entries are displayed left to right.
     *   Each group of 5 squares (40 px wide) is one hue band, going from bright to dim.
     *   As the global hue rotates, this entire row slides through the rainbow in real time.
     *
     * Think of these rows as a "legend" for the colors currently on screen.
     */
    renderPaletteStrip() {
        // --- Top row: 12 spark-bright color slots, one per spark ---
        // We divide the full screen width (320 px) equally among 12 sparks.
        // Math.floor() rounds down, so each rectangle is 26 px wide (320 / 12 = 26.67).
        const sparkW = Math.floor(DISPLAY_W / SPARK_COUNT); // 26 px per spark rectangle.

        for (let i = 0; i < SPARK_COUNT; i++) {
            // Starting x position: each rectangle begins where the previous one ended.
            const x = i * sparkW;

            // Width of this rectangle.
            // The ternary operator "condition ? valueIfTrue : valueIfFalse" is a compact if/else.
            // For the last spark (i === SPARK_COUNT - 1), we stretch to the right edge
            // of the screen by using DISPLAY_W - x instead of sparkW. This fills the
            // 8 leftover pixels (320 - 12*26 = 8) so the strip reaches all the way to
            // the edge with no gap. For every other spark we use the standard sparkW.
            const w = i === SPARK_COUNT - 1 ? DISPLAY_W - x : sparkW;

            BT.drawRectFill(new Rect2i(x, PALETTE_STRIP_SPARK_Y, w, PALETTE_STRIP_SPARK_H), C_SPARK_BRIGHT + i);
        }

        // --- Bottom row: 40 particle color slots, each 8 px wide ---
        // 8 hues × 5 tiers = 40 slots. 40 × 8 px = 320 px -- a perfect fit.
        // The slots are arranged in the same order as the palette layout:
        //   index 0..4   = hue 0, tiers 0..4 (brightest to darkest)
        //   index 5..9   = hue 1, tiers 0..4
        //   ...
        //   index 35..39 = hue 7, tiers 0..4
        // So within each group of 5 squares you see one hue fading from bright to dim,
        // and across all 8 groups the full rainbow is visible at a glance.
        for (let i = 0; i < 8 * 5; i++) {
            BT.drawRectFill(new Rect2i(i * 8, PALETTE_STRIP_PART_Y, 8, PALETTE_STRIP_PART_H), C_PARTICLE_BASE + i);
        }
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the animation loop.
bootstrap(Demo);

// #endregion
