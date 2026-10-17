/*

Flurry: a retro screensaver built on particle physics and palette animation.
@description A retro screensaver port of the classic macOS Flurry: particle physics driving palette animation.

Ported from the classic macOS Flurry screensaver by Calum Robinson (2002).
Original source: https://github.com/calumr/flurry

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Palette Animation: https://demos.blit386.dev/palette-animation

Live version: https://demos.blit386.dev/flurry

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#runtime-palette-effects
  - Game Loop: https://blit386.dev/docs/guides/game-loop#smoothing-motion-between-updates
  - Random: https://blit386.dev/docs/guides/random#deterministic-by-default
  - Overlay: https://blit386.dev/docs/guides/overlay#optional-bands

Reference:
  - Game Loop: https://blit386.dev/docs/api/game-loop#interpolating-render-state-with-renderalpha
  - Random: https://blit386.dev/docs/api/random#engine-default-btrandom
  - Overlay: https://blit386.dev/docs/api/overlay#timing-chart-optional

---

WHAT YOU WILL SEE
-----------------

A near-black 320x240 display with 800 particles swirling around 12 invisible attractors.
Young particles are drawn as bright 2x2 squares, old ones as dim single pixels, and every
color on screen rotates through the full rainbow once every 15 seconds. Each attractor
("spark") is drawn as a 5x5 halo, a 3x3 vivid body, and a single white center pixel. Along
the bottom edge a two-row palette strip shows the live colors: 12 spark slots on top, 40
particle slots underneath.

WHAT YOU WILL LEARN
-------------------

- Palette animation: update() rewrites 64 palette slots with Color32.fromHSL() every tick
  while render() only ever passes slot numbers.
- Inverse-square gravity, drag, a speed cap, and a soft boundary, all in world units
  independent of the screen size.
- Lissajous orbits for the sparks, plus their analytic velocity used as a spawn hint.
- Render interpolation with BT.renderAlpha: every particle and spark keeps its previous
  tick position so render() can blend between ticks.
- BT.random.next(), BT.random.float(), BT.random.int(), and BT.random.angle() for spawn
  positions, speeds, lifetimes, and staggered ages.
- A fixed object pool: all 800 particles are created once and respawned, never
  reallocated.
- configure() with a timing chart in 'rich' diagnostics mode and the renderer diagnostics
  bar, both tinted with the demo's own palette slots.

WHAT IS FLURRY?
---------------

Flurry was a free screensaver for macOS that showed a cloud of glowing particles swirling
around invisible "sparks" - points in space that pull particles toward them like small
gravity wells. Twelve sparks trace Lissajous paths and hundreds of particles spiral around
them.

HOW DOES THIS VERSION DIFFER FROM THE ORIGINAL?
-----------------------------------------------

The original Flurry used additive blending: overlapping particles added their light
together to create soft glowing halos. BLIT386 draws palette indices and has no blending.
Instead this version uses palette animation: every tick it rewrites the palette so that
young particles appear bright and large while old particles appear dim and small. The
orbital motion and the rainbow color cycling are preserved.

KEY PHYSICS CONCEPTS
--------------------

- Inverse-square gravity: each particle is pulled toward every spark, and the closer the
  particle, the stronger the pull. Same law as real planets.
- Drag: a small friction factor applied each tick, slowing particles gradually.
- Lissajous orbit: a path traced by two sine waves with different frequencies. The spark's
  x position follows one wave and its y position another; when the frequencies differ
  slightly the path never exactly repeats.

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. The timing chart runs in 'rich'
  mode, so vertex-pressure dots appear in the lower third of the band, and the renderer
  diagnostics bar reports primitive and sprite vertex counts for the 800-particle load.
- Watch the palette strip at the bottom: the top row is always a full rainbow (the 12
  sparks sit 30 degrees apart on the hue wheel), and the bottom row slides through the
  rainbow as the global hue rotates.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

/** @typedef {import('blit386').Palette} Palette */

// Target frame rate for fixed update() steps (matches the engine's default config).
const TARGET_FPS = 60;

// World space. Particles and sparks live in a virtual coordinate system measured in
// abstract "world units". FIELD_RANGE is the half-extent: the center is (0, 0) and the
// edges are at -FIELD_RANGE and +FIELD_RANGE. Sparks are constrained to orbit within 80%
// of this range, so +-8000 units. When drawing, world units are converted to screen
// pixels by worldToScreen() below.
const FIELD_RANGE = 10000;

// How many particles are kept alive at once. More particles means denser, richer swirls
// but more work each tick: 800 particles at 60 ticks per second means the physics loop
// runs 48,000 times per second.
const PARTICLE_COUNT = 800;

// How many attractor sparks (invisible gravity wells) orbit the screen at once. 12 is the
// same count as the original Flurry screensaver.
const SPARK_COUNT = 12;

// Physics constants (from the original Flurry source). GRAVITY_CONST sets how strong the
// pull between a particle and a spark is; larger means particles get sucked in faster.
const GRAVITY_CONST = 1500000;

