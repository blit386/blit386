/**
 * Basics Demo - Your very first BLIT386 program!
 *
 * Welcome! This demo teaches you the absolute basics of making things appear
 * on screen with the BLIT386 engine. You will learn:
 *   - How a demo is structured (configure, init, update, render, overlayRows)
 *   - How to pick colors with a palette and clear the screen
 *   - How to load a sprite (a tiny picture) and draw it
 *   - How to make that sprite move and bounce off the screen edges
 *   - How smooth motion works when update() and render() run at different speeds
 *     (BT.renderAlpha + Vector2i.lerp)
 *   - How to show a text hint with the shared UI kit (ui.label)
 *   - How to show live stats and a timing chart in the engine overlay
 *     (overlayRows, BT.assignTag)
 *
 * If you are new to BLIT386, read this file carefully from top to bottom.
 * Almost every block has a comment explaining what it does and why.
 *
 * This demo sets targetFPS to 30 in configure() (slower than the engine default of 60)
 * so motion is easy to follow. update() therefore runs about 30 times per second.
 *
 * IMPORTANT - update() vs. render():
 *
 * update() runs at a FIXED rate (targetFPS from configure()). It is where you do
 * all game logic: move things, check wall collisions, count bounces. It may run
 * multiple times per screen refresh if the computer needs to catch up, but never
 * more than 8 times in a row.
 *
 * render() runs ONCE per screen refresh (often 60 times per second on a laptop
 * screen, but it can be faster on 120 or 144 times-per-second monitors). It is
 * where you draw everything. NEVER put game logic here - only drawing code.
 *
 * When you switch to a different browser tab, BOTH update() and render() pause
 * completely. The browser stops calling them to save battery. When you come
 * back, the engine catches up with a few extra update() calls (up to 8) so
 * your game does not jump forward in time by a huge amount.
 *
 * Live version: https://demos.blit386.dev/001-basics
 */

// @pageTitle BLIT386 Demo 001 - Basics

/**
 * "import" loads tools from the BLIT386 engine library.
 * Think of it like opening a toolbox before you start building.
 *   - bootstrap: a helper that starts the engine and connects your demo to it
 *   - BT: the main engine object - you call BT.clear(), BT.drawSprite(), etc.
 *   - Color32: represents a color with Red, Green, Blue (and optional Alpha)
 *   - SpriteSheet: a loaded image you can draw pieces of on screen (a "sprite")
 *   - Vector2i: a 2D point or direction using whole numbers (x, y)
 */
import { bootstrap, BT, Color32, SpriteSheet, Vector2i } from 'blit386';

// The shared demo UI kit - every demo in this series uses it for on-screen text and panels
// so they all look the same. applyTheme() installs the kit's colors into our palette, and
// ui.* draws things like the hint label you see in the top-left corner.
import { applyTheme, ui } from './shared/ui.js';

// BLIT386 uses a "palette" - a numbered list of colors you choose BEFORE drawing.
// Think of it like an artist picking paint colors and laying them on a palette tray
// before starting a painting. Each color gets a number (an "index").
// When we draw, we say "use color number 1" instead of spelling out the color each time.
//
// Index 0 is always transparent (completely invisible). Our custom colors start at 1.
const C_BG = 1; // Almost-black with a faint green tint - our screen background.
const C_OVERLAY_BAR = 2; // Slightly lighter bar behind overlay text (easy to read on dark green).
const C_OVERLAY_GREEN = 3; // Bright green for the position line in the overlay.
const C_OVERLAY_AMBER = 4; // Amber (warm yellow) for the bounce count in the overlay.
const C_OVERLAY_ERROR = 5; // Red the timing chart uses when a frame is badly late.

// Where the sprite's own colors begin in the palette.
// We already use slots 1-5 for background and overlay colors. Starting the sprite
// colors at 10 leaves a little empty room (slots 6-9) so we can add more scene
// colors later without having to renumber the sprite slots.
const SPRITE_BASE = 10;

// Path to the sprite image. The "public" folder contents are served at the
// site root, so /sprites/logo-1.png maps to public/sprites/logo-1.png on disk.
const SPRITE_URL = '/sprites/logo-1.png';

/**
 * These @typedef lines tell code editors what types we mean when we write
 * Palette, SpriteSheet, and so on. They do not change how the demo runs.
 * IBTDemo is the contract that says a demo needs init, update, and render.
 * configure() and overlayRows() are optional extras (this demo uses both).
 * If you skip configure(), the engine uses defaults: 320x240 logical pixels,
 * 640x480 canvas, 60 updates per second.
 */
