/**
 * Basics Demo - Your very first Blit-Tech program!
 *
 * Welcome! This demo teaches you the absolute basics of making things appear
 * on screen with the Blit-Tech engine. You will learn:
 *   - How a demo is structured (configure is optional; then init, update, render)
 *   - How to clear the screen and load a sprite (a tiny picture)
 *   - How to make something move and bounce off walls
 *   - How to display text on screen
 *
 * If you are new to Blit-Tech, read this file carefully from top to bottom.
 * Every line has a comment explaining what it does and why.
 *
 * IMPORTANT - update() vs. render():
 *
 * update() runs at a FIXED rate (the targetFPS you set, usually 60 times per
 * second). It is where you do all your game logic: move things, check collisions,
 * count scores. It may run multiple times per screen refresh if the computer
 * needs to catch up, but never more than 8 times in a row.
 *
 * render() runs ONCE per screen refresh (usually 60 times per second, but it
 * can be faster on monitors that refresh at 120 Hz or more). It is where you
 * draw everything. NEVER put game logic here - only drawing code.
 *
 * When you switch to a different browser tab, BOTH update() and render() pause
 * completely. The browser stops calling them to save battery. When you come
 * back, the engine catches up with a few extra update() calls (up to 8) so
 * your game does not jump forward in time by a huge amount.
 *
 * Live version: https://vancura.dev/articles/blit-tech-basics
 */

/**
 * "import" loads tools from the Blit-Tech engine library.
 * Think of it like opening a toolbox before you start building.
 *   - bootstrap: a helper that starts the engine and connects your demo to it
 *   - BT: the main engine object - you call BT.clear(), BT.drawSprite(), etc.
 *   - Color32: represents a color with Red, Green, Blue (and optional Alpha)
 *   - Rect2i: a rectangle defined by (x, y, width, height) using whole numbers
 *   - SpriteSheet: a loaded image you can draw pieces of on screen (a "sprite")
 *   - Vector2i: a 2D point or direction using whole numbers (x, y)
 */
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
    RGBMask,
    RollLine,
    Scanlines,
    SpriteSheet,
    Vector2i,
    Vignette,
} from 'blit-tech';

/**
 * This line tells code editors that our Demo class follows the IBlitTechDemo
 * interface - the contract that says you need init, update, and render.
 * configure() is optional (the engine defaultConfig is 320x240 logical, 640x480
 * canvas, 60 FPS if you skip it).
 */
/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Blit-Tech uses a "palette" - a numbered list of colors you choose BEFORE drawing.
// Think of it like an artist picking paint colors and laying them on a palette tray
// before starting a painting. Each color gets a number (an "index").
// When we draw, we say "use color number 1" instead of spelling out the color each time.
//
// Index 0 is always transparent (completely invisible). Our custom colors start at 1.
const C_BG = 1; // Almost-black with a green tint: matches the inside of a PipBoy screen.
const C_GREEN = 2; // PipBoy green: the main text color (Position, FPS).
const C_AMBER = 3; // Amber: the bounce counter, standing in for the old blue accent.

// Where the sprite's own colors begin in the palette.
// We reserve indices 1..3 for our text colors above. From index 10 onward we
// store every color that the sprite image uses, one per palette slot. Starting
// at 10 (instead of 4) leaves a little room to add more text colors later
// without having to renumber the sprite slots.
const SPRITE_BASE = 10;

// Path to the sprite image. The "public" folder contents are served at the
// site root, so /sprites/logo-1.png maps to public/sprites/logo-1.png on disk.
const SPRITE_URL = '/sprites/logo-1.png';

// Target update rate. 60 ticks per second is the classic smooth-animation rate.
const TARGET_FPS = 30;

// -- Canvas output resolution --
// The internal logical screen is 320x240: the GPU keeps palette indices (one byte per
// pixel) at that size. The canvas drawing buffer is larger so we can resolve those indices
// to RGBA and upscale, then run CRT-style display-tier effects on that full-size RGBA
// image. Barrel curves and scanlines need those extra pixels to look smooth instead of
// blocky.
const OUTPUT_W = 960;
const OUTPUT_H = 720;