// How much velocity a particle keeps each tick, as a fraction between 0 and 1. The **
// operator is exponentiation: base ** exponent. 0.9965 ** (85 / 60) is the original
// Flurry formula; the result is about 0.9950, so each tick a particle keeps 99.5% of its
// speed - very gentle drag.
const DRAG_FACTOR = 0.9965 ** (85 / 60);

// How fast newly spawned particles shoot outward from their spark, in world units per
// tick. Combined with the spark's own velocity (added at spawn), this gives each particle
// a unique direction so they fan out rather than all traveling the same way.
const STREAM_SPEED = 15;

// How far from the exact spark position a new particle may appear, in world units. A
// small scatter means particles start in a tight cluster very close to the spark. Without
// scatter, every particle would start at the same point and overlap completely.
const SPAWN_SCATTER = 30;

// The fastest a particle is ever allowed to move, in world units per tick. Without this
// cap, a particle that passes very close to a spark could accelerate to enormous speeds
// and shoot instantly off screen.
const SPEED_CAP = 600;

// Palette animation: how many degrees the global hue rotates per tick. At 60 ticks per
// second, 0.4 degrees per tick is 24 degrees per second, so one full rotation (360
// degrees) takes 15 seconds. During those 15 seconds every particle cycles through red,
// orange, yellow, green, cyan, blue, violet, and back to red - a complete rainbow.
const HUE_ADVANCE = 0.4;

// Lightness values for the 5 particle age tiers. Tier 0 is for newborn particles (age
// near 0); tier 4 is for dying particles (age near 1). HSL lightness: 0 is black, 50 is
// the vivid full color, 100 is white. Going from 85 down to 20 makes particles fade from
// near-white to nearly invisible as they age.
const TIER_LIGHTNESS = [85, 68, 52, 36, 20];

// Screen layout: the logical resolution of the display in pixels. This is the number of
// dots in the picture, not the size of the window (the engine's default drawing buffer is
// 640x480, twice this).
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Half-dimensions: the number of pixels from the center to each edge. Used for the
// world-to-screen conversion: screenX = (worldX / FIELD_RANGE) * HALF_W + HALF_W.
//   - (worldX / FIELD_RANGE) gives a fraction from -1 to +1.
//   - Multiplying by HALF_W stretches that to -HALF_W..+HALF_W pixels.
//   - Adding HALF_W shifts the result to 0..DISPLAY_W, placing world (0, 0) at the screen
//     center.
const HALF_W = DISPLAY_W / 2; // 160
const HALF_H = DISPLAY_H / 2; // 120

// Palette strip: a thin strip at the very bottom of the screen shows the live palette.
// Two rows are drawn there. Top row (3 px tall): 12 spark-bright slots, each about 26 px
// wide. Bottom row (4 px tall): 40 particle slots (8 hues x 5 tiers), each 8 px wide.
// Watching this strip is the clearest way to see the hue rotation happening in real time.
const PALETTE_STRIP_SPARK_Y = DISPLAY_H - 7; // spark color row top edge (y = 233)
const PALETTE_STRIP_SPARK_H = 3; // 3 px tall
const PALETTE_STRIP_PART_Y = DISPLAY_H - 4; // particle color row top edge (y = 236)
const PALETTE_STRIP_PART_H = 4; // 4 px tall

// Palette slot numbers: addresses in the 256-slot color table. Slot 0 is always
// transparent; the engine reserves it and it is never written here. update() refills the
// animated slots every tick with fresh Color32 objects; render() only reads slot numbers
// and never touches a Color32 directly. This separation is the essence of palette
// animation. Nothing draws text in this demo: the static slots below color the engine
// overlay and its timing chart.
const C_WHITE = 1; // pure white: timing chart render bar and error marker
const C_BG = 2; // near-black deep-space background, also the overlay bar fill
const C_TITLE = 3; // golden yellow: overlay text and timing chart update bar
const C_FPS = 5; // very dim gray: timing chart tag color
const C_SPARK_CORE = 6; // white-hot spark center pixel, also chart warnings

// Particle color ramp: 8 hue bands x 5 brightness tiers = 40 slots (10..49). The slot for
// a particle is C_PARTICLE_BASE + hueIndex * 5 + tier, where hueIndex (0..7) is the
// particle's color family and tier (0..4) its brightness (0 = newborn and bright, 4 = old
// and dim). Example: hueIndex 2, tier 1 is slot 10 + 2 * 5 + 1 = 21.
const C_PARTICLE_BASE = 10;

// Spark body colors: one bright vivid slot per spark, slots 100..111 (12 sparks). Spark i
// uses slot C_SPARK_BRIGHT + i.
const C_SPARK_BRIGHT = 100;

// Spark halo colors: one dimmer slot per spark, slots 112..123. Same hue as the bright
// slot but lower lightness and saturation, to suggest a glow ring.
const C_SPARK_HALO = 112;

// Each row defines one spark's orbit parameters and color offset, in the order
// [freqX, freqY, phaseX, phaseY, hueOffset].
//   - freqX, freqY: how fast the spark oscillates on each axis, in radians per second.
//     Slightly different values give each spark a unique, non-repeating path.
//   - phaseX, phaseY: starting position on the path, in radians (0..6.28 is a full
//     circle). Different phases spread the 12 sparks out so they are not bunched up at
//     startup.
//   - hueOffset: this spark's personal color offset (0..330 degrees, in steps of 30).
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