/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').SpriteSheet} SpriteSheet */
/** @typedef {import('blit386').Rect2i} Rect2i */

/**
 * Bouncing-sprite demo - a friendly first BLIT386 demo.
 *
 * Every BLIT386 demo is a class the engine drives. Three methods are required;
 * configure() and overlayRows() are optional extras this file also uses:
 *
 *   1. configure() - optional. If you define it, the engine calls it once at
 *      the very start so you can change settings (FPS, overlay options, and more).
 *      If you skip it, you get sensible defaults (320x240, 640x480 output, 60 FPS).
 *
 *   2. init() - called once after hardware settings are ready. This is where you
 *      load images, set up colors, and pick starting positions. It uses "async"
 *      because loading files takes time, and we need to wait for them to finish
 *      (like waiting for a web page to load).
 *
 *   3. update() - called at the targetFPS rate (30 per second in this demo).
 *      This is where you move the sprite, flip speed when it hits a wall, and
 *      count bounces. It runs at a FIXED pace so motion matches on fast and slow
 *      computers. See the file header for the full explanation.
 *
 *   4. overlayRows() - optional. Feeds extra text lines into the engine overlay
 *      (the HUD you toggle with the ~ key). Not required, but handy for live stats.
 *
 *   5. render() - called once per screen refresh to draw everything. Clear the
 *      screen, draw shapes, print text - all drawing goes here.
 *
 * @implements {IBTDemo}
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
    // x=1 means it moves 1 pixel to the right each tick.
    // y=1 means it moves 1 pixel downward each tick.
    // When we make a number negative (like -1), the sprite moves in the
    // opposite direction (left instead of right, or up instead of down).
    speed = new Vector2i(1, 1);

    // "prevPos" remembers where the sprite was at the START of the most recent
    // update() tick, before that tick moved it. render() uses this together with
    // BT.renderAlpha to draw the sprite smoothly between ticks - see the big comment
    // above render() below for the full explanation. It starts as a copy of pos;
    // init() updates it again once the real starting position is known.
    prevPos = new Vector2i(160, 120);

    // "size" is how big the sprite is: we start with 16x16 as a guess.
    // We update this from the loaded image in init() so the bounce
    // checks stay correct even if you swap the PNG for a bigger one.
    size = new Vector2i(16, 16);

    // "bounces" counts how many times the sprite has hit a wall.
    // We show this in the overlay so you can see it going up.
    bounces = 0;

    // "palette" holds the list of colors the engine will use for drawing.
    // We create it in init() once we know what colors we need.
    /** @type {Palette | null} */
    palette = null;

    // "spriteSheet" is the loaded image we will draw on screen.
    // It stays null until init() finishes loading the PNG file.
    /** @type {SpriteSheet | null} */
    spriteSheet = null;

    // "spriteRect" tells the engine WHICH rectangular piece of the image to draw.
    // A sprite sheet can hold many sprites in one big picture. Our PNG only has
    // one sprite, so the rectangle covers the whole image: (x=0, y=0, full width, full height).
    /** @type {Rect2i | null} */
    spriteRect = null;

    // Reused every frame for the engine overlay (position + bounces).
    // We keep one array and update the text strings in place so we do not
    // create brand-new objects on every screen refresh.
    overlayRowData = [
        { leftText: 'Position 0, 0', textPaletteIndex: C_OVERLAY_GREEN },
        { leftText: 'Bounces 0', textPaletteIndex: C_OVERLAY_AMBER },
    ];

    /**
     * Called once at the very start. Returns settings the engine should use.
     * This demo does not change the screen size (the engine keeps its defaults:
     * 320x240 logical pixels, 640x480 on the web page). We mainly slow down
     * update() and turn on helpful overlay tools for learning.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        // We only change the settings listed below. Everything else (display size,
        // canvas size, and more) comes from the engine's defaultConfig().
        return {
            // How often update() should run. 30 times per second is slower than the
            // engine default (60), so the bounce is easier to watch.
            targetFPS: 30,

            // Live palette grid at the bottom: every palette slot as a tiny color chip.
            // Slots your demo draws this frame show their color; unused slots look dim.
            isOverlayPaletteEnabled: true,

            // Show 16 color chips per row and only 1 row at a time
            // (scroll the rest with the mouse wheel or by dragging).
            overlayPaletteColumns: 16,
            overlayPaletteRowsVisible: 1,

            // Scrolling timing chart under the title row.
            // Green marks show update() time; amber marks show render() time.
            // One mark per screen refresh - handy for seeing when work spikes.
            isOverlayTimingChartEnabled: true,
            overlayTimingChartHeight: 32,

            // Which palette slots to use for the overlay bars
            // (top FPS strip, bottom title strip, and the bar behind our custom rows).
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_OVERLAY_GREEN,
                gapPaletteIndex: C_BG,
            },

            // Colors for the timing chart: green = update, amber = render,
            // amber again for "a bit late", red for "badly late", green for our H/V tags.
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_OVERLAY_GREEN,
                renderBarPaletteIndex: C_OVERLAY_AMBER,
                warningPaletteIndex: C_OVERLAY_AMBER,
                errorPaletteIndex: C_OVERLAY_ERROR,
                tagPaletteIndex: C_OVERLAY_GREEN,
            },
        };
    }

    /**
     * Called once after hardware settings are ready (from configure() mixed with
     * engine defaults, or defaults alone if you skip configure).
     * Sets up the palette, loads the sprite image, and places the sprite
     * in the center of the screen.
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
        // 256 is a common size in retro-style games - plenty of slots for this demo.
        this.palette = BT.paletteCreate(256);

        // Fill in the colors we need for background and overlay text.
        // palette.set(number, color) stores one color in a numbered slot.
        // Color32(Red, Green, Blue) - each value is 0 to 255.
        // 0 = none of that color, 255 = maximum of that color.
        this.palette.set(C_BG, new Color32(16, 28, 16)); // Almost-black, faint green tint.

        // Overlay colors (must match overlayStyle and overlayRowData above).
        this.palette.set(C_OVERLAY_BAR, new Color32(24, 44, 28)); // Dark bar, slightly lighter than C_BG.
        this.palette.set(C_OVERLAY_GREEN, new Color32(80, 200, 110)); // Bright green for overlay text.
        this.palette.set(C_OVERLAY_AMBER, new Color32(220, 180, 60)); // Amber accent for the bounce row.
        this.palette.set(C_OVERLAY_ERROR, new Color32(200, 70, 70)); // Red when the timing chart marks a bad spike.

        // Step 2: load the sprite AND put its colors into the palette
        // The engine draws sprites using palette numbers, not raw Red/Green/Blue.
        // So every color in the PNG must live in a palette slot first.
        //
        // SpriteSheet.loadIndexed() does the whole job in one call:
        //   1. Opens the PNG and writes each unique color into the palette
        //      starting at SPRITE_BASE.
        //   2. Loads the image as a sprite sheet.
        //   3. "Indexizes" it: turns every pixel into a palette number
        //      (like labeling each paint blob with the slot it matches).
        //   4. Returns the sheet plus a rectangle that covers the whole image.
        //
        // { sort: 'none' } keeps colors in the order they appear in the file
        // (left to right, top to bottom). The default would sort them darkest-first
        // instead - fine for many games, but we keep file order here so the slots
        // match the PNG layout if you peek at the overlay palette grid.
        //
        // We "await" because reading the PNG takes a moment.
        const indexed = await SpriteSheet.loadIndexed(SPRITE_URL, this.palette, SPRITE_BASE, { sort: 'none' });
        this.spriteSheet = indexed.sheet;
        this.spriteRect = indexed.srcRect;

        // Step 3: install the shared UI theme
        // applyTheme() writes the demo series' twelve standard UI colors into high
        // palette slots (240-251 by default, far away from our low scene slots), so the
        // kit's hint label in render() has colors to draw with. It must run BEFORE
        // BT.paletteSet() below so those colors are included when the palette goes live.
        // (It also returns a map of slot names, but we do not need that map in this demo.)
        applyTheme(this.palette);

        // Step 4: activate the palette
        // Tell the engine "use this palette from now on."
        // Before this call, the engine does not know what colors are available.
        // We do this AFTER adding the sprite and UI colors so they are included.
        BT.paletteSet(this.palette);

        // Step 5: remember the sprite's pixel size
        // The sprite sheet exposes its dimensions through the .size property.
        // We copy them into our own size vector so the bounce checks below use
        // the real image size (not our 16x16 guess from above).
        this.size = new Vector2i(this.spriteSheet.size.x, this.spriteSheet.size.y);

        // Step 6: position the sprite in the center of the screen
        // BT.displaySize is how big the screen is (320x240 with the defaults).
        // We subtract the sprite's size so the CENTER of the sprite is centered,
        // not its top-left corner.
        // Math.floor() rounds down to a whole number - we need whole pixels
        // because you cannot draw at position 160.5 on a pixel screen.
        const screen = BT.displaySize;
        const x = Math.floor(screen.x / 2 - this.size.x / 2);
        const y = Math.floor(screen.y / 2 - this.size.y / 2);
        this.pos = new Vector2i(x, y);

        // Keep prevPos in sync with the real starting position so the very first
        // render() does not try to smoothly slide in from the (160, 120) placeholder.
        this.prevPos = this.pos;

        // Return true to tell the engine: "Everything loaded fine, start the demo!"
        return true;
    }

    /**
     * Called at a fixed rate (30 times per second in this demo).
     *
     * This is where ALL game logic goes: moving things, checking collisions,
     * counting scores, etc. Never draw anything here - that belongs in render().
     *
     * update() may be called 0 to 8 times between screen refreshes:
     *   - Usually it runs about 30 times per second (our targetFPS).
     *     On a 60-times-per-second monitor, that is about one update every
     *     two screen refreshes.
     *   - If the computer is slow, it may run multiple times to catch up.
     *   - If you switch to another browser tab, it pauses completely.
     *   - When you come back, it runs up to 8 times to catch up.
     *
     * Each call to update() is called a "tick". You can check how many ticks
     * have happened since the demo started with BT.ticks.
     */
    update() {
        // --- Bounce logic (game rules live only in update(), never in render()) ---
        // Remember where the sprite was BEFORE this tick moves it. render() will use
        // this a moment from now to draw a smooth in-between position instead of a
        // pop - see the big comment above render() below.
        this.prevPos = this.pos;

        // Move the sprite by adding its speed to its position.
        // Think of it like taking steps: if you are standing at position 160
        // and your speed is 1, after one step you are at 161.
        // .add() creates a new Vector2i with both numbers added together.
        this.pos = this.pos.add(this.speed);

        // Wall test for left/right: pos is the sprite's TOP-LEFT corner.
        // The right edge of the sprite is at pos.x + size.x, so we compare against
        // displaySize.x - size.x (the farthest right the top-left corner may go
        // while the whole sprite still fits on screen).
        //
        // We only flip the speed here - we do not push the sprite back onto the
        // edge. So for one tick it can sit one pixel past the wall, then travel
        // inward again. That is normal for this simple bounce.
        if (this.pos.x <= 0 || this.pos.x >= BT.displaySize.x - this.size.x) {
            // Bounce: multiply speed.x by -1 to reverse horizontal direction.
            // If speed.x was 1 (going right), it becomes -1 (going left).
            this.speed.x = -this.speed.x;

            // Count this as a bounce.
            this.bounces++;

            // Mark the moment on the timing chart (press ~ / Backquote to show the overlay).
            // Each tag scrolls left with the green/amber marks so you can line up
            // spikes in update/render time with when the logo hit a wall.
            BT.assignTag('H');
        }

        // Same check for the top and bottom edges.
        if (this.pos.y <= 0 || this.pos.y >= BT.displaySize.y - this.size.y) {
            // Flip the vertical speed.
            this.speed.y = -this.speed.y;
            this.bounces++;

            // Same timing-chart marker as the left/right bounce above.
            BT.assignTag('V');
        }
    }

    /**
     * Optional hook: feeds extra text rows into the engine overlay (not the game canvas).
     *
     * The overlay is the HUD the engine draws after render(): FPS, demo title, timing chart,
     * palette grid, and these custom rows. Toggle it with the ~ key (Backquote on the
     * keyboard) or by clicking/tapping the symbol in the bottom-left corner.
     * Each row here is plain text plus a palette index for its color.
     * We reuse overlayRowData every frame and only rewrite the strings - no new arrays.
     *
     * @returns {readonly { leftText: string, textPaletteIndex: number }[]}
     */
    overlayRows() {
        this.overlayRowData[0].leftText = `Position (${this.pos.x}, ${this.pos.y})`;
        this.overlayRowData[1].leftText = `Bounces ${this.bounces}`;

        return this.overlayRowData;
    }

    /**
     * Called once per screen refresh to draw everything.
     *
     * render() runs AFTER update(). By the time render() is called, all
     * positions and scores are already calculated. render() just reads
     * those values and draws the picture.
     *
     * IMPORTANT: render() runs once per screen refresh (your monitor's refresh
     * rate - often 60, but 120 or 144 on gaming displays). Do NOT put game logic
     * here because it would run at different speeds on different monitors.
     *
     * Every frame you must clear the screen and redraw everything from
     * scratch. If you skip clearing, the old frame stays and new drawings
     * pile up on top of it (which can look cool, but is usually a bug!).
     *
     * WHY THE SPRITE MIGHT LOOK LIKE IT STUTTERS WITHOUT THE FIX BELOW:
     * This demo sets targetFPS to 30 (see configure() above), but render() still
     * runs at your monitor's full refresh rate - 60, 120, whatever your screen
     * supports. That means update() (which moves the sprite) and render()
     * (which draws it) run at DIFFERENT speeds. On a 60-times-per-second monitor,
     * render() runs roughly twice for every one update() - so if render() just
     * drew this.pos every time, the sprite would sit frozen for one refresh, then
     * hop forward, then sit frozen again. That hop-hop-hop motion is "stutter."
     *
     * THE FIX: BT.renderAlpha. Think of it like a movie: update() ticks are the
     * individual film frames (say, one every two screen refreshes), and render()
     * is a projector that can run faster than the film advances. BT.renderAlpha
     * tells the projector how far along we are between "the last film frame" and
     * "the next one" - a fraction from 0 (the last update() tick just finished) up
     * to just under 1 (the next update() tick is about to happen). We use it below
     * to blend prevPos (where the sprite WAS) toward pos (where it IS) so every
     * single render() draws the sprite at its true in-between position instead of
     * only where it was as of the last tick.
     */
    render() {
        // Clear the entire screen to the background color. This erases the previous frame.
        // C_BG is palette index 1, which we set to (16, 28, 16) in init() - almost
        // black with a faint green tint.
        BT.clear(C_BG);

        // Blend prevPos toward pos by BT.renderAlpha to get the sprite's true position
        // at this exact render moment. Vector2i.lerp(a, b, t) walks a fraction t of the
        // way from a to b: t=0 gives a (prevPos), t=1 gives b (pos), and anything in
        // between gives a smooth blend - exactly what BT.renderAlpha provides each frame.
        const drawPos = Vector2i.lerp(this.prevPos, this.pos, BT.renderAlpha);

        // Draw the bouncing sprite at its smoothed position.
        // BT.drawSprite takes (sheet, sourceRect, destinationPosition, paletteOffset).
        //   - sheet: the loaded image we want to draw from.
        //   - sourceRect: WHICH part of the image to draw. Our sprite fills the
        //     whole image, so spriteRect is the full image bounds.
        //   - destinationPosition: WHERE on screen to draw it (the top-left corner).
        //   - paletteOffset: a number added to every pixel's palette index. We
        //     pass 0 here to use the original colors. Bigger numbers can swap to
        //     alternate "team colors" - you will see this trick in a future demo.
        BT.drawSprite(this.spriteSheet, this.spriteRect, drawPos, 0);

        // On-canvas hint drawn with the shared UI kit. ui.begin()/ui.end() open and close
        // a small group of UI rows; with no ui.panel() call the group is just floating
        // text with no box around it. 'topLeft' anchors it to the top-left corner, and
        // { color: 'dim' } picks the kit's muted gray so the hint stays out of the way.
        // (Under the hood the kit prints with the same built-in 6x14 system font.)
        // "~" is the Backquote key (usually under Esc, left of the 1 key).
        ui.begin('topLeft');
        ui.label('Press ~ or click/tap the symbol below', { color: 'dim' });
        ui.label('to toggle the overlay', { color: 'dim' });
        ui.end();

        // Live stats (position, bounce count) come from overlayRows() in the engine HUD.
        // The overlay also shows FPS, backend, and this demo's page title - we do not
        // duplicate those strings here.
    }
}

// bootstrap() is the function that starts everything. You pass it your Demo
// class, and it takes care of:
//   1. Setting up the HTML canvas on the page
//   2. Picking a backend: WebGPU when the browser supports it, otherwise Canvas 2D software mode (see README)
//   3. Creating a new instance of your Demo class
//   4. Calling configure() when you define it, then init(), then the update/render loop
//
// After this line runs, your demo is alive and running!
bootstrap(Demo);
