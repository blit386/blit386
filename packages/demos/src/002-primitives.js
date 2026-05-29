// Primitives Demo - shows all the basic shapes you can draw with Blit-Tech.
//
// Demo 002 in the Blit-Tech demo series.
// Prerequisites: 001-Basics - https://vancura.dev/articles/blit-tech-basics
// Live version: https://vancura.dev/articles/blit-tech-primitives
//
// "Primitives" means the simplest building blocks of drawing:
// pixels (single dots), lines, rectangles, and filled rectangles.
// This demo shows each one with a live animation so you can see them in action.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Every color used for drawing is pre-registered in a numbered palette slot.
// Think of each slot like a labeled jar of paint on an art shelf.
// Index 0 is always transparent (invisible). Custom colors start at 1.
const C_WHITE = 1; // Pure white: title text, the spinning line
const C_BG = 2; // Dark blue-gray: background and the clearRect erase color
const C_AMBER = 3; // Amber (orange-yellow): section header labels
const C_RED = 4; // Red: first rectangle in each row
const C_GREEN_SHAPE = 5; // Green: second rectangle in each row
const C_BLUE_SHAPE = 6; // Blue: third rectangle in each row
const C_YELLOW = 7; // Yellow: the pulsing and sliding rectangles
const C_CYAN = 8; // Cyan (bright blue-green): sine wave graph line
const C_GRAY_BORDER = 9; // Gray: the graph outline border
const C_DARK = 10; // Very dark blue: graph background fill
const C_DIM = 11; // Dim gray: FPS and tick counter text
const C_STEEL = 12; // Steel blue: background squares in the clearRect grid

// Dynamic palette slots for the rainbow pixel animation.
// Each of the 50 animated pixels needs its own slot so they can all be different colors.
// update() will compute and store each pixel's current color in slots 20..69 every tick.
// render() then simply passes the slot number to BT.drawPixel() - no Color32 needed there!
const C_PIXEL_BASE = 20; // slot for pixel 0 = 20, pixel 1 = 21, ... pixel 49 = 69

// #endregion

// #region Main Logic