// -- Glitch state machine tuning --
// The glitch machine picks a random pause ("cooldown") between glitches, then
// fires a short burst. These numbers control those durations in ticks (60 per second).
// MIN/MAX cooldown = how long the screen stays calm between glitches.
// MIN/MAX active   = how long each glitch lasts once it starts.
const GLITCH_COOLDOWN_MIN = 60; // 1 second of calm
const GLITCH_COOLDOWN_MAX = 120; // up to 2 seconds of calm
const GLITCH_ACTIVE_MIN = 5; // shortest burst: about 0.08 seconds
const GLITCH_ACTIVE_MAX = 30; // longest burst: about 0.5 seconds

// The glitch "personalities" the state machine can pick from. Each one drives
// a different combination of effect settings to look distinct.
const GLITCH_TYPES = ['hshift', 'chromasplit', 'noise', 'flicker', 'interference'];

// The peak strength of each burst is random in this range. 0 = invisible, 1 = full.
const GLITCH_INTENSITY_MIN = 0.35;
const GLITCH_INTENSITY_MAX = 1.0;

// Flicker dims the whole screen. 1.0 = full brightness, lower = darker.
const FLICKER_BASE = 1.0;
const FLICKER_DIP = 0.6;

// Resting values for chromatic aberration and noise. Glitch bursts add on top
// of these, then we restore them when the burst ends so the screen calms back down.
// ABERRATION_BASE is 0 so the resting CRT look is clean -- the channel split only
// appears during a 'chromasplit' burst, making the state machine clearly visible.
const ABERRATION_BASE = 0; // no permanent channel split
const NOISE_BASE = 0.025; // constant faint film grain

// #endregion

// #region Glitch Helpers

/**
 * Returns a random whole number between min (included) and max (not included).
 * For example, randInt(2, 5) can return 2, 3, or 4 but never 5.
 * Used to pick a fresh cooldown or burst length each time the glitch fires.
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min));
}

/**
 * Returns a random decimal number between min (included) and max (not included).
 * For example, randFloat(0.35, 1.0) might return 0.72 or 0.91.
 * Used to roll the peak strength of each glitch.
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * Returns one random element from an array.
 * For example, randPick(['a', 'b', 'c']) might return 'b'.
 * Used to pick which glitch personality fires next.
 *
 * @template T
 * @param {readonly T[]} arr
 * @returns {T}
 */
function randPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// #endregion

// #region Main Logic

