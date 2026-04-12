/**
 * Basics Demo - Your very first Blit-Tech program!
 *
 * Welcome! This demo teaches you the absolute basics of making things appear
 * on screen with the Blit-Tech engine. You will learn:
 *   - How a demo is structured (the four lifecycle methods)
 *   - How to clear the screen and draw shapes
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
 *   - BT: the main engine object - you call BT.clear(), BT.drawRectFill(), etc.
 *   - Color32: represents a color with Red, Green, Blue (and optional Alpha)
 *   - Rect2i: a rectangle defined by (x, y, width, height) using whole numbers
 *   - Vector2i: a 2D point or direction using whole numbers (x, y)
 */
import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/**
 * This line tells code editors that our Demo class follows the IBlitTechDemo
 * interface - the contract that says "you must have queryHardware, initialize,
 * update, and render methods."
 */
/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Palette Constants

// Blit-Tech uses a "palette" - a numbered list of colors you choose BEFORE drawing.
// Think of it like an artist picking paint colors and laying them on a palette tray
// before starting a painting. Each color gets a number (an "index").
// When we draw, we say "use color number 1" instead of spelling out the color each time.
//
// Index 0 is always transparent (completely invisible). Our custom colors start at 1.
const C_WHITE = 1; // White: the bouncing square, the line, and most text
const C_BG = 2; // Dark blue: fills the whole screen each frame to erase the last picture
const C_BLUE = 3; // Blue: used for the bounce counter so it stands out from the rest

// #endregion

// #region Demo Class

/**
 * Bouncing-square demo - the simplest possible Blit-Tech demo.
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

    // "pos" is short for "position". It stores where the square is on screen.
    // Vector2i holds two whole numbers: x (horizontal) and y (vertical).
    // (0, 0) is the top-left corner of the screen. x increases going right,
    // y increases going DOWN (this is different from math class where y goes up!).
    // We start at (160, 120) which is roughly the center of a 320x240 screen.
    pos = new Vector2i(160, 120);

    // "speed" is how many pixels the square moves each update().
    // x=2 means it moves 2 pixels to the right each tick.
    // y=1 means it moves 1 pixel downward each tick.
    // When we make a number negative (like -2), the square moves in the
    // opposite direction (left instead of right, or up instead of down).
    speed = new Vector2i(2, 1);

    // "size" is how big the square is: 16 pixels wide and 16 pixels tall.
    size = new Vector2i(16, 16);

    // "bounces" counts how many times the square has hit a wall.
    // We display this on screen so you can see it going up.
    bounces = 0;

    // "palette" holds the list of colors the engine will use for drawing.
    // We create it in initialize() once we know what colors we need.
    palette = null;

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
            displaySize: new Vector2i(320, 240),

            // canvasDisplaySize is how big the canvas looks on the web page.
            // Setting it to 640x480 (double the display size) makes each pixel
            // appear as a 2x2 square, giving that chunky retro look.
            canvasDisplaySize: new Vector2i(640, 480),

            // targetFPS is how many times per second update() will be called.
            // 60 is the standard for smooth animation. render() runs once per
            // screen refresh, which is also usually 60 times per second but can
            // be different (some monitors refresh at 120 or 144 times per second).
            targetFPS: 60,
        };
    }

    /**
     * Called once after queryHardware(). Sets up the palette and positions the
     * square in the center of the screen.
     *
     * The "async" keyword is required by the engine interface. In more complex
     * demos you would use "await" here to load images and fonts from the server.
     * This demo uses the built-in system font, so there is nothing to load!
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

        // Fill in the colors we need. palette.set(number, color) stores one color.
        // Color32(Red, Green, Blue) - each value is 0 to 255.
        // 0 = none of that color, 255 = maximum of that color.
        this.palette.set(C_WHITE, Color32.white());
        this.palette.set(C_BG, new Color32(0, 0, 40));
        this.palette.set(C_BLUE, Color32.fromHex('#5da0f2'));

        // Tell the engine "use this palette from now on."
        // Before this call, the engine doesn't know what colors are available.
        BT.paletteSet(this.palette);

        // -- Step 2: position the square in the center --
        // Place the square exactly in the center of the screen.
        // BT.displaySize() returns how big the screen is (320x240 in our case).
        // We subtract the square's size, so the CENTER of the square is centered,
        // not its top-left corner.
        // Math.floor() rounds down to a whole number - we need whole pixels
        // because you cannot draw at position 160.5 on a pixel screen.
        const screen = BT.displaySize();
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
     * have happened since the demo started with BT.ticks().
     */
    update() {
        // Move the square by adding its speed to its position.
        // Think of it like taking steps: if you are standing at position 160
        // and your speed is 2, after one step you are at 162.
        // .add() creates a new Vector2i with both numbers added together.
        this.pos = this.pos.add(this.speed);

        // Check if the square has gone past the left or right edge of the screen.
        // BT.displaySize().x is how wide the screen is (320 pixels).
        // We subtract the square's width because the position is the TOP-LEFT
        // corner - the right edge of the square is at pos.x + size.x.
        if (this.pos.x <= 0 || this.pos.x >= BT.displaySize().x - this.size.x) {
            // Flip the horizontal speed so the square bounces back.
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
        // Clear the entire screen to dark blue. This erases the previous frame.
        // C_BG is palette index 2, which we set to (0, 0, 40) in initialize().
        // We pass the index number, not the color directly - the palette handles the rest.
        BT.clear(C_BG);

        // Draw the bouncing square as a filled white rectangle.
        // Rect2i takes (x, y, width, height) - the position and size.
        // C_WHITE is index 1, which we set to pure white (255, 255, 255).
        const squarePos = new Rect2i(this.pos.x, this.pos.y, this.size.x, this.size.y);
        BT.drawRectFill(squarePos, C_WHITE);

        // Draw text showing the current FPS, position, and bounce count.
        // BT.systemPrint() draws text using the engine's built-in 8x8 system font.
        // It takes (position, paletteIndex, text) - no font loading needed!
        // The template string (`backticks`) lets us insert variable values with ${...}.
        // BT.fps() returns the target frames per second (60 in this demo).
        BT.systemPrint(new Vector2i(3, 0), C_WHITE, `Position: ${this.pos.x}*${this.pos.y}`);
        BT.systemPrint(new Vector2i(BT.displaySize().x - 50, 0), C_WHITE, `FPS: ${BT.fps()}`);

        // Show the bounce count in blue so it stands out from the other text.
        // C_BLUE is palette index 3, which we set to pure blue in initialize().
        BT.systemPrint(new Vector2i(3, BT.displaySize().y - 13), C_BLUE, `Bounces: ${this.bounces}`);
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