// Converts one axis of a world position into a whole-pixel screen coordinate. Two steps:
//   1. Blend: prev + (cur - prev) * alpha slides the position from where it was at the
//      start of the last physics tick (prev) toward where it is now (cur), by the
//      fraction alpha (BT.renderAlpha: 0 means a tick just finished, values approaching
//      1 mean the next tick is imminent). This gives the position at this exact render
//      moment, so motion looks smooth between ticks instead of jumping.
//   2. Scale and shift: dividing by FIELD_RANGE gives a fraction from -1 to +1,
//      multiplying by halfExtent stretches that to screen pixels, and adding halfExtent
//      shifts the result so world (0, 0) lands at the screen center. Math.floor() then
//      snaps to a whole pixel.
// Call it once with HALF_W for the x axis and once with HALF_H for the y axis.
function worldToScreen(prev, cur, alpha, halfExtent) {
    const world = prev + (cur - prev) * alpha;
    return Math.floor((world / FIELD_RANGE) * halfExtent + halfExtent);
}

// Retro port of the classic macOS Flurry screensaver. Twelve spark attractors trace
// Lissajous orbit paths; PARTICLE_COUNT particles spiral around them under inverse-square
// gravity. Palette animation cycles a full rainbow every 15 seconds.
class Demo {
    // The 256-slot palette used for all drawing. Filled in init(), updated every tick.
    /** @type {Palette | null} */
    palette = null;

    // Total elapsed animation time in seconds. Grows by BT.deltaSeconds each tick, which
    // is 1 / TARGET_FPS (1/60 when TARGET_FPS is 60). The spark position formula uses
    // this as its clock, so every tick the sparks move forward.
    animTime = 0;

    // Current hue rotation offset in degrees (0..359). Increases by HUE_ADVANCE each tick
    // and wraps back to 0 at 360. Every palette slot holding a particle or spark color
    // uses this offset, so when huePhase changes by even a small amount, every color on
    // screen shifts together.
    huePhase = 0;

    // Array of SPARK_COUNT spark objects (the invisible gravity-well attractors), created
    // in initSparks(). Each spark has:
    //   x, y - current world position
    //   prevX, prevY - world position as of the start of the most recent update() tick,
    //     before that tick's orbit math moved it. render() blends between prevX/prevY and
    //     x/y using BT.renderAlpha so sparks glide smoothly between physics ticks instead
    //     of jumping - see the Game Loop guide linked in the header.
    //   vx, vy - instantaneous velocity (used as a hint when spawning particles)
    //   freqX, freqY - oscillation frequencies for the Lissajous orbit
    //   phaseX, phaseY - starting angles on the orbit path
    //   hueOffset - this spark's personal color angle on the rainbow (0..330 degrees)
    sparks = [];

    // Array of PARTICLE_COUNT particle objects, created in initParticles() and reused
    // forever: dead particles are respawned rather than deleted. Each particle has:
    //   x, y - current world position
    //   prevX, prevY - world position as of the start of the most recent update() tick
    //     (see the sparks comment above for why render() needs this)
    //   vx, vy - current velocity
    //   age - how old the particle is (0.0 = newborn, 1.0 = about to die)
    //   ageRate - how fast it ages each tick (varies slightly per particle)
    //   hueIndex - which of the 8 color families it belongs to (0..7)
    //   alive - false means the particle is waiting to be respawned
    particles = [];

    // Heavy particle physics runs every tick; the timing chart in 'rich' mode and the
    // renderer diagnostics bar make frame-budget pressure visible. Both are tinted with
    // this demo's own palette slots.
    configure() {
        return {
            targetFPS: TARGET_FPS,
            isOverlayTimingChartEnabled: true,
            overlayTimingChartDiagnostics: 'rich',
            isOverlayRendererDiagnosticsBarEnabled: true,
            overlayStyle: {
                barPaletteIndex: C_BG,
                textPaletteIndex: C_TITLE,
                gapPaletteIndex: C_BG,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_TITLE,
                renderBarPaletteIndex: C_WHITE,
                warningPaletteIndex: C_SPARK_CORE,
                errorPaletteIndex: C_WHITE,
                tagPaletteIndex: C_FPS,
            },
        };
    }