/**
 * Bouncing-sprite demo - the simplest possible Blit-Tech demo.
 *
 * Every Blit-Tech demo is a class the engine drives with three required methods
 * plus one optional hook:
 *
 *   1. configure() - optional. If you define it, the engine calls it once at
 *      the very start so you can set resolution, output size, and target FPS.
 *      If you skip it, you get sensible defaults (320x240, 640x480 output, 60 FPS).
 *
 *   2. init() - called once after hardware is known (from configure() or
 *      defaults). This is where you load images, fonts, and set up your
 *      starting state. It uses "async" because loading files from the internet
 *      takes time, and we need to wait for them to finish (like waiting for a
 *      web page to load).
 *
 *   3. update() - called many times per second (at the targetFPS rate you set).
 *      This is where you move things, check for collisions, and update scores.
 *      It runs at a FIXED pace so your game behaves the same on fast and slow
 *      computers. See the file header for the full explanation.
 *
 *   4. render() - called once per screen refresh to draw everything. Clear the
 *      screen, draw shapes, print text - all drawing goes here.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // - Instance properties -
    // These are values that belong to this demo. They keep track of where
    // things are and how they are moving. We set them up here at the top
    // so they are easy to find.

    // "pos" is short for "position". It stores where the sprite is on screen.
    // Vector2i holds two whole numbers: x (horizontal) and y (vertical).
    // (0, 0) is the top-left corner of the screen. x increases going right,
    // y increases going DOWN (this is different from math class where y goes up!).
    // We start near the screen center as a placeholder; init() will
    // overwrite this with the exact center calculated from the real display size.
    pos = new Vector2i(160, 120);

    // "speed" is how many pixels the sprite moves each update().
    // x=2 means it moves 2 pixels to the right each tick.
    // y=1 means it moves 1 pixel downward each tick.
    // When we make a number negative (like -2), the sprite moves in the
    // opposite direction (left instead of right, or up instead of down).
    speed = new Vector2i(1, 1);

    // "size" is how big the sprite is: 16 pixels wide and 16 pixels tall.
    // We update this from the loaded image in init() so the bounce
    // checks stay correct even if you swap the PNG for a bigger one.
    size = new Vector2i(16, 16);

    // "bounces" counts how many times the sprite has hit a wall.
    // We display this on screen so you can see it going up.
    bounces = 0;

    // "palette" holds the list of colors the engine will use for drawing.
    // We create it in init() once we know what colors we need.
    palette = null;

    // "spriteSheet" is the loaded image we will draw on screen.
    // It stays null until init() finishes loading the PNG file.
    spriteSheet = null;

    // "spriteRect" tells the engine WHICH rectangular piece of the image to draw.
    // A sprite sheet can hold many sprites in one big picture. Our PNG only has
    // one sprite, so the rectangle covers the whole image: (x=0, y=0, full width, full height).
    spriteRect = null;

    // -- Post-process effects --
    // These are the individual CRT effects we stack on top of the rendered frame.
    // Think of them like Photoshop filters applied in order. We set them up in
    // init() and update some of their settings every frame in update().
    // They all start as null and get filled in after the engine is ready.

    // Pixel-tier effect: runs on the logical 320x240 index buffer (palette slots, r8uint).
    // This produces chunky band shifts that stay palette-correct, like a real CRT glitch
    // in index space.
    pixelGlitch = null;

    // Display-tier effects: run on RGBA after the engine resolves indices and upscales
    // to the canvas size. They simulate what the physical CRT screen would look like.
    barrel = null; // pincushion curve that makes the edges bow inward
    aberration = null; // tiny red/blue channel split (cheap CRT optics)
    interference = null; // per-row horizontal jitter; 0 at rest, spiked by state machine
    rollLine = null; // a bright band slowly scrolling down the screen
    scanlines = null; // alternating bright/dark horizontal lines
    mask = null; // RGB phosphor dot pattern (the dots of the screen)
    vignette = null; // darkened corners, like looking into a curved tube
    noise = null; // faint random film grain every frame
    flicker = null; // whole-screen brightness modulated by the glitch machine
    bloom = null; // soft glow around bright pixels (phosphor halo)

    // -- Glitch state machine --
    // Two counters drive the glitch: "cooldown" counts DOWN to the next glitch,
    // "active" counts DOWN through the current glitch. When active > 0 we are
    // inside a glitch burst. When active reaches 0, the burst is over and we
    // start a new cooldown. See update() for the full logic.
    glitchCooldown = 0; // ticks until the next glitch starts
    glitchActive = 0; // ticks remaining in the current glitch (0 = no glitch)
    glitchDuration = 0; // total length of the current burst (used to compute the envelope)
    glitchType = 'none'; // which personality was randomly chosen for this burst
    glitchPeak = 0; // how strong this burst is at its peak (0..1)

    // #region Lifecycle Methods

    /**
     * Called once at the very start. Tells the engine:
     * - How many pixels wide and tall the drawing area should be.
     * - How big the canvas element should appear on the web page.
     * - How many times per second update() should run.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    configure() {
        return {
            // displaySize is the "retro screen" resolution - the pixel grid we draw on.
            // 320x240 is a classic retro resolution that keeps the pixel-art look.
            // All our drawing coordinates use this grid.
            displaySize: new Vector2i(320, 240),

            // canvasDisplaySize is the GPU drawing-buffer size on the web page.
            // After drawing at 320x240, the engine converts indices to RGBA and upscales
            // to this size, then runs display-tier CRT effects on that RGBA. Extra pixels
            // here let barrel distortion and scanlines look smooth instead of stair-stepped.
            canvasDisplaySize: new Vector2i(OUTPUT_W, OUTPUT_H),

            // 'nearest' keeps each logical pixel a crisp block when the engine upscales
            // from the resolved RGBA (one color per source cell) to this canvas size.
            // Using 'linear' here would blur the pixel art.
            outputUpscaleFilter: 'nearest',

            // targetFPS is how many times per second update() will be called.
            // 60 is the standard for smooth animation. render() runs once per
            // screen refresh, which is also usually 60 times per second but
            // can be different (some monitors refresh at 120 or 144 Hz).
            targetFPS: TARGET_FPS,

            // detectDroppedFrames enables frame dropping detection. If true, the
            // engine will try to keep the frame rate consistent by skipping frames
            // when the game is running too slow.
            detectDroppedFrames: true,
        };
    }

    /**
     * Called once after hardware settings are resolved (configure() or engine
     * defaults). Sets up the palette, loads the sprite image, and positions the
     * sprite in the center of the screen.
     *
     * The "async" keyword lets us use "await" inside this method. "await" pauses
     * until something slow finishes (like loading an image from the server) and
     * then continues with the result. Without "async", we could not use "await".
     *
     * @returns {Promise<boolean>} Return true when everything is ready.
     *   Returning false tells the engine that something went wrong.
     */
    async init() {
        // -- Step 1: set up the color palette --
        // A palette is like an artist's tray of paint colors laid out before painting.
        // We pick every color we need here so the engine knows about them in advance.
        // BT.paletteCreate(256) makes a new empty palette with room for 256 colors.
        // 256 is a classic retro number: old game consoles like the NES used exactly that many!
        this.palette = BT.paletteCreate(256);

        // Fill in the colors we need for text and background.
        // palette.set(number, color) stores one color in a numbered slot.
        // Color32(Red, Green, Blue) - each value is 0 to 255.
        // 0 = none of that color, 255 = maximum of that color.
        this.palette.set(C_BG, new Color32(16, 28, 16)); // Almost-black, faint green tint.
        this.palette.set(C_GREEN, new Color32(80, 200, 110)); // PipBoy phosphor green.
        this.palette.set(C_AMBER, new Color32(220, 180, 60)); // Vault-Tec amber accent.

        // -- Step 2: register every color used by the sprite image --
        // The engine draws sprites using palette indices, not raw RGB colors.
        // So before we can show the sprite, every color in the PNG must live in
        // a palette slot. The library helper below opens the file, looks at every
        // pixel, collects each unique color, and writes them into the palette
        // starting at SPRITE_BASE. We "await" because reading the PNG file takes
        // a moment. The helper returns the list of colors it added, but we do
        // not need it here - we just want them sitting in the palette.
        await SpriteSheet.loadColorsIntoPalette(SPRITE_URL, this.palette, SPRITE_BASE);

        // -- Step 3: load + indexize sprite in one helper call --
        // loadIndexed() wraps the full setup path and returns both the prepared sheet
        // and a full-image source rectangle.
        const indexed = await SpriteSheet.loadIndexed(SPRITE_URL, this.palette, SPRITE_BASE, { sort: 'none' });
        this.spriteSheet = indexed.sheet;
        this.spriteRect = indexed.srcRect;

        // -- Step 4: activate the palette --
        // Tell the engine "use this palette from now on."
        // Before this call, the engine doesn't know what colors are available.
        // We do this AFTER adding the sprite colors so they are included.
        BT.paletteSet(this.palette);

        // -- Step 5: remember the sprite's pixel size --
        // The sprite sheet exposes its dimensions through the .size property.
        // We copy them into our own size vector so the bounce checks below use
        // the real image size (not a hard-coded 16x16).
        this.size = new Vector2i(this.spriteSheet.size.x, this.spriteSheet.size.y);

        // -- Step 6: position the sprite in the center of the screen --
        // BT.displaySize() returns how big the screen is (320x240 in our case).
        // We subtract the sprite's size so the CENTER of the sprite is centered,
        // not its top-left corner.
        // Math.floor() rounds down to a whole number - we need whole pixels
        // because you cannot draw at position 160.5 on a pixel screen.
        const screen = BT.displaySize();
        const x = Math.floor(screen.x / 2 - this.size.x / 2);
        const y = Math.floor(screen.y / 2 - this.size.y / 2);
        this.pos = new Vector2i(x, y);

        // -- Step 7: set up the CRT post-process effect chain --
        // Post-processing means: after we finish drawing, the frame passes through filters
        // before it hits the screen. The engine uses two tiers (demo 023 explains more):
        //
        //   Pixel tier: runs on the 320x240 index buffer (which palette slot each pixel uses).
        //   Then: palette lookup + upscale to RGBA at canvas size (automatic).
        //   Display tier: runs on that RGBA — smooth CRT simulations like barrel and scanlines.
        //
        // We add them with BT.effectAdd(). The engine routes each effect by its tier.
        // Order within each tier matters because each filter reads the previous filter's output.

        // ---- Pixel-tier effect ----
        // PixelGlitch shifts horizontal bands sideways on the 320x240 index grid.
        // We start it calm (intensity = 0). The glitch state machine in update() will
        // spike the intensity whenever a 'hshift' burst fires.
        this.pixelGlitch = new PixelGlitch();
        this.pixelGlitch.bandHeight = 6; // each glitch band is 6 source pixels tall
        this.pixelGlitch.intensity = 0; // off until the state machine triggers it
        BT.effectAdd(this.pixelGlitch);

        // ---- Display-tier effects (added in order: first applied first) ----

        // Barrel distortion curves the edges inward like a real CRT glass tube.
        // It runs on RGBA at canvas resolution (after resolve + upscale), so the curve is smooth.
        this.barrel = new BarrelDistortion();
        this.barrel.curvature = 0.25; // noticeable curve; 0.05 is subtle, 0.10 is a small TV

        // Chromatic aberration: shifts red and blue channels horizontally.
        // Real CRT optics always had a tiny version of this.
        this.aberration = new ChromaticAberration();
        this.aberration.aberration = ABERRATION_BASE; // start at the resting value

        // Interference: per-row jitter that mimics an unstable analog signal.
        // Starts at 0 (screen calm). The 'interference' glitch type spikes this
        // to 0.06 during a burst, so the jitter only appears during glitch events.
        this.interference = new Interference();
        this.interference.amount = 0;

        // Roll line: a bright band slowly scrolling down the screen, like an old
        // TV set that is not quite synced to the signal.
        this.rollLine = new RollLine();
        this.rollLine.amount = 0; // 0.1; // how bright the band is
        this.rollLine.speed = 1.0; // how fast it scrolls

        // Scanlines: alternating bright/dark horizontal stripes, one per logical row.
        // Setting density = 240 aligns the lines to our 320x240 source pixels so each
        // source row gets exactly one scanline. Without this, the stripes would be
        // four times denser than the pixel art underneath.
        this.scanlines = new Scanlines();
        this.scanlines.amount = 0; // .55; // how much the effect is mixed in (0 = off, 1 = full)
        this.scanlines.strength = -8; // sharper bands at more negative values
        this.scanlines.density = 240; // match to the internal display height in pixels

        // RGB shadow mask: simulates the phosphor dot grid of an aperture-grille CRT.
        // Each cell has a red, green, and blue sub-pixel stripe.
        this.mask = new RGBMask();
        this.mask.intensity = 0; // .18; // subtle -- just enough to see the texture
        this.mask.size = 6; // dot pitch in source pixels
        this.mask.border = 0.5; // how dark the border between dots is

        // Vignette: darkens the corners and edges to sell the curved-glass look.
        this.vignette = new Vignette();
        this.vignette.amount = 0.4;

        // Noise: random film grain that reseeds every frame. A tiny amount makes the
        // screen feel "alive" even when nothing is moving.
        this.noise = new Noise();
        this.noise.amount = NOISE_BASE;

        // Flicker: a brightness multiplier. The glitch machine dips this during
        // 'flicker' bursts to simulate a brief power dropout.
        this.flicker = new Flicker();
        this.flicker.amount = FLICKER_BASE; // 1.0 = full brightness (no flicker yet)

        // Bloom: a soft glow around bright pixels. Added last so it sees the fully
        // post-processed image, giving the warm phosphor-halo look.
        this.bloom = new Bloom();
        this.bloom.spread = 3.0; // radius of the glow kernel
        this.bloom.glow = 0.18; // how much the glow blends onto the original pixel

        // Register all display-tier effects in order. The loop is just a tidy way
        // of calling BT.effectAdd() ten times -- same as writing it out ten lines.
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

        // ---- Glitch state machine: start in a random cooldown ----
        // We pick a random wait before the first glitch so multiple page loads do
        // not all glitch at the same moment.
        this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
        this.glitchActive = 0;
        this.glitchDuration = 0;
        this.glitchType = 'none';
        this.glitchPeak = 0;

        // Return true to tell the engine: "Everything loaded fine, start the demo!"
        return true;
    }

    /**
     * Called at a fixed rate (60 times per second in this demo).
     *
     * This is where ALL game logic goes: moving things, checking collisions,
     * counting scores, etc. Never draw anything here - that belongs in render().
     *
     * update() may be called 0 to 8 times between screen refreshes:
     *   - Usually it runs once per refresh (at 60 FPS on a 60 Hz monitor).
     *   - If the computer is slow, it may run multiple times to catch up.
     *   - If you switch to another browser tab, it pauses completely.
     *   - When you come back, it runs up to 8 times to catch up.
     *
     * Each call to update() is called a "tick". You can check how many ticks
     * have happened since the demo started with BT.ticks().
     */
    update() {
        // Move the sprite by adding its speed to its position.
        // Think of it like taking steps: if you are standing at position 160
        // and your speed is 2, after one step you are at 162.
        // .add() creates a new Vector2i with both numbers added together.
        this.pos = this.pos.add(this.speed);

        // Check if the sprite has gone past the left or right edge of the screen.
        // BT.displaySize().x is how wide the screen is.
        // We subtract the sprite's width because the position is the TOP-LEFT
        // corner - the right edge of the sprite is at pos.x + size.x.
        if (this.pos.x <= 0 || this.pos.x >= BT.displaySize().x - this.size.x) {
            // Flip the horizontal speed so the sprite bounces back.
            // If speed.x was 2 (going right), it becomes -2 (going left).
            this.speed.x = -this.speed.x;

            // Count this as a bounce.
            this.bounces++;
        }

        // Same check for the top and bottom edges.
        if (this.pos.y <= 0 || this.pos.y >= BT.displaySize().y - this.size.y) {
            // Flip the vertical speed.
            this.speed.y = -this.speed.y;
            this.bounces++;
        }

        // ---- Drive the time-animated effects ----
        // Some effects need to know the current time in SECONDS (not ticks) so their
        // animations run at the same speed regardless of frame rate.
        // BT.ticks() counts how many update() calls have happened. Dividing by
        // TARGET_FPS (60) converts that into seconds.
        const seconds = BT.timeSeconds();
        this.rollLine.time = seconds; // scrolls the bright band down the screen
        this.noise.time = seconds; // reseeds the grain so it looks random each frame
        this.interference.time = seconds; // needed when an 'interference' burst fires

        // ---- Glitch state machine ----
        // This is a simple "is a glitch happening right now?" counter system.
        // Think of it like a traffic light: most of the time it is green (calm),
        // but occasionally it switches to red (glitch burst) for a short time.
        if (this.glitchActive > 0) {
            // We are inside a glitch burst. Calculate an "envelope": a number that
            // rises from 0 to 1 and back to 0 over the lifetime of the burst.
            // We use Math.sin(0..PI) for this -- it gives a smooth hump shape.
            // At the start of the burst: t = 0, envelope = 0 (effect just starting).
            // At the middle:            t = 0.5, envelope ≈ 1 (effect at its peak).
            // At the end:               t = 1, envelope = 0 (effect fading out).
            const t = 1 - this.glitchActive / this.glitchDuration; // 0 at start, 1 at end
            const envelope = Math.sin(t * Math.PI); // smooth 0 -> 1 -> 0 hump

            // Apply the effect uniforms based on the current glitch type and strength.
            this.applyGlitchUniforms(envelope);

            // Count down: one tick used up.
            this.glitchActive--;

            // When the burst finishes, restore everything to calm and pick a new cooldown.
            if (this.glitchActive === 0) {
                this.resetGlitchUniforms();
                this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }
        } else {
            // No active glitch. Count down towards the next one.
            this.glitchCooldown--;

            if (this.glitchCooldown <= 0) {
                // Time for a new burst! Roll a random personality, duration, and strength.
                this.glitchType = randPick(GLITCH_TYPES);
                this.glitchDuration = randInt(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
                this.glitchActive = this.glitchDuration;
                this.glitchPeak = randFloat(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
                // A new seed means the band-shift noise looks different every burst.
                this.pixelGlitch.seed = Math.random() * 1000;
            }
        }
    }

    /**
     * Pushes the right values into each effect's settings based on the current
     * glitch type and the envelope (a 0 -> 1 -> 0 strength curve).
     *
     * We call resetGlitchUniforms() first so each burst always starts from a
     * clean resting state. Then we add on top of that. This prevents two
     * consecutive bursts from accidentally bleeding into each other.
     *
     * @param {number} envelope - strength of the burst right now, 0 to 1.
     */
    applyGlitchUniforms(envelope) {
        // "peak" is the strength for THIS tick. At the middle of the burst
        // (envelope = 1), peak = glitchPeak. At the edges, peak = 0.
        const peak = this.glitchPeak * envelope;

        // Start from calm, then layer the chosen personality on top.
        this.resetGlitchUniforms();

        if (this.glitchType === 'hshift') {
            // Chunky pixel band shift. Lives in 320x240 space via the pixel-tier
            // PixelGlitch effect. Each band is 6 source pixels tall (set by bandHeight).
            this.pixelGlitch.intensity = peak;
        } else if (this.glitchType === 'chromasplit') {
            // Boost chromatic aberration so the red and blue channels split apart.
            // This runs at display resolution, so the fringe is smooth.
            this.aberration.aberration = ABERRATION_BASE + peak * 4;
        } else if (this.glitchType === 'noise') {
            // Crank up the film grain until it looks like crackling static.
            this.noise.amount = NOISE_BASE + peak * 0.08;
        } else if (this.glitchType === 'flicker') {
            // Dip the whole-screen brightness -- the "lights briefly cut out" moment.
            this.flicker.amount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
        } else if (this.glitchType === 'interference') {
            // Per-row jitter burst. The screen is calm (amount = 0) between bursts;
            // this spikes the rows into jittering for the life of the burst.
            this.interference.amount = peak * 0.06;
        }
    }

    /**
     * Returns every effect uniform to its resting ("calm") value.
     * Called when a burst ends, and at the start of each frame inside
     * applyGlitchUniforms() so the state machine never inherits leftover
     * settings from the previous burst.
     */
    resetGlitchUniforms() {
        this.pixelGlitch.intensity = 0;
        this.aberration.aberration = ABERRATION_BASE;
        this.noise.amount = NOISE_BASE;
        this.flicker.amount = FLICKER_BASE;
        this.interference.amount = 0;
    }

    /**
     * Called once per screen refresh to draw everything.
     *
     * render() runs AFTER update(). By the time render() is called, all
     * positions and scores are already calculated. render() just reads
     * those values and draws the picture.
     *
     * IMPORTANT: render() runs once per screen refresh, which is usually
     * 60 times per second but can be different on monitors with higher
     * refresh rates (120 Hz, 144 Hz, etc.). Do NOT put game logic here
     * because it would run at different speeds on different monitors.
     *
     * Every frame you must clear the screen and redraw everything from
     * scratch. If you skip clearing, the old frame stays and new drawings
     * pile up on top of it (which can look cool, but is usually a bug!).
     */
    render() {
        // Clear the entire screen to the background color. This erases the previous frame.
        // C_BG is palette index 1, which we set to (16, 28, 16) in init() -- almost
        // black with a faint green tint.
        BT.clear(C_BG);

        // Draw the bouncing sprite at its current position.
        // BT.drawSprite takes (sheet, sourceRect, destinationPosition, paletteOffset).
        //   - sheet: the loaded image we want to draw from.
        //   - sourceRect: WHICH part of the image to draw. Our sprite fills the
        //     whole image, so spriteRect is the full image bounds.
        //   - destinationPosition: WHERE on screen to draw it (the top-left corner).
        //   - paletteOffset: a number added to every pixel's palette index. We
        //     pass 0 here to use the original colors. Bigger numbers can swap to
        //     alternate "team colors" - you will see this trick in demo 008.
        BT.drawSprite(this.spriteSheet, this.spriteRect, this.pos, 0);

        // Draw text showing the current FPS, position, and bounce count.
        // BT.systemPrint() draws text using the engine's built-in 6x14 system font.
        // It takes (position, paletteIndex, text) - no font loading needed!
        // The template string (`backticks`) lets us insert variable values with ${...}.
        // BT.fps() returns the target frames per second (60 in this demo).
        BT.systemPrint(new Vector2i(3, 0), C_GREEN, `Position: ${this.pos.x}, ${this.pos.y}`);
        BT.systemPrint(new Vector2i(BT.displaySize().x - 50, 0), C_GREEN, `FPS: ${BT.fps()}`);

        // Show the bounce count in amber so it stands out from the green text.
        // C_AMBER is palette index 3, the secondary PipBoy accent color.
        BT.systemPrint(new Vector2i(3, BT.displaySize().y - 13), C_AMBER, `Bounces: ${this.bounces}`);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// bootstrap() is the function that starts everything. You pass it your Demo
// class, and it takes care of:
//   1. Setting up the HTML canvas on the page
//   2. Checking that your browser supports WebGPU (the graphics technology)
//   3. Creating a new instance of your Demo class
//   4. Calling configure() when you define it, then init(), then the update/render loop
//
// After this line runs, your demo is alive and running!
bootstrap(Demo);

// #endregion
