// Demo 013 -- Image Output: demonstrates BT.downloadFrame().
//
// BT.downloadFrame() takes a screenshot of whatever is currently on screen and saves
// it as a PNG image file to your computer. Press Space to download the current frame.
//
// Prerequisites: 001-Basics (https://vancura.dev/articles/blit-tech-basics).
// Live article: https://vancura.dev/articles/blit-tech-image-output

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Every color used for drawing is stored in a numbered "palette" slot.
// Think of each slot like a labeled paint jar on an artist's shelf.
// Index 0 is always transparent (invisible). Our custom colors start at 1.
const C_WHITE = 1; // White: grid dots, border, crosshairs, and most text
const C_BG = 2; // Very dark blue-gray: the background color
const C_YELLOW = 3; // Yellow: the "Press SPACE" instruction line
const C_CYAN = 4; // Cyan (bright blue-green): the "Capturing..." status message
const C_GREEN = 5; // Green: the success message after a file saves
const C_GRAY = 6; // Medium gray: the frame counter at the bottom

// Dynamic slots: these six colors change every frame to create the animated rainbow stripes.
// We pre-allocate (reserve) index slots 10 through 15, one for each horizontal stripe.
// In update() we calculate the new color and store it here; render() just uses the index.
// This is called "palette animation" -- the retro trick that made old consoles look alive!
const C_STRIPE_0 = 10; // Animated color for the top stripe (stripe 0)
// Stripes 1-5 follow at C_STRIPE_0 + 1 through C_STRIPE_0 + 5

// #endregion

// #region Main Logic