/**
 * Demonstrates all primitive drawing operations with animated examples.
 * Each section shows a different drawing function in action with real-time animation.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // animTicks counts how many update ticks have passed since the demo started.
    // We use it to make things move and change over time.
    animTicks = 0;

    // palette holds all the colors this demo uses.
    palette = null;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Optional engine settings. We keep the default 320x240 screen and show the full
     * 256-slot palette in the overlay grid with 32 swatches per row.
     *
     * @returns {{ overlayPaletteView: boolean, overlayPaletteColumns: number, overlayStyle: { barPaletteIndex: number, textPaletteIndex: number } }}
     */
    configure() {
        return {
            overlayPaletteView: true,
            overlayStyle: {
                barPaletteIndex: 1,
                textPaletteIndex: 2,
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
        this.palette.set(C_BG, new Color32(20, 30, 50)); // dark blue-gray background
        this.palette.set(C_AMBER, new Color32(255, 200, 100)); // amber for section headers
        this.palette.set(C_RED, new Color32(255, 100, 100)); // red shapes
        this.palette.set(C_GREEN_SHAPE, new Color32(100, 255, 100)); // green shapes
        this.palette.set(C_BLUE_SHAPE, new Color32(100, 100, 255)); // blue shapes
        this.palette.set(C_YELLOW, new Color32(255, 255, 100)); // yellow pulsing/sliding shapes
        this.palette.set(C_CYAN, new Color32(100, 255, 255)); // cyan sine wave line
        this.palette.set(C_GRAY_BORDER, new Color32(100, 100, 100)); // graph border gray
        this.palette.set(C_DARK, new Color32(10, 15, 25)); // very dark background for graph area
        this.palette.set(C_DIM, new Color32(150, 150, 150)); // dim gray for FPS counter
        this.palette.set(C_STEEL, new Color32(100, 150, 200)); // steel blue clearRect grid squares

        // Pre-fill the 50 rainbow pixel slots with a placeholder color so no slot is empty
        // on the very first frame (before update() has run for the first time).
        for (let i = 0; i < 50; i++) {
            this.palette.set(C_PIXEL_BASE + i, new Color32(128, 128, 128)); // start as gray
        }

        // Tell the engine "use this palette from now on."
        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Runs at a fixed rate (60 times per second). See the Basics demo for the full explanation:
     * https://vancura.dev/articles/blit-tech-basics
     * We count ticks AND pre-compute the rainbow pixel colors here so render() stays fast.
     */
    update() {
        // Add 1 each time update() runs. animTicks counts update ticks, not screen refreshes.
        // After 1 second at 60 update ticks per second, animTicks will be 60.
        this.animTicks++;

        // Pre-compute the rainbow pixel colors
        // Each of the 50 animated pixels gets a different hue, and the whole rainbow
        // rotates forward by animTicks so it appears to cycle over time.
        // We compute the color here in update() and store it in the palette so that
        // render() can just say "use slot 20", "use slot 21", etc.
        // This keeps ALL color math out of render() - the "palette animation" technique.
        for (let i = 0; i < 50; i++) {
            // hue is a position on the color wheel (0 = red, 120 = green, 240 = blue, 360 = back to red).
            // We spread 50 pixels evenly by multiplying i by 17 (about 1/50 of 360).
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
        this.renderPixelDemo();
        this.renderLineDemo();
        this.renderRectOutlineDemo();
        this.renderRectFillDemo();
        this.renderClearRectDemo();
        this.renderCombinedDemo();
    }

    // #endregion

    // #region Rendering Helpers

    /**
     * Shows how BT.drawPixel() works - it draws a single colored dot.
     * We draw 50 dots in a pattern, each with a different rainbow color.
     * The colors shift over time because update() rotates them each tick.
     */
    renderPixelDemo() {
        // Print the section label in amber (orange-yellow) color.
        BT.systemPrint(new Vector2i(10, 30), C_AMBER, 'Pixels:');

        // Draw 50 pixels scattered across a small area.
        // The colors were already computed in update() and stored in palette slots 20..69.
        // Here we just pass the slot index number - no Color32 math needed in render()!
        for (let i = 0; i < 50; i++) {
            // Use a formula to spread the pixels out so they don't all overlap.
            // Multiplying by 13 and 7 spreads them without an obvious pattern.
            const x = 10 + ((i * 13) % 60);
            const y = 45 + ((i * 7) % 20);

            // C_PIXEL_BASE + i is the palette slot for pixel i (slot 20, 21, ..., 69).
            BT.drawPixel(new Vector2i(x, y), C_PIXEL_BASE + i);
        }
    }

    /**
     * Shows how BT.drawLine() works - it draws a straight line between two points.
     * We show three static lines (horizontal, vertical, diagonal) plus one that spins.
     */
    renderLineDemo() {
        BT.systemPrint(new Vector2i(10, 75), C_AMBER, 'Lines:');

        // A horizontal line goes straight left-to-right. Color: red.
        BT.drawLine(new Vector2i(10, 90), new Vector2i(70, 90), C_RED);

        // A vertical line goes straight up-and-down. Color: green.
        BT.drawLine(new Vector2i(20, 95), new Vector2i(20, 115), C_GREEN_SHAPE);

        // A diagonal line goes from top-left to bottom-right. Color: blue.
        BT.drawLine(new Vector2i(30, 95), new Vector2i(60, 115), C_BLUE_SHAPE);

        // A spinning line that rotates from the center point.
        // Math.PI * 2 is a full circle in radians. We divide by 180 to convert
        // from degrees (which are easier to think about) to radians (what Math uses).
        const angle = (this.animTicks * 2 * Math.PI) / 180;

        // The center of the spinning line.
        const centerX = 50;
        const centerY = 105;
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
    renderRectOutlineDemo() {
        BT.systemPrint(new Vector2i(90, 30), C_AMBER, 'Rect Outlines:');

        // Three rectangles with different colors. Rect2i takes (x, y, width, height).
        BT.drawRect(new Rect2i(90, 45, 40, 25), C_RED); // Red outline.
        BT.drawRect(new Rect2i(140, 45, 30, 30), C_GREEN_SHAPE); // Green outline.
        BT.drawRect(new Rect2i(180, 45, 25, 35), C_BLUE_SHAPE); // Blue outline.

        // A yellow rectangle that pulses - it grows and shrinks over time.
        // Math.sin goes smoothly between -1 and +1, so adding 10 to 5*sin gives
        // a size that oscillates between 5 and 15. Math.floor rounds to whole pixels.
        const pulse = Math.floor(10 + Math.sin(this.animTicks * 0.1) * 5);

        // Draw a square using pulse as both the width and height.
        // We multiply by 2 so the pulsing is more visible.
        BT.drawRect(new Rect2i(220, 45, pulse * 2, pulse * 2), C_YELLOW);
    }

    /**
     * Shows how BT.drawRectFill() works - it fills a rectangle with solid color.
     * Same as the outline demo but these rectangles are filled in.
     */
    renderRectFillDemo() {
        BT.systemPrint(new Vector2i(90, 90), C_AMBER, 'Rect Fills:');

        // Three filled rectangles in different colors.
        BT.drawRectFill(new Rect2i(90, 105, 40, 25), C_RED); // Red fill.
        BT.drawRectFill(new Rect2i(140, 105, 30, 30), C_GREEN_SHAPE); // Green fill.
        BT.drawRectFill(new Rect2i(180, 105, 25, 35), C_BLUE_SHAPE); // Blue fill.

        // A yellow square that slides back and forth.
        // Math.sin oscillates between -1 and 1. Multiplying by 20 makes it slide
        // 20 pixels left and right from the starting position (220).
        const slideX = 220 + Math.floor(Math.sin(this.animTicks * 0.05) * 20);

        BT.drawRectFill(new Rect2i(slideX, 105, 20, 20), C_YELLOW);
    }

    /**
     * Shows how BT.clearRect() works - it erases a rectangle back to a specific color.
     * We first draw a grid of blue squares, then erase a moving rectangular chunk.
     * The erased area reveals the background color underneath.
     *
     * IMPORTANT NOTE: clearRect(rect, paletteIndex) takes the RECTANGLE first, then
     * the color index. The order is different from drawRect(rect, index) - clearRect
     * is special because it "paints over" the existing content with a solid color.
     */
    renderClearRectDemo() {
        BT.systemPrint(new Vector2i(10, 135), C_AMBER, 'Clear Rect:');

        // Draw a background grid of steel-blue squares.
        // The outer loop goes across (i = 0 to 9), the inner loop goes down (j = 0 to 4).
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 5; j++) {
                // Each square is 8x8 pixels with a 2-pixel gap (placed every 10 pixels).
                BT.drawRectFill(new Rect2i(10 + i * 10, 150 + j * 10, 8, 8), C_STEEL);
            }
        }

        // Calculate a moving X position for the clear area.
        // It slides between 15 and 45 (oscillating around 30).
        const clearX = 30 + Math.floor(Math.sin(this.animTicks * 0.03) * 15);

        // Erase a 40x30 rectangle back to the background color.
        // This makes it look like a window is moving across the grid.
        // Note: clearRect takes (rectangle, paletteIndex) - rectangle FIRST, then index.
        // This is different from the old API which put the color first!
        BT.clearRect(new Rect2i(clearX, 160, 40, 30), C_BG);
    }

    /**
     * Shows multiple primitives working together to draw a sine wave graph.
     * A filled rectangle for the background, an outline for the border,
     * and lines that trace a wave across the graph.
     */
    renderCombinedDemo() {
        BT.systemPrint(new Vector2i(120, 150), C_AMBER, 'Combined:');

        // The graph's position and size on screen.
        const graphX = 120;
        const graphY = 170;
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

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to the Blit-Tech engine to start running it.
bootstrap(Demo);

// #endregion
