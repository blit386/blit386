/**
 * Basics Demo - Your very first Blit-Tech program!
 *
 * Welcome! This demo teaches you the absolute basics of making things appear
 * on screen with the Blit-Tech engine. You will learn:
 *   - How a demo is structured (the four lifecycle methods)
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
import { BloomEffect, bootstrap, BT, Color32, PipBoyEffect, Rect2i, SpriteSheet, Vector2i } from 'blit-tech';

/**
 * This line tells code editors that our Demo class follows the IBlitTechDemo
 * interface - the contract that says "you must have queryHardware, initialize,
 * update, and render methods."
 */
/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Blit-Tech uses a "palette" - a numbered list of colors you choose BEFORE drawing.
// Think of it like an artist picking paint colors and laying them on a palette tray
// before starting a painting. Each color gets a number (an "index").
// When we draw, we say "use color number 1" instead of spelling out the color each time.
//
// Index 0 is always transparent (completely invisible). Our custom colors start at 1.
//
// We use the same green-on-black "PipBoy" terminal palette as demo 023 so the CRT
// effect feels like one consistent retro screen across the demos. The sprite keeps
// its own colors (registered from the PNG further down) so the bouncing logo still
// reads as a logo, not a green silhouette.
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

// -- Post-process effect tuning --
// We wrap the whole demo in a CRT screen + soft glow, just like demo 023.
// You can ignore everything from here to the end of this region on a first
// read - the bouncing sprite would still work without any of it. Skip ahead
// to "// #region Main Logic" if you just want the basics.
//
// Tuning knobs for the PipBoyEffect (the CRT shader). Each one matches a
// field on the effect instance; see demo 023 for what every parameter does.
const CRT_SCAN_LINE_AMOUNT = 0.55;
const CRT_MASK_INTENSITY = 0.18;
const CRT_VIGNETTE_AMOUNT = 0.1;
const CRT_NOISE_AMOUNT = 0.025;
const BLOOM_GLOW = 0.18;

// Glitch state machine (also lifted from demo 023). Every few seconds the
// screen briefly stutters so the CRT illusion feels alive.
const GLITCH_COOLDOWN_MIN = 120; // 2 seconds at 60 ticks/sec
const GLITCH_COOLDOWN_MAX = 360; // 6 seconds
const GLITCH_ACTIVE_MIN = 5;
const GLITCH_ACTIVE_MAX = 30;
const GLITCH_TYPES = ['hshift', 'chromasplit', 'noise', 'flicker'];
const GLITCH_INTENSITY_MIN = 0.35;
const GLITCH_INTENSITY_MAX = 1.0;
const FLICKER_BASE = 1.0;
const FLICKER_DIP = 0.6;
const TARGET_FPS = 60;

// #endregion

// #region Glitch Helpers

// Random integer in [min, max). The glitch state machine uses this to pick
// a fresh duration / cooldown each time a burst starts.
function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min));
}

// Random float in [min, max). Used to roll the strength of each glitch.
function randFloat(min, max) {
    return min + Math.random() * (max - min);
}

// Pick a random element from an array. Picks the next glitch personality.
function randPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// #endregion

// #region Main Logic