/**
 * Image output demo.
 * Draws a colorful test pattern and saves the next frame to PNG when Space is pressed.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // palette holds the list of colors the engine uses for drawing.
    palette = null;

    // tick counts how many update steps have run since the demo started (goes up by 1 each update).
    // We use it to animate the gradient stripes and to show a frame number in the corner.
    tick = 0;

    // capturing is true while we are waiting for BT.downloadFrame() to finish saving the file.
    // We use it so you cannot press Space twice at once and to show "Capturing..." on screen.
    capturing = false;

    // lastCaptureMessage holds the text we show after a save succeeds or fails (for example the file name or an error).
    lastCaptureMessage = '';

    // messageTimer counts down how many more frames to show lastCaptureMessage before hiding it.
    // 180 frames is 3 seconds at 60 FPS, then the message disappears.
    messageTimer = 0;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Sets up the palette, loads the bitmap font, and wires the Space key to frame capture.
     *
     * @returns {Promise<boolean>} Resolves to `true` when the demo is ready to run.
     */
    async init() {
        // --- Step 1: build the color palette ---
        // Create a palette with room for 256 colors. 256 is a classic retro amount.
        this.palette = BT.paletteCreate(256);

        // Store the static colors we always need.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(20, 20, 30)); // very dark blue-gray background
        this.palette.set(C_YELLOW, Color32.yellow()); // yellow for the instruction text
        this.palette.set(C_CYAN, Color32.cyan()); // cyan for the "Capturing..." message
        this.palette.set(C_GREEN, Color32.green()); // green for the "Saved" success message
        this.palette.set(C_GRAY, new Color32(128, 128, 128)); // medium gray for the frame counter

        // Pre-fill the six animated stripe slots with a starting color (dark gray).
        // They will be updated properly in update() on the very first tick.
        // Filling them now prevents any "empty slot" glitches on the first frame.
        for (let i = 0; i < 6; i++) {
            this.palette.set(C_STRIPE_0 + i, new Color32(40, 40, 40));
        }

        // Tell the engine "use this palette from now on."
        BT.paletteSet(this.palette);

        // --- Step 2: wire up the Space key ---
        // Listen for keyboard presses anywhere in the window for the whole time the demo runs.
        window.addEventListener('keydown', (e) => {
            // e.code === 'Space' means the physical Space bar was pressed (not just the letter "Space" typed).
            // !this.capturing skips starting a second download while the first one is still in progress.
            if (e.code === 'Space' && !this.capturing) {
                // Mark that a capture is in flight so the UI can show "Capturing..." and block double-presses.
                this.capturing = true;

                // downloadFrame asks the engine to read the GPU frame and trigger a browser download as a PNG file.
                BT.downloadFrame('blit-tech-capture.png')
                    // .then() runs when the download step finished successfully (the file was offered to the user).
                    .then(() => {
                        this.lastCaptureMessage = 'Saved: blit-tech-capture.png';
                        this.messageTimer = 180; // 3 seconds at 60 FPS
                        this.capturing = false;
                        return null;
                    })
                    // .catch() runs if something went wrong (for example WebGPU readback failed).
                    // err is the error object with a .message you can show to the user.
                    .catch((err) => {
                        this.lastCaptureMessage = `Error: ${err.message}`;
                        this.messageTimer = 180;
                        this.capturing = false;
                        console.error('[Demo] Capture failed:', err);
                    });
            }
        });

        return true;
    }

    /**
     * Advances the demo clock, expires transient UI messages, and updates
     * the animated stripe colors in the palette.
     * Runs at a fixed rate (60 times per second).
     */
    update() {
        // Bump the frame counter so animations and the on-screen "Frame: N" label keep changing.
        this.tick++;

        // If we are showing a success or error message, count down until it should disappear.
        if (this.messageTimer > 0) {
            this.messageTimer--;
        }

        // --- Palette animation for the six horizontal stripes ---
        // Instead of computing colors inside render(), we compute them here in update()
        // and store the results in reserved palette slots. render() then just uses the index numbers.
        // This is the classic "palette animation" technique -- retro hardware did the same thing!
        for (let i = 0; i < 6; i++) {
            // phase is an angle-like value 0-359 that moves as tick increases.
            // Each stripe adds i * 20 so neighboring stripes do not look identical.
            // The % 360 keeps the value from growing forever (it wraps back to 0 at 360).
            const phase = (this.tick + i * 20) % 360;

            // Red channel: Math.sin returns a wave between -1 and +1.
            // Multiplying by 127 and adding 127 shifts that to a range of 0 to 254.
            // Math.PI / 180 converts degrees to radians, which is what Math.sin expects.
            const r = Math.floor(127 + 127 * Math.sin((phase * Math.PI) / 180));

            // Green channel: same sine wave but shifted 120 degrees around the color wheel.
            // Shifting each channel separately makes R, G, and B cycle out of step,
            // which creates a rainbow effect as the phase changes.
            const g = Math.floor(127 + 127 * Math.sin(((phase + 120) * Math.PI) / 180));

            // Blue channel: shifted 240 degrees so all three are evenly spaced.
            const b = Math.floor(127 + 127 * Math.sin(((phase + 240) * Math.PI) / 180));

            // Store the computed color in the palette slot for this stripe.
            // render() will read C_STRIPE_0 + i to draw each stripe -- no Color32 needed there!
            this.palette.set(C_STRIPE_0 + i, new Color32(r, g, b));
        }
    }

    /**
     * Renders the animated gradient test pattern and capture status overlay.
     * Runs once per screen refresh.
     */
    render() {
        // Ask the engine how wide and tall our virtual screen is in pixels.
        const screen = BT.displaySize();

        // Fill the whole framebuffer with the dark background before drawing anything else.
        // C_BG is just a number (2); the palette knows it means dark blue-gray.
        BT.clear(C_BG);

        // Draw six horizontal stripes using the animated palette slots we updated in update().
        // Each stripe's color was already computed and stored -- we just reference the index.
        const stripeHeight = 40;

        for (let i = 0; i < 6; i++) {
            // y is the top edge of this stripe in pixels.
            const y = i * stripeHeight;

            // C_STRIPE_0 + i picks the correct palette slot for this stripe (10, 11, 12, ...).
            BT.drawRectFill(new Rect2i(0, y, screen.x, stripeHeight), C_STRIPE_0 + i);
        }

        // Draw a grid of single white pixels every 20 pixels so you can see alignment when you open the PNG.
        for (let x = 0; x < screen.x; x += 20) {
            for (let y = 0; y < screen.y; y += 20) {
                BT.drawPixel(new Vector2i(x, y), C_WHITE);
            }
        }

        // Outline the entire display with a white rectangle so the edges are obvious in the screenshot.
        BT.drawRect(new Rect2i(0, 0, screen.x, screen.y), C_WHITE);

        // Crosshairs at the exact center: cx is half the width, cy is half the height (floored to whole pixels).
        const cx = Math.floor(screen.x / 2);
        const cy = Math.floor(screen.y / 2);

        // Horizontal line through the center (20 pixels left and right of center).
        BT.drawLine(new Vector2i(cx - 20, cy), new Vector2i(cx + 20, cy), C_WHITE);
        // Vertical line through the center (20 pixels up and down from center).
        BT.drawLine(new Vector2i(cx, cy - 20), new Vector2i(cx, cy + 20), C_WHITE);

        // Title and instructions in the top-left. systemPrint takes (position, paletteIndex, text).
        BT.systemPrint(new Vector2i(10, 10), C_WHITE, 'Image Output Demo');
        BT.systemPrint(new Vector2i(10, 26), C_YELLOW, 'Press SPACE to download PNG');

        // Show either a busy message, a result message, or nothing in the third text line.
        if (this.capturing) {
            BT.systemPrint(new Vector2i(10, 42), C_CYAN, 'Capturing...');
        } else if (this.messageTimer > 0) {
            BT.systemPrint(new Vector2i(10, 42), C_GREEN, this.lastCaptureMessage);
        }

        // Frame counter near the bottom so you can tell consecutive screenshots apart.
        BT.systemPrint(new Vector2i(10, screen.y - 20), C_GRAY, `Frame: ${this.tick}`);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
bootstrap(Demo);

// #endregion