    // Builds the palette and creates the sparks and particles. Runs once before the first
    // update() call.
    async init() {
        console.log('[FlurryDemo] Initializing...');

        // Build the palette. All static (never-changing) slots are filled now. The
        // dynamic particle and spark color slots start as black and are overwritten every
        // tick by updatePalette() inside update().
        this.palette = BT.paletteCreate(256);

        // Static colors that never change during the demo.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(4, 6, 12)); // near-black deep-space blue
        this.palette.set(C_TITLE, new Color32(255, 210, 80)); // golden yellow
        this.palette.set(C_FPS, new Color32(55, 55, 75)); // very dim gray
        this.palette.set(C_SPARK_CORE, new Color32(255, 255, 255)); // white-hot center

        // Fill all 40 particle color slots with black as a placeholder. 8 hues x 5 tiers
        // = 40 total. They are overwritten on the very first updatePalette() call;
        // setting them now means the palette has no uninitialized gaps.
        for (let i = 0; i < 8 * 5; i++) {
            this.palette.set(C_PARTICLE_BASE + i, new Color32(0, 0, 0));
        }

        // Fill all 24 spark color slots with black as a placeholder: 12 bright slots (one
        // per spark) and 12 halo slots (one per spark).
        for (let i = 0; i < SPARK_COUNT; i++) {
            this.palette.set(C_SPARK_BRIGHT + i, new Color32(0, 0, 0));
            this.palette.set(C_SPARK_HALO + i, new Color32(0, 0, 0));
        }

        // Activate the palette. From this point on, all drawing uses these color slots.
        BT.paletteSet(this.palette);

        // Create the sparks: the invisible gravity wells that all particles orbit around.
        this.initSparks();

        // Create the particles. All PARTICLE_COUNT of them are created here and reused
        // for the life of the demo.
        this.initParticles();

        // Fill the animated palette slots once without advancing the physics (animTime,
        // sparks, particles). Calling update() here would move the simulation before the
        // engine's timing is available; updatePalette() only writes colors.
        this.updatePalette();

        console.log('[FlurryDemo] Initialized');

        return true;
    }

    // Runs TARGET_FPS times per second. Advances the physics and rewrites the palette
    // colors. All Color32 work happens here; render() only ever uses slot numbers.
    update() {
        // Advance time by one fixed-step duration in seconds.
        this.animTime += BT.deltaSeconds;

        // Rotate the global hue. The % operator wraps the angle back to 0 at 360.
        this.huePhase = (this.huePhase + HUE_ADVANCE) % 360;

        // Move all 12 sparks along their Lissajous paths.
        this.updateSparks();

        // Update the physics for every particle. Alive particles get gravity, drag, and a
        // position update; dead particles are immediately respawned near a random spark.
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            if (this.particles[i].alive) {
                this.updateParticle(this.particles[i]);
            } else {
                this.spawnParticle(this.particles[i]);
            }
        }