/**
 * Bouncing-sprite demo - the simplest possible Blit-Tech demo.
 *
 * Every Blit-Tech demo is a class with four methods that the engine calls:
 *
 *   1. queryHardware() - called once at the very start, before anything else.
 *      You tell the engine how big the screen should be and how fast to run.
 *
 *   2. initialize() - called once after queryHardware(). This is where you
 *      load images, fonts, and set up your starting state. It uses "async"
 *      because loading files from the internet takes time, and we need to
 *      wait for them to finish (like waiting for a web page to load).
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
    // We start near the screen center as a placeholder; initialize() will
    // overwrite this with the exact center calculated from the real display size.
    pos = new Vector2i(160, 120);

    // "speed" is how many pixels the sprite moves each update().
    // x=2 means it moves 2 pixels to the right each tick.
    // y=1 means it moves 1 pixel downward each tick.
    // When we make a number negative (like -2), the sprite moves in the
    // opposite direction (left instead of right, or up instead of down).
    speed = new Vector2i(2, 1);

    // "size" is how big the sprite is: 16 pixels wide and 16 pixels tall.
    // We update this from the loaded image in initialize() so the bounce
    // checks stay correct even if you swap the PNG for a bigger one.
    size = new Vector2i(16, 16);

    // "bounces" counts how many times the sprite has hit a wall.
    // We display this on screen so you can see it going up.
    bounces = 0;

    // "palette" holds the list of colors the engine will use for drawing.
    // We create it in initialize() once we know what colors we need.
    palette = null;

    // "spriteSheet" is the loaded image we will draw on screen.
    // It stays null until initialize() finishes loading the PNG file.
    spriteSheet = null;

    // "spriteRect" tells the engine WHICH rectangular piece of the image to draw.
    // A sprite sheet can hold many sprites in one big picture. Our PNG only has
    // one sprite, so the rectangle covers the whole image: (x=0, y=0, full width, full height).
    spriteRect = null;

    // -- Post-process effect state --
    // The CRT screen + soft glow we wrap the whole demo in. We create them
    // here and register them in initialize(). See demo 023 for the full
    // explanation of post-processing.
    crt = null;
    bloom = null;

    // Glitch state machine state. Two counters: how long until the next
    // glitch (`glitchCooldown`) and how long the current glitch still has
    // to run (`glitchActive`). When `glitchActive` is 0 the screen is calm.
    glitchCooldown = 0;
    glitchActive = 0;
    glitchDuration = 0;
    glitchType = 'none';
    glitchPeak = 0;

    // #region Lifecycle Methods

    /**
     * Called once at the very start. Tells the engine:
     * - How many pixels wide and tall the drawing area should be.
     * - How big the canvas element should appear on the web page.
     * - How many times per second update() should run.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    queryHardware() {
        return {
            // displaySize is the "retro screen" resolution - the number of pixels
            // you can actually draw on. 320x240 was common in old game consoles.
            // Every pixel you draw maps to this grid.
            displaySize: new Vector2i(640, 480),

            // canvasDisplaySize is how big the canvas looks on the web page.
            // Setting it to the same 640x480 as displaySize means every internal
            // pixel maps to exactly one screen pixel -- a crisp, 1:1 view.
            canvasDisplaySize: new Vector2i(640, 480),

            // targetFPS is how many times per second update() will be called.
            // TARGET_FPS (60) is the standard for smooth animation. render() runs
            // once per screen refresh, which is also usually 60 times per second
            // but can be different (some monitors refresh at 120 or 144 Hz).
            targetFPS: TARGET_FPS,

            // detectDroppedFrames enables frame dropping detection. If true, the
            // engine will try to keep the frame rate consistent by skipping frames
            // when the game is running too slow.
            detectDroppedFrames: true,
        };
    }

    /**
     * Called once after queryHardware(). Sets up the palette, loads the sprite
     * image, and positions the sprite in the center of the screen.
     *
     * The "async" keyword lets us use "await" inside this method. "await" pauses
     * until something slow finishes (like loading an image from the server) and
     * then continues with the result. Without "async", we could not use "await".
     *
     * @returns {Promise<boolean>} Return true when everything is ready.
     *   Returning false tells the engine that something went wrong.
     */
    async initialize() {
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
        // These three colors match the PipBoy palette in demo 023 so the CRT
        // effect we wrap the demo in feels like one continuous screen.
        this.palette.set(C_BG, new Color32(8 * 2, 14 * 2, 8 * 2)); // Almost-black, faint green tint.
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

        // -- Step 3: activate the palette --
        // Tell the engine "use this palette from now on."
        // Before this call, the engine doesn't know what colors are available.
        // We do this AFTER adding the sprite colors so they are included.
        BT.paletteSet(this.palette);

        // -- Step 4: load the sprite image as a GPU texture --
        // SpriteSheet.load() reads the PNG file and uploads its pixels to the
        // graphics card so they can be drawn very fast. The result is a
        // SpriteSheet object that knows the image's width and height.
        this.spriteSheet = await SpriteSheet.load(SPRITE_URL);

        // -- Step 5: link each sprite pixel to a palette slot ("indexize") --
        // After this call, the sprite no longer remembers raw RGB colors. Each
        // pixel just stores the NUMBER of the palette slot whose color matches.
        // That is what makes palette tricks (like color cycling) possible later.
        this.spriteSheet.indexize(this.palette);

        // -- Step 6: remember the sprite's pixel size --
        // The sprite sheet exposes its dimensions through the .size property.
        // We copy them into our own size vector so the bounce checks below use
        // the real image size (not a hard-coded 16x16).
        this.size = new Vector2i(this.spriteSheet.size.x, this.spriteSheet.size.y);

        // The source rectangle says "draw the WHOLE image" - top-left at (0,0)
        // and as wide and tall as the image itself.
        this.spriteRect = new Rect2i(0, 0, this.size.x, this.size.y);

        // -- Step 7: position the sprite in the center of the screen --
        // BT.displaySize() returns how big the screen is (640x480 in our case).
        // We subtract the sprite's size so the CENTER of the sprite is centered,
        // not its top-left corner.
        // Math.floor() rounds down to a whole number - we need whole pixels
        // because you cannot draw at position 160.5 on a pixel screen.
        const screen = BT.displaySize();
        const x = Math.floor(screen.x / 2 - this.size.x / 2);
        const y = Math.floor(screen.y / 2 - this.size.y / 2);
        this.pos = new Vector2i(x, y);

        // -- Step 8: wrap the screen in a CRT + bloom post-process chain --
        // Lifted from demo 023 so this first demo also gets the retro look.
        // BT.effectAdd(...) makes the engine route the scene through the effect
        // chain instead of straight to the screen. Order matters: CRT first,
        // bloom second, so the bloom sees the post-CRT image.
        this.crt = new PipBoyEffect();
        this.crt.scanLineAmount = CRT_SCAN_LINE_AMOUNT;
        this.crt.maskIntensity = CRT_MASK_INTENSITY;
        this.crt.vignetteAmount = CRT_VIGNETTE_AMOUNT;
        this.crt.noiseAmount = CRT_NOISE_AMOUNT;

        this.bloom = new BloomEffect();
        this.bloom.bloomGlow = BLOOM_GLOW;

        BT.effectAdd(this.crt);
        BT.effectAdd(this.bloom);

        // Start the glitch state machine in "waiting" mode -- pick a random
        // cooldown so glitches don't all fire at the same moment if the user
        // refreshes the demo.
        this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);

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
        // BT.displaySize().x is how wide the screen is (320 pixels).
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

        // -- Drive the CRT effect (post-processing) --
        // The shader uses `time` for its rolling line and noise pattern. We
        // feed it seconds (ticks divided by the target frame rate) so the
        // animation speed is independent of how fast the demo runs.
        this.crt.time = BT.ticks() / TARGET_FPS;

        // Glitch state machine. See demo 023 for the full explanation.
        // Short version: when a glitch is active, mutate the shader uniforms
        // each frame following an "envelope" (sin curve) that ramps up and
        // back down. When no glitch is active, count down to the next one.
        if (this.glitchActive > 0) {
            // Where are we in the burst? 0 at start, 1 at end.
            const t = 1 - this.glitchActive / this.glitchDuration;
            // sin(0..PI) is a nice 0 -> 1 -> 0 hump -- our envelope.
            const envelope = Math.sin(t * Math.PI);
            this.applyGlitchUniforms(envelope);
            this.glitchActive--;
            if (this.glitchActive === 0) {
                // Burst over -- reset uniforms to "calm" and roll the next cooldown.
                this.crt.glitchIntensity = 0;
                this.crt.flickerAmount = FLICKER_BASE;
                this.glitchCooldown = randInt(GLITCH_COOLDOWN_MIN, GLITCH_COOLDOWN_MAX);
            }
        } else {
            this.glitchCooldown--;
            if (this.glitchCooldown <= 0) {
                // Time for a new burst: pick a personality, length, and strength.
                this.glitchType = randPick(GLITCH_TYPES);
                this.glitchDuration = randInt(GLITCH_ACTIVE_MIN, GLITCH_ACTIVE_MAX);
                this.glitchActive = this.glitchDuration;
                this.glitchPeak = randFloat(GLITCH_INTENSITY_MIN, GLITCH_INTENSITY_MAX);
                // Reset the random seed so the band noise looks new each burst.
                this.crt.glitchSeed = Math.random() * 1000;
            }
        }
    }

    /**
     * Drives the CRT shader uniforms based on the current glitch type and
     * the envelope value (0 -> 1 -> 0 over the lifetime of the burst).
     * @param {number} envelope
     */
    applyGlitchUniforms(envelope) {
        const peak = this.glitchPeak * envelope;
        // Reset to "calm" first, then layer the chosen personality on top.
        this.crt.glitchIntensity = 0;
        this.crt.flickerAmount = FLICKER_BASE;
        if (this.glitchType === 'hshift') {
            this.crt.glitchIntensity = peak;
        } else if (this.glitchType === 'chromasplit') {
            this.crt.glitchIntensity = peak * 1.2;
        } else if (this.glitchType === 'noise') {
            this.crt.glitchIntensity = peak * 0.9;
        } else if (this.glitchType === 'flicker') {
            this.crt.flickerAmount = FLICKER_BASE - (FLICKER_BASE - FLICKER_DIP) * envelope;
        }
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
        // Clear the entire screen to the PipBoy background. This erases the previous frame.
        // C_BG is palette index 1, which we set to (16, 28, 16) in initialize() -- almost
        // black but with a faint green tint so the CRT phosphor never looks dead.
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
        // BT.systemPrint() draws text using the engine's built-in 8x8 system font.
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
//   4. Calling queryHardware(), then initialize(), then starting the update/render loop
//
// After this line runs, your demo is alive and running!
bootstrap(Demo);

// #endregion
