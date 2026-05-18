/**
 * Basics Demo - Your very first Blit-Tech program!
 *
 * Welcome! This demo teaches you the absolute basics of making things appear
 * on screen with the Blit-Tech engine. You will learn:
 *   - How a demo is structured (init, update, and render)
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

// @pageTitle Blit-Tech Demo 001 - Basics

// #region Imports

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
import { bootstrap, BT, Color32, SpriteSheet, Vector2i } from 'blit-tech';

import { createDemoFooter } from './shared/demo-footer.js';

// #endregion

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

// Target update rate. 30 ticks per second is slower than the engine default (60).
const TARGET_FPS = 30;

const footer = createDemoFooter({ leftColor: C_GREEN, rightColor: C_AMBER });

// #endregion

// #region Type Definitions

/**
 * This line tells code editors that our Demo class follows the IBlitTechDemo
 * interface - the contract that says you need init, update, and render.
 * configure() is optional (the engine defaultConfig is 320x240 logical, 640x480
 * canvas, 60 FPS if you skip it).
 */
/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

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

    // #region Lifecycle Methods

    /**
     * Called once at the very start. Tells the engine:
     * - How many pixels wide and tall the drawing area should be.
     * - How big the canvas element should appear on the web page.
     * - How many times per second update() should run.
     *
     * @returns {{targetFPS: number}}
     */
    configure() {
        // Only override the tick rate; the engine fills in displaySize,
        // canvasDisplaySize, and the rest from defaultConfig().
        return {
            targetFPS: TARGET_FPS,
        };
    }

    /**
     * Called once after hardware settings are resolved (from configure()
     * merged with engine defaults, or defaults alone if you skip configure).
     * Sets up the palette, loads the sprite image, and positions the
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
        // Step 1: set up the color palette
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

        // Step 2: register every color used by the sprite image
        // The engine draws sprites using palette indices, not raw RGB colors.
        // So before we can show the sprite, every color in the PNG must live in
        // a palette slot. The library helper below opens the file, looks at every
        // pixel, collects each unique color, and writes them into the palette
        // starting at SPRITE_BASE. We "await" because reading the PNG file takes
        // a moment. The helper returns the list of colors it added, but we do
        // not need it here - we just want them sitting in the palette.
        await SpriteSheet.loadColorsIntoPalette(SPRITE_URL, this.palette, SPRITE_BASE);

        // Step 3: load + indexize sprite in one helper call
        // loadIndexed() wraps the full setup path and returns both the prepared sheet
        // and a full-image source rectangle.
        const indexed = await SpriteSheet.loadIndexed(SPRITE_URL, this.palette, SPRITE_BASE, { sort: 'none' });
        this.spriteSheet = indexed.sheet;
        this.spriteRect = indexed.srcRect;

        // Step 4: activate the palette
        // Tell the engine "use this palette from now on."
        // Before this call, the engine doesn't know what colors are available.
        // We do this AFTER adding the sprite colors so they are included.
        BT.paletteSet(this.palette);

        // Step 5: remember the sprite's pixel size
        // The sprite sheet exposes its dimensions through the .size property.
        // We copy them into our own size vector so the bounce checks below use
        // the real image size (not a hard-coded 16x16).
        this.size = new Vector2i(this.spriteSheet.size.x, this.spriteSheet.size.y);

        // Step 6: position the sprite in the center of the screen
        // BT.displaySize returns how big the screen is (320x240 in our case).
        // We subtract the sprite's size so the CENTER of the sprite is centered,
        // not its top-left corner.
        // Math.floor() rounds down to a whole number - we need whole pixels
        // because you cannot draw at position 160.5 on a pixel screen.
        const screen = BT.displaySize;
        const x = Math.floor(screen.x / 2 - this.size.x / 2);
        const y = Math.floor(screen.y / 2 - this.size.y / 2);
        this.pos = new Vector2i(x, y);

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
     * have happened since the demo started with BT.ticks.
     */
    update() {
        // Move the sprite by adding its speed to its position.
        // Think of it like taking steps: if you are standing at position 160
        // and your speed is 2, after one step you are at 162.
        // .add() creates a new Vector2i with both numbers added together.
        this.pos = this.pos.add(this.speed);

        // Check if the sprite has gone past the left or right edge of the screen.
        // BT.displaySize.x is how wide the screen is.
        // We subtract the sprite's width because the position is the TOP-LEFT
        // corner - the right edge of the sprite is at pos.x + size.x.
        if (this.pos.x <= 0 || this.pos.x >= BT.displaySize.x - this.size.x) {
            // Flip the horizontal speed so the sprite bounces back.
            // If speed.x was 2 (going right), it becomes -2 (going left).
            this.speed.x = -this.speed.x;

            // Count this as a bounce.
            this.bounces++;
        }

        // Same check for the top and bottom edges.
        if (this.pos.y <= 0 || this.pos.y >= BT.displaySize.y - this.size.y) {
            // Flip the vertical speed.
            this.speed.y = -this.speed.y;
            this.bounces++;
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
        // Clear the entire screen to the background color. This erases the previous frame.
        // C_BG is palette index 1, which we set to (16, 28, 16) in init() - almost
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
        // BT.targetFPS returns the target update rate we set in configure() (30 in this demo).
        BT.systemPrint(new Vector2i(3, 0), C_GREEN, `Position: ${this.pos.x}, ${this.pos.y}`);

        // Show the bounce count in amber so it stands out from the green text.
        // C_AMBER is palette index 3, the secondary PipBoy accent color.
        BT.systemPrint(new Vector2i(3, BT.displaySize.y - 27), C_AMBER, `Bounces: ${this.bounces}`);

        footer.draw();
    }

    // #endregion
}

// #endregion

// #region Exports

// bootstrap() is the function that starts everything. You pass it your Demo
// class, and it takes care of:
//   1. Setting up the HTML canvas on the page
//   2. Picking a renderer: WebGPU when the browser supports it, otherwise Canvas 2D software mode (see README)
//   3. Creating a new instance of your Demo class
//   4. Calling configure() when you define it, then init(), then the update/render loop
//
// After this line runs, your demo is alive and running!
bootstrap(Demo);

// #endregion