        // Recompute all dynamic palette colors for this tick.
        this.updatePalette();
    }

    // Draws the current frame. Only palette slot numbers appear here - no Color32
    // objects. All color decisions were already made in update() and stored in the
    // palette.
    render() {
        // Wipe every pixel to the background color before drawing anything new. Without
        // this, the previous frame's particles would remain visible as ghost trails.
        BT.clear(C_BG);

        // Draw all particles (two passes: dim old ones first, bright young ones on top).
        this.renderParticles();

        // Draw the 12 spark attractors on top of everything.
        this.renderSparks();

        // Palette strip along the very bottom of the screen: the live particle and spark
        // color slots as small colored rectangles. As huePhase advances, this strip
        // cycles through the entire rainbow.
        this.renderPaletteStrip();
    }

    // Creates all 12 spark objects from SPARK_TABLE and positions them at time 0.
    initSparks() {
        for (let i = 0; i < SPARK_COUNT; i++) {
            // Destructuring: pull the five values out of this row of SPARK_TABLE.
            const [freqX, freqY, phaseX, phaseY, hueOffset] = SPARK_TABLE[i];

            this.sparks.push({
                x: 0, // current world x position (set by updateSparks)
                y: 0, // current world y position
                prevX: 0, // world x position at the start of the last tick
                prevY: 0, // world y position at the start of the last tick
                vx: 0, // instantaneous velocity on x (used as a spawn direction hint)
                vy: 0, // instantaneous velocity on y
                freqX, // how fast the spark oscillates horizontally
                freqY, // how fast the spark oscillates vertically
                phaseX, // starting angle on the x sine wave
                phaseY, // starting angle on the y cosine wave
                hueOffset, // this spark's personal color angle on the rainbow wheel
            });
        }

        // Run one updateSparks() so all sparks have correct positions before particles
        // spawn.
        this.updateSparks();

        // The first updateSparks() call above moved every spark away from its placeholder
        // (0, 0), which would otherwise look like every spark interpolating in from the
        // world's center on the very first frame. Snap prevX/prevY to match so the first
        // render draws sparks in the right place with no bogus streak.
        for (let i = 0; i < SPARK_COUNT; i++) {
            this.sparks[i].prevX = this.sparks[i].x;
            this.sparks[i].prevY = this.sparks[i].y;
        }
    }

    // Creates all PARTICLE_COUNT particle objects and spreads them across random ages.
    // Spreading ages ("staggering") matters: if all particles started at age 0 together,
    // they would all reach age 1 at the same moment and die together, and the screen
    // would flash blank for one frame while they all respawned. Staggering gives each
    // particle a different head start.
    initParticles() {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            // Pre-create each particle with placeholder values; spawnParticle()
            // overwrites them. The object is pushed first so it exists in the array
            // before spawnParticle() runs.
            this.particles.push({
                x: 0,
                y: 0,
                prevX: 0,
                prevY: 0,
                vx: 0,
                vy: 0,
                age: 0,
                ageRate: 0.002,
                hueIndex: 0,
                alive: false,
            });

            // Set the real position, velocity, hue, and age rate using the full spawn
            // logic.
            this.spawnParticle(this.particles[i]);

            // Override the age with a random value so this particle starts mid-life.
            // BT.random is the engine's shared random number generator; next() returns a
            // value from 0.0 (just born) up to, but never reaching, 1.0 (almost dead).
            this.particles[i].age = BT.random.next();
        }
    }

    // Moves one particle forward one tick: aging, gravity, drag, speed cap, position, and
    // the soft boundary.
    updateParticle(p) {
        // Advance the particle's age by its personal ageRate (about 0.002 per tick). age
        // counts from 0.0 (just born) toward 1.0 (end of life).
        p.age += p.ageRate;

        if (p.age >= 1.0) {
            // The particle has reached the end of its life. Mark it dead so that the main
            // update() loop respawns it on the next tick.
            p.alive = false;

            return;
        }

        // Gravity from all 12 sparks: add up the gravitational pull from every spark.
        // Each spark pulls the particle a little; the total is the net acceleration.
        let ax = 0; // accumulated acceleration on the x axis
        let ay = 0; // accumulated acceleration on the y axis

        for (let s = 0; s < SPARK_COUNT; s++) {
            const spark = this.sparks[s];

            // Direction vector from this particle toward the spark. Positive dx means the
            // spark is to the right; positive dy means it is below.
            const dx = spark.x - p.x;
            const dy = spark.y - p.y;

            // Squared distance, plus 250000 (= 500^2) as a softening factor. This keeps
            // the force finite if the particle sits exactly on top of the spark.
            const distSq = dx * dx + dy * dy + 250000;

            // Actual distance (square root of the squared distance), needed to turn
            // (dx, dy) into a normalized direction vector (length = 1).
            const dist = Math.sqrt(distSq);

            // Gravitational force: F = G / r^2 (inverse-square law). At double the
            // distance, the force is 4x weaker.
            const force = GRAVITY_CONST / distSq;

            // Add this spark's contribution to the total acceleration. Dividing dx by
            // dist normalizes it (vector length = 1); multiplying by force gives the
            // magnitude.
            ax += (dx / dist) * force;
            ay += (dy / dist) * force;
        }

        // Apply acceleration to velocity.
        p.vx += ax;
        p.vy += ay;

        // Drag: multiply velocity by DRAG_FACTOR (about 0.9950) each tick. This slowly
        // bleeds off speed, like air resistance. Without drag, particles would spiral in,
        // slingshot around, and fly away forever.
        p.vx *= DRAG_FACTOR;
        p.vy *= DRAG_FACTOR;

        // Speed cap: if the particle is moving faster than SPEED_CAP, scale the velocity
        // back down. vx^2 + vy^2 is the squared speed; the square root is skipped unless
        // the cap is exceeded.
        const speedSq = p.vx * p.vx + p.vy * p.vy;

        if (speedSq > SPEED_CAP * SPEED_CAP) {
            // Compute the actual speed and scale the velocity to the cap.
            const speed = Math.sqrt(speedSq);
            p.vx = (p.vx / speed) * SPEED_CAP;
            p.vy = (p.vy / speed) * SPEED_CAP;
        }

        // Move the particle. Remember where it started this tick before moving it, so
        // render() can blend between "was here" and "is here" (see the prevX/prevY note
        // on the particles field above).
        p.prevX = p.x;
        p.prevY = p.y;

        // Velocity (units per tick) added to position gives the new position.
        p.x += p.vx;
        p.y += p.vy;

        // Soft boundary: if the particle has escaped more than 20% beyond the field
        // boundary, nudge it back toward the center rather than letting it drift off
        // forever. 1.2^2 = 1.44, so the squared distance is compared against
        // (FIELD_RANGE * 1.2)^2.
        if (p.x * p.x + p.y * p.y > FIELD_RANGE * FIELD_RANGE * 1.44) {
            // Shrink the position toward the center (0, 0).
            p.x *= 0.9;
            p.y *= 0.9;

            // Kill some velocity so it does not immediately escape again.
            p.vx *= 0.5;
            p.vy *= 0.5;
        }
    }

    // Resets a dead particle: places it near a random spark and gives it a fresh start.
    spawnParticle(p) {
        // Pick a random spark to be born near. BT.random.int() with one argument counts
        // from 0, so int(SPARK_COUNT) lands on any index of the sparks array.
        const sparkIndex = BT.random.int(SPARK_COUNT);
        const spark = this.sparks[sparkIndex];

        // Place the particle close to the spark, with a small random scatter. float(min,
        // max) returns a value in [min, max); a negative low end and a positive high end
        // scatter the particle on either side of the spark.
        p.x = spark.x + BT.random.float(-SPAWN_SCATTER, SPAWN_SCATTER);
        p.y = spark.y + BT.random.float(-SPAWN_SCATTER, SPAWN_SCATTER);

        // Snap prevX/prevY to the same spot as the new x/y. Without this, render() would
        // blend from wherever this particle died (possibly across the screen) to its
        // brand-new spawn point, drawing a streak that was never really there.
        p.prevX = p.x;
        p.prevY = p.y;

        // Give the particle a random initial velocity in a random direction. angle()
        // returns a uniform angle in [0, 2 * PI) radians, a full turn.
        const angle = BT.random.angle();

        // Random speed between 50% and 150% of STREAM_SPEED.
        const speed = STREAM_SPEED * BT.random.float(0.5, 1.5);

        // Math.cos(angle) is the horizontal part of the direction and Math.sin(angle) the
        // vertical part. Together they form a unit vector pointing in the chosen
        // direction; multiplying by speed scales it to the right magnitude. 40% of the
        // spark's own velocity is added so particles stream behind it as it moves, rather
        // than erupting in a stationary starburst.
        p.vx = Math.cos(angle) * speed + spark.vx * 0.4;
        p.vy = Math.sin(angle) * speed + spark.vy * 0.4;

        // Assign this particle to one of the 8 hue color bands. There are 12 sparks but
        // only 8 hue bands, so some bands are shared by two sparks. % is the remainder
        // operator: 10 % 8 = 2, 11 % 8 = 3. It wraps at 8, cycling from 0 through 7 no
        // matter how large sparkIndex gets.
        p.hueIndex = sparkIndex % 8;

        // Each particle ages at a slightly different rate so they do not all die
        // together. 0.0018 to 0.0025 per tick gives a lifetime of roughly 400..555 ticks,
        // which at 60 ticks per second is 6.7 to 9.3 seconds of life per particle.
        p.ageRate = BT.random.float(0.0018, 0.0025);

        p.age = 0;
        p.alive = true;
    }

    // Moves all 12 sparks along their Lissajous orbital paths. Also computes the spark
    // velocity (the rate of change of position), which spawnParticle() uses as a
    // directional hint for newly born particles.
    updateSparks() {
        for (let i = 0; i < SPARK_COUNT; i++) {
            const spark = this.sparks[i];

            // Remember this tick's starting position before the orbit math below moves
            // the spark, so render() has an "old" and a "new" position to blend between.
            spark.prevX = spark.x;
            spark.prevY = spark.y;

            // Lissajous orbit: x follows a sine wave, y follows a cosine wave. Slightly
            // different frequencies (freqX vs freqY) mean the path slowly drifts and
            // fills in, never quite repeating itself. FIELD_RANGE * 0.8: sparks orbit
            // within 80% of the field, so they stay on screen.
            spark.x = Math.sin(this.animTime * spark.freqX + spark.phaseX) * FIELD_RANGE * 0.8;
            spark.y = Math.cos(this.animTime * spark.freqY + spark.phaseY) * FIELD_RANGE * 0.8;

            // Instantaneous velocity = the derivative of the position formula:
            //   d/dt [sin(t * f + p)] = cos(t * f + p) * f
            //   d/dt [cos(t * f + p)] = -sin(t * f + p) * f
            // Dividing by TARGET_FPS converts from "per second" to "per tick" using the
            // same constant that drives animTime in update(), so if TARGET_FPS ever
            // changes, both the clock and this velocity scale stay in sync.
            spark.vx =
                (Math.cos(this.animTime * spark.freqX + spark.phaseX) * spark.freqX * FIELD_RANGE * 0.8) / TARGET_FPS;
            spark.vy =
                (-Math.sin(this.animTime * spark.freqY + spark.phaseY) * spark.freqY * FIELD_RANGE * 0.8) / TARGET_FPS;
        }
    }

    // Rewrites all dynamic palette slots for the current tick. This is palette animation:
    // by changing what color each slot number means, everything drawn with that slot
    // changes color instantly. Two groups of slots are updated:
    //   1. The particle color ramp (40 slots): 8 hue bands x 5 brightness tiers. All hues
    //      rotate with huePhase, cycling through the full rainbow over 15 seconds.
    //   2. The spark colors (24 slots): one bright and one halo slot per spark. Each
    //      spark has its own hue offset, so all 12 display different rainbow colors.
    updatePalette() {
        // Particle color ramp.
        for (let h = 0; h < 8; h++) {
            // The base angle for this hue band, evenly spread around the color wheel:
            // h = 0 is 0 degrees, h = 1 is 45, h = 2 is 90, ..., h = 7 is 315. Adding
            // huePhase rotates all hue bands together like a spinning color wheel; % 360
            // keeps the angle in the valid range.
            const hue = ((h / 8) * 360 + this.huePhase) % 360;

            for (let t = 0; t < 5; t++) {
                // Color32.fromHSL(hue, saturation, lightness): hue 0..360 is the position
                // on the color wheel (0 = red, 120 = green, 240 = blue), saturation
                // 0..100 is how vivid the color is (90 = highly saturated), lightness
                // 0..100 is brightness (0 = black, 50 = pure color, 100 = white).
                // TIER_LIGHTNESS[t] gives the brightness for this age tier.
                this.palette.set(C_PARTICLE_BASE + h * 5 + t, Color32.fromHSL(hue, 90, TIER_LIGHTNESS[t]));
            }
        }

        // Spark colors. Each spark has a personal hueOffset (0, 30, 60, ..., 330 degrees)
        // so they each show a different color on the rainbow at the same time. Adding the
        // global huePhase makes all spark colors cycle along with the particles.
        for (let i = 0; i < SPARK_COUNT; i++) {
            const sparkHue = (this.huePhase + this.sparks[i].hueOffset) % 360;

            // Bright body of the spark: vivid, high lightness.
            this.palette.set(C_SPARK_BRIGHT + i, Color32.fromHSL(sparkHue, 95, 78));

            // Dim halo ring: same hue, but lower saturation and lightness, for a glowing
            // appearance.
            this.palette.set(C_SPARK_HALO + i, Color32.fromHSL(sparkHue, 60, 38));
        }
    }

    // Draws all alive particles in two separate passes. Dim old particles should appear
    // underneath bright young ones, so all old particles are drawn first (pass 1) and all
    // young particles on top (pass 2). Any young particle overlapping an old one simply
    // paints over it, which is the correct layering, and no sort of the particle array is
    // needed. Pass 1 draws old particles (tiers 3 and 4) as 1x1 single pixels; pass 2
    // draws young particles (tiers 0, 1, and 2) as 2x2 filled rectangles.
    renderParticles() {
        // How far we are, right now, between the last completed physics tick and the next
        // one. Every particle blends its prevX/prevY toward its x/y by this same
        // fraction, giving each one a true render-time position instead of only its
        // last-tick position (same idea as renderSparks() below).
        const alpha = BT.renderAlpha;

        // Pass 1: old, dim particles as single 1x1 pixels.
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const p = this.particles[i];

            // Skip dead particles - they have no position to draw.
            if (!p.alive) {
                continue;
            }

            // Convert age (0..1) to a tier index (0..4). p.age * 5 maps the 0..1 range to
            // 0..5, Math.floor() rounds down (0.7 * 5 = 3.5 becomes 3), and Math.min(4,
            // ...) clamps the result so it never exceeds 4 (the last tier).
            const tier = Math.min(4, Math.floor(p.age * 5));

            // Pass 1 only draws particles in their last two tiers (3 or 4). Tier 3 is
            // "aging" (lightness 36) and tier 4 is "near-dead" (lightness 20). Tiers 0,
            // 1, and 2 are handled in pass 2.
            if (tier < 3) {
                continue;
            }

            // Convert the particle's blended world position to screen pixels
            // (worldToScreen() above explains the blend and the conversion formula).
            const sx = worldToScreen(p.prevX, p.x, alpha, HALF_W);
            const sy = worldToScreen(p.prevY, p.y, alpha, HALF_H);

            // Skip any particle whose screen position is outside the visible area; there
            // is nothing to see and no point in submitting the draw call.
            if (sx < 0 || sx >= DISPLAY_W || sy < 0 || sy >= DISPLAY_H) {
                continue;
            }

            // Look up the palette slot for this particle's hue and brightness tier: base
            // + (hue band index x 5 slots per band) + tier within the band. Example:
            // hueIndex 3, tier 4 is slot 10 + 3 * 5 + 4 = 29.
            const slot = C_PARTICLE_BASE + p.hueIndex * 5 + tier;

            // Draw a single pixel at the screen position using the computed color slot.
            BT.drawPixel(new Vector2i(sx, sy), slot);
        }

        // Pass 2: young, bright particles as 2x2 filled rectangles.
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const p = this.particles[i];

            // Skip dead particles.
            if (!p.alive) {
                continue;
            }

            // Recompute the tier for this pass. Each particle is only handled in one
            // pass, so checking the tier again costs very little and keeps both passes
            // independent - no shared state between the two loops.
            const tier = Math.min(4, Math.floor(p.age * 5));

            // This pass only draws young particles (tiers 0, 1, and 2). Old particles
            // (tiers 3 and 4) were already drawn as pixels in pass 1.
            if (tier >= 3) {
                continue;
            }

            // Same world-to-screen conversion as pass 1 (see worldToScreen() above).
            const sx = worldToScreen(p.prevX, p.x, alpha, HALF_W);
            const sy = worldToScreen(p.prevY, p.y, alpha, HALF_H);

            // A 2x2 rect occupies pixels (sx, sy), (sx + 1, sy), (sx, sy + 1), and
            // (sx + 1, sy + 1), so both sx and sx + 1 must be inside the screen:
            // sx <= DISPLAY_W - 2. DISPLAY_W - 1 = 319, so "sx >= 319" means "sx + 1
            // would be 320", which is off screen.
            if (sx < 0 || sx >= DISPLAY_W - 1 || sy < 0 || sy >= DISPLAY_H - 1) {
                continue;
            }

            const slot = C_PARTICLE_BASE + p.hueIndex * 5 + tier;

            // Draw a 2x2 filled rectangle, larger than 1 pixel so young particles stand
            // out. Rect2i arguments are (x, y, width, height).
            BT.drawRectFill(new Rect2i(sx, sy, 2, 2), slot);
        }
    }

    // Draws all 12 sparks as three stacked squares to suggest a glowing light source,
    // from largest (drawn first, underneath) to smallest (on top):
    //   - Layer 1: 5x5 pixels, dim halo color - the outer glow ring.
    //   - Layer 2: 3x3 pixels, bright body color - the vivid colored core.
    //   - Layer 3: 1x1 pixel, white - the white-hot center point.
    // Drawing larger shapes first and smaller shapes on top is how layered "glow" effects
    // are built without any blending or transparency.
    renderSparks() {
        // How far we are, right now, between the last completed physics tick and the next
        // one (0 = just completed, just under 1 = next tick about to happen). Blending
        // prevX/prevY toward x/y by this fraction gives each spark's position at this
        // render moment instead of only its last-tick position.
        const alpha = BT.renderAlpha;

        for (let i = 0; i < SPARK_COUNT; i++) {
            const spark = this.sparks[i];

            // Convert the spark's blended world position to screen pixel coordinates
            // (worldToScreen() above explains the blend and the conversion formula).
            const sx = worldToScreen(spark.prevX, spark.x, alpha, HALF_W);
            const sy = worldToScreen(spark.prevY, spark.y, alpha, HALF_H);

            // The outermost layer is a 5x5 rect extending 2 pixels in each direction, so
            // sx >= 2 (sx - 2 >= 0) and sx <= DISPLAY_W - 3 (sx + 2 <= DISPLAY_W - 1) are
            // required. "sx >= DISPLAY_W - 2" catches the right-edge case in one
            // comparison. Sparks too close to the edge are skipped.
            if (sx < 2 || sx >= DISPLAY_W - 2 || sy < 2 || sy >= DISPLAY_H - 2) {
                continue;
            }

            // Layer 1: 5x5 dim halo centered on (sx, sy); its top-left corner is
            // (sx - 2, sy - 2).
            BT.drawRectFill(new Rect2i(sx - 2, sy - 2, 5, 5), C_SPARK_HALO + i);

            // Layer 2: 3x3 bright body centered on (sx, sy); its top-left corner is
            // (sx - 1, sy - 1).
            BT.drawRectFill(new Rect2i(sx - 1, sy - 1, 3, 3), C_SPARK_BRIGHT + i);

            // Layer 3: single white-hot center pixel, exactly at (sx, sy).
            BT.drawPixel(new Vector2i(sx, sy), C_SPARK_CORE);
        }
    }

    // Draws two thin rows of colored rectangles along the very bottom of the screen, a
    // legend for the colors currently on screen. Top row: the 12 spark-bright slots, one
    // rectangle about 26 px wide per spark. The sparks are 30 degrees apart on the color
    // wheel, so this row always looks like a full rainbow no matter where huePhase is.
    // Bottom row: the 40 particle slots (8 hues x 5 brightness tiers) left to right. Each
    // group of 5 rectangles (40 px wide) is one hue band, going from bright to dim; as
    // the global hue rotates, the whole row slides through the rainbow in real time.
    renderPaletteStrip() {
        // Top row: 12 spark-bright color slots, one per spark. The full screen width
        // (320 px) is divided equally among 12 sparks; Math.floor() rounds down, so each
        // rectangle is 26 px wide (320 / 12 = 26.67).
        const sparkW = Math.floor(DISPLAY_W / SPARK_COUNT); // 26 px per spark rectangle

        for (let i = 0; i < SPARK_COUNT; i++) {
            // Starting x position: each rectangle begins where the previous one ended.
            const x = i * sparkW;

            // Width of this rectangle. The ternary operator "condition ? valueIfTrue :
            // valueIfFalse" is a compact if/else. For the last spark
            // (i === SPARK_COUNT - 1) the rectangle stretches to the right edge of the
            // screen by using DISPLAY_W - x instead of sparkW. This fills the 8 leftover
            // pixels (320 - 12 * 26 = 8) so the strip reaches all the way to the edge
            // with no gap. Every other spark uses the standard sparkW.
            const w = i === SPARK_COUNT - 1 ? DISPLAY_W - x : sparkW;

            BT.drawRectFill(new Rect2i(x, PALETTE_STRIP_SPARK_Y, w, PALETTE_STRIP_SPARK_H), C_SPARK_BRIGHT + i);
        }

        // Bottom row: 40 particle color slots, each 8 px wide. 8 hues x 5 tiers = 40
        // slots, and 40 x 8 px = 320 px, a perfect fit. The slots are arranged in the
        // same order as the palette layout: index 0..4 is hue 0, tiers 0..4 (brightest to
        // darkest), index 5..9 is hue 1, and so on up to index 35..39 for hue 7. Within
        // each group of 5 rectangles one hue fades from bright to dim, and across all 8
        // groups the full rainbow is visible at a glance.
        for (let i = 0; i < 8 * 5; i++) {
            BT.drawRectFill(new Rect2i(i * 8, PALETTE_STRIP_PART_Y, 8, PALETTE_STRIP_PART_H), C_PARTICLE_BASE + i);
        }
    }
}

// Hand the Demo class to BLIT386 to start the animation loop.
bootstrap(Demo);
