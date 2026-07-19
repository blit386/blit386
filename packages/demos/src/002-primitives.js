/**
 * Primitives Demo - shows all the basic shapes you can draw with BLIT386.
 *
 * Demo 002 in the BLIT386 demo series.
 * Prerequisites: 001-Basics - https://demos.blit386.dev/001-basics
 * Live version: https://demos.blit386.dev/002-primitives
 *
 * "Primitives" means the simplest building blocks of drawing:
 * pixels (single dots), lines, rectangles, and filled rectangles.
 * This demo shows each one with a live animation so you can see them in action.
 *
 * update() advances animTicks (logical time). render() reads animTicks to spin and slide shapes.
 * FPS and tick stats appear in the engine overlay automatically - this file does not draw them.
 * The amber section captions are drawn with the shared UI kit (src/shared/ui.js), so they
 * look the same as the text in every other demo of the series.
 */

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

// The shared demo UI kit: applyTheme() installs the series' standard UI colors into the
// palette, and ui.caption() prints the section captions with them. We met the kit in the
// Basics demo: https://demos.blit386.dev/001-basics
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Every color used for drawing is pre-registered in a numbered palette slot.
// Think of each slot like a labeled jar of paint on an art shelf.
// Index 0 is always transparent (invisible). Custom colors start at 1.
// (Slot 3 is intentionally skipped: it used to hold the caption amber, but the
// captions now come from the shared UI theme in slots 240-251 instead.)
const C_WHITE = 1; // Pure white: the spinning line and the overlay bar
const C_BG = 2; // Dark blue-gray: background and the clearRect erase color
const C_RED = 4; // Red: first rectangle in each row
const C_GREEN = 5; // Green: second rectangle in each row
const C_BLUE = 6; // Blue: third rectangle in each row
const C_YELLOW = 7; // Yellow: the pulsing and sliding rectangles
const C_CYAN = 8; // Cyan (bright blue-green): sine wave graph line
const C_GRAY_BORDER = 9; // Gray: the graph outline border
const C_DARK = 10; // Very dark blue: graph background fill
const C_STEEL = 11; // Steel blue: background squares in the clearRect grid

// Dynamic palette slots for the rainbow pixel animation.
// Each animated pixel needs its own slot so they can all be different colors.
// update() will compute and store each pixel's current color in slots 20..69 every tick.
// render() then simply passes the slot number to BT.drawPixel() - no Color32 needed there!
const C_PIXEL_BASE = 20; // slot for pixel 0 = 20, pixel 1 = 21, ... last pixel = 20 + PIXEL_COUNT - 1

// How many rainbow pixels renderPixel() draws. init(), update(), and renderPixel() all loop
// over this same count, so it lives in one place instead of three repeated "50"s.
const PIXEL_COUNT = 50;

/**
 * Demonstrates all primitive drawing operations with animated examples.
 * Each section shows a different drawing function in action with real-time animation.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // animTicks counts how many update ticks have passed since the demo started.
    // We use it to make things move and change over time.
    animTicks = 0;

    // palette holds all the colors this demo uses.
    /** @type {Palette | null} */
    palette = null;

    // theme remembers which palette slots the shared UI kit colors landed in.
    // applyTheme() in init() fills it with a map like { bg, text, dim, header, ... }.
    theme = null;

    /**
     * Optional engine settings. We keep the default 320x240 screen and show the
     * palette grid in the overlay with 24 swatches per row and 3 visible rows.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayPaletteEnabled: true,
            overlayPaletteColumns: 24,
            overlayPaletteRowsVisible: 3,
            isOverlayVisibleAtStart: true,

            overlayStyle: {
                barPaletteIndex: C_WHITE,
                textPaletteIndex: C_DARK,
                gapPaletteIndex: C_BG,
            },
        };
    }

    /**
     * Runs once when the demo starts. Sets up the palette.
     *
     * @returns {Promise<boolean>} Returns true when everything is ready.
     */
    async init() {
        // Set up the color palette
        // We pick all the colors we need BEFORE drawing anything - like an artist
        // squeezing paint onto a palette before picking up the brush.
        this.palette = BT.paletteCreate(256);

        // Static colors (these never change from frame to frame).
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(40, 50, 80)); // dark blue-gray background
        this.palette.set(C_RED, new Color32(255, 100, 100)); // red shapes
        this.palette.set(C_GREEN, new Color32(100, 255, 100)); // green shapes
        this.palette.set(C_BLUE, new Color32(100, 100, 255)); // blue shapes
        this.palette.set(C_YELLOW, new Color32(255, 255, 100)); // yellow pulsing/sliding shapes
        this.palette.set(C_CYAN, new Color32(100, 255, 255)); // cyan sine wave line
        this.palette.set(C_GRAY_BORDER, new Color32(100, 100, 100)); // graph border gray
        this.palette.set(C_DARK, new Color32(10, 15, 25)); // very dark background for graph area
        this.palette.set(C_STEEL, new Color32(100, 150, 200)); // steel blue clearRect grid squares

        // Pre-fill the rainbow pixel slots with a placeholder color so no slot is empty
        // on the very first frame (before update() has run for the first time).
        for (let i = 0; i < PIXEL_COUNT; i++) {
            this.palette.set(C_PIXEL_BASE + i, new Color32(128, 128, 128)); // start as gray
        }

        // Install the shared UI theme. It writes the series' twelve standard UI colors
        // into high palette slots (240-251), far away from our scene slots (1-11) and the
        // animated rainbow slots (20-69). The section captions draw with these colors.
        // This must happen BEFORE BT.paletteSet() below so the colors are included.
        this.theme = applyTheme(this.palette);

        // Tell the engine "use this palette from now on."
        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Runs at a fixed rate (60 times per second). See the Basics demo for the full explanation:
     * https://demos.blit386.dev/001-basics
     * We count ticks AND pre-compute the rainbow pixel colors here so render() stays fast.
     */
    update() {
        // Add 1 each time update() runs. animTicks counts update ticks, not screen refreshes.
        // After 1 second at 60 update ticks per second, animTicks will be 60.
        this.animTicks++;

        // Pre-compute the rainbow pixel colors
        // Each animated pixel gets a different hue, and the whole rainbow
        // rotates forward by animTicks so it appears to cycle over time.
        // We compute the color here in update() and store it in the palette so that
        // render() can just say "use slot 20", "use slot 21", etc.
        // This keeps ALL color math out of render() - the "palette animation" technique.
        for (let i = 0; i < PIXEL_COUNT; i++) {
            // hue is a position on the color wheel (0 = red, 120 = green, 240 = blue, 360 = back to red).
            // We spread the pixels evenly by multiplying i by 17 (about 1/PIXEL_COUNT of 360).
            // Adding animTicks makes the whole rainbow rotate forward each tick.
            // The % 360 keeps the value inside 0-359 (it wraps around like a clock).
            const hue = (i * 17 + this.animTicks) % 360;

            // Color32.fromHSL(hue, saturation, lightness) converts the hue to an RGB color.
            // Saturation=100 means fully vivid, Lightness=50 means a medium brightness.
            const color = Color32.fromHSL(hue, 100, 50);

            // Store this pixel's current color in its reserved palette slot.
            this.palette.set(C_PIXEL_BASE + i, color);
        }
    }

    /**
     * Runs once per screen refresh to draw everything on screen.
     * Each helper method draws one type of primitive in its own section.
     */
    render() {
        // Fill the whole screen with the dark background to start fresh each frame.
        BT.clear(C_BG);

        // Draw each type of primitive in its own area of the screen.
        this.renderPixel();
        this.renderLine();
        this.renderRectOutline();
        this.renderRectFill();
        this.renderClearRect();
        this.renderCombined();
    }

    /**
     * Shows how BT.drawPixel() works - it draws a single colored dot.
     * We draw a scattered pattern of dots, each with a different rainbow color.
     * The colors shift over time because update() rotates them each tick.
     */
    renderPixel() {
        const anchor = new Vector2i(10, 7);

        // Print the section caption with ui.caption() from the shared UI kit. Every demo
        // in the series uses this same widget, so all captions look identical everywhere.
        ui.caption(anchor.x, anchor.y, 'Pixels');

        // Draw the pixels scattered across a small area.
        // The colors were already computed in update() and stored in palette slots 20..69.
        // Here we just pass the slot index number - no Color32 math needed in render()!
        for (let i = 0; i < PIXEL_COUNT; i++) {
            // Use a formula to spread the pixels out so they don't all overlap.
            // Multiplying by 13 and 7 spreads them without an obvious pattern.
            const x = anchor.x + ((i * 13) % 60);
            const y = anchor.y + ((i * 7) % 20) + 15;
            const pos = new Vector2i(x, y);

            // C_PIXEL_BASE + i is the palette slot for pixel i (slot 20, 21, ..., 69).
            BT.drawPixel(pos, C_PIXEL_BASE + i);
        }
    }

    /**
     * Shows how BT.drawLine() works - it draws a straight line between two points.
     * We show three static lines (horizontal, vertical, diagonal) plus one that spins.
     */
    renderLine() {
        const anchor = new Vector2i(10, 75);

        ui.caption(anchor.x, anchor.y, 'Lines');

        // A horizontal line goes straight left-to-right. Color: red.
        BT.drawLine(new Vector2i(anchor.x, anchor.y + 15), new Vector2i(anchor.x + 60, anchor.y + 15), C_RED);

        // A vertical line goes straight up-and-down. Color: green.
        BT.drawLine(new Vector2i(anchor.x + 10, anchor.y + 20), new Vector2i(anchor.x + 10, anchor.y + 40), C_GREEN);

        // A diagonal line goes from top-left to bottom-right. Color: blue.
        BT.drawLine(new Vector2i(anchor.x + 20, anchor.y + 20), new Vector2i(anchor.x + 50, anchor.y + 40), C_BLUE);

        // A spinning line that rotates from the center point.
        // Math.PI * 2 is a full circle in radians. We divide by 180 to convert
        // from degrees (which are easier to think about) to radians (what Math uses).
        const angle = (this.animTicks * 2 * Math.PI) / 180;

        // The center of the spinning line.
        const centerX = anchor.x + 40;
        const centerY = anchor.y + 30;
        const radius = 15;

        // Math.cos and Math.sin convert an angle into X and Y distances.
        // Adding them to centerX/Y gives us the end point of the line.
        const endX = centerX + Math.cos(angle) * radius;
        const endY = centerY + Math.sin(angle) * radius;

        // Draw the spinning white line from center to the calculated end point.
        // Math.floor rounds the floating-point result down to a whole pixel number.
        BT.drawLine(new Vector2i(centerX, centerY), new Vector2i(Math.floor(endX), Math.floor(endY)), C_WHITE);
    }

    /**
     * Shows how BT.drawRect() works - it draws just the border of a rectangle (hollow).
     * We draw three static rectangles in different colors plus one that pulses in size.
     */
    renderRectOutline() {
        const anchor = new Vector2i(90, 30);

        ui.caption(anchor.x, anchor.y, 'Rect Outlines');

        // Three rectangles with different colors. Rect2i takes (x, y, width, height).
        BT.drawRect(new Rect2i(anchor.x, anchor.y + 15, 40, 25), C_RED); // Red outline.
        BT.drawRect(new Rect2i(anchor.x + 50, anchor.y + 15, 30, 30), C_GREEN); // Green outline.
        BT.drawRect(new Rect2i(anchor.x + 90, anchor.y + 15, 25, 35), C_BLUE); // Blue outline.

        // A yellow rectangle that pulses - it grows and shrinks over time.
        // Math.sin goes smoothly between -1 and +1, so adding 10 to 5*sin gives
        // a size that oscillates between 5 and 15. Math.floor rounds to whole pixels.
        const pulse = Math.floor(10 + Math.sin(this.animTicks * 0.1) * 5);

        // Draw a square using pulse as both the width and height.
        // We multiply by 2 so the pulsing is more visible.
        BT.drawRect(new Rect2i(anchor.x + 130, anchor.y + 15, pulse * 2, pulse * 2), C_YELLOW);
    }

    /**
     * Shows how BT.drawRectFill() works - it fills a rectangle with solid color.
     * Same as the outline demo but these rectangles are filled in.
     */
    renderRectFill() {
        const anchor = new Vector2i(90, 90);

        ui.caption(anchor.x, anchor.y, 'Rect Fills');

        // Three filled rectangles in different colors.
        BT.drawRectFill(new Rect2i(anchor.x, anchor.y + 15, 40, 25), C_RED); // Red fill.
        BT.drawRectFill(new Rect2i(anchor.x + 50, anchor.y + 15, 30, 30), C_GREEN); // Green fill.
        BT.drawRectFill(new Rect2i(anchor.x + 90, anchor.y + 15, 25, 35), C_BLUE); // Blue fill.

        // A yellow square that slides back and forth.
        // Math.sin oscillates between -1 and 1. Multiplying by 20 makes it slide
        // 20 pixels left and right from the starting position (anchor.x + 130).
        const slideX = anchor.x + 130 + Math.floor(Math.sin(this.animTicks * 0.05) * 20);

        BT.drawRectFill(new Rect2i(slideX, anchor.y + 15, 20, 20), C_YELLOW);
    }

    /**
     * Shows how BT.clearRect() works - it erases a rectangle back to a specific color.
     * We first draw a grid of blue squares, then erase a moving rectangular chunk.
     * The erased area reveals the background color underneath. Like drawRect(), it takes
     * the rectangle first and the color index second - it just "paints over" instead of
     * drawing an outline or fill.
     */
    renderClearRect() {
        const anchor = new Vector2i(10, 135);

        ui.caption(anchor.x, anchor.y, 'Clear Rect');

        // Draw a background grid of steel-blue squares.
        // The outer loop goes across (i = 0 to 9), the inner loop goes down (j = 0 to 4).
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 5; j++) {
                // Each square is 8x8 pixels with a 2-pixel gap (placed every 10 pixels).
                BT.drawRectFill(new Rect2i(anchor.x + i * 10, anchor.y + 15 + j * 10, 8, 8), C_STEEL);
            }
        }

        // Calculate a moving X position for the clear area.
        // It slides between anchor.x + 5 and anchor.x + 35 (oscillating around anchor.x + 20).
        const clearX = anchor.x + 20 + Math.floor(Math.sin(this.animTicks * 0.03) * 15);

        // Erase a 40x30 rectangle back to the background color.
        // This makes it look like a window is moving across the grid.
        BT.clearRect(new Rect2i(clearX, anchor.y + 25, 40, 30), C_BG);
    }

    /**
     * Shows multiple primitives working together to draw a sine wave graph.
     * A filled rectangle for the background, an outline for the border,
     * and lines that trace a wave across the graph.
     */
    renderCombined() {
        const anchor = new Vector2i(130, 165);

        ui.caption(anchor.x, anchor.y, 'Combined');

        // The graph's position and size on screen (offset from the section anchor).
        const graphX = anchor.x;
        const graphY = anchor.y + 15;
        const graphW = 180;
        const graphH = 50;

        // Fill the graph area with a very dark color so the wave stands out.
        BT.drawRectFill(new Rect2i(graphX, graphY, graphW, graphH), C_DARK);

        // Draw a gray border around the graph.
        BT.drawRect(new Rect2i(graphX, graphY, graphW, graphH), C_GRAY_BORDER);

        // Draw the animated sine wave by connecting small line segments.
        // We go across the graph one pixel at a time and calculate the wave height.
        for (let x = 0; x < graphW - 1; x++) {
            // Math.sin produces a wave. Adding animTicks makes it scroll.
            // Multiplying by 0.1 controls how fast the wave oscillates horizontally.
            // Multiplying by graphH/3 controls how tall the wave is.
            const y1 = Math.floor(graphH / 2 + Math.sin((x + this.animTicks) * 0.1) * (graphH / 3));
            const y2 = Math.floor(graphH / 2 + Math.sin((x + 1 + this.animTicks) * 0.1) * (graphH / 3));

            // Connect the current point to the next point with a cyan line.
            BT.drawLine(new Vector2i(graphX + x, graphY + y1), new Vector2i(graphX + x + 1, graphY + y2), C_CYAN);
        }
    }
}

// Hand the Demo class to the BLIT386 engine to start running it.
bootstrap(Demo);
