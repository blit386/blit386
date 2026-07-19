// Demo 013 - Image Output: demonstrates BT.downloadFrame().
//
// BT.downloadFrame() takes a screenshot of whatever is currently on screen and saves
// it as a PNG image file to your computer. Click or tap the "Save PNG" button from the
// shared UI kit (or press Space) to download the current frame - so the demo works on
// touch screens too. Note: the kit panel is drawn on screen, so it appears in the
// saved PNG as well. That is fine for this demo - see the comment in render().
//
// Prerequisites: 001-Basics (https://demos.blit386.dev/001-basics).
// Live article: https://vancura.dev/articles/blit386-image-output

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Every color used for drawing is stored in a numbered "palette" slot.
// Think of each slot like a labeled paint jar on an artist's shelf.
// Index 0 is always transparent (invisible). Our custom colors start at 1.
// These are the SCENE colors - the test pattern itself. All the UI text and the
// Save button draw with the shared UI theme instead (installed by applyTheme() in init()).
const C_WHITE = 1; // White: grid dots, border, and crosshairs
const C_BG = 2; // Very dark blue-gray: the background color

// Dynamic slots: these six colors change every frame to create the animated rainbow stripes.
// We pre-allocate (reserve) index slots 10 through 15, one for each horizontal stripe.
// In update() we calculate the new color and store it here; render() just uses the index.
// This is called "palette animation" - the retro trick that made old consoles look alive!
const C_STRIPE_0 = 10; // Animated color for the top stripe (stripe 0)
// Stripes 1-5 follow at C_STRIPE_0 + 1 through C_STRIPE_0 + 5

/**
 * Image output demo.
 * Draws a colorful test pattern and saves the frame to PNG when the kit's
 * "Save PNG" button is clicked, tapped, or triggered with the Space key.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // palette holds the list of colors the engine uses for drawing.
    /** @type {Palette | null} */
    palette = null;

    // tick counts how many update steps have run since the demo started (goes up by 1 each update).
    // We use it to animate the gradient stripes and to show a frame number in the panel.
    tick = 0;

    // capturing is true while we are waiting for BT.downloadFrame() to finish saving the file.
    // We use it so you cannot trigger two saves at once and to show "Capturing..." on screen.
    capturing = false;

    // lastCaptureMessage holds the text we show after a save succeeds or fails (for example the file name or an error).
    lastCaptureMessage = '';

    // lastCaptureColor remembers which UI color role to draw that message with:
    // 'accent' (green) for a successful save, 'warm' (orange) for an error.
    lastCaptureColor = 'accent';

    // messageTimer counts down how many more frames to show lastCaptureMessage before hiding it.
    // 180 frames is 3 seconds at 60 FPS, then the message disappears.
    messageTimer = 0;

    /**
     * Hides the overlay toggle hint so saved screenshots stay clean.
     *
     * @returns {Partial<HardwareSettings>} Demo hardware settings.
     */
    configure() {
        return {
            // The engine usually draws a small "~" hint in the bottom-left corner to
            // tell people they can press the Backquote key (`) to open the stats
            // overlay. This demo's whole point is saving a picture with
            // BT.downloadFrame(), and the overlay is drawn on top of everything, so
            // that hint would end up baked into the saved PNG. We hide the hint to keep
            // captures tidy. (The kit's Save panel DOES appear in the capture - a
            // deliberate trade-off so touch users can save at all; see render().)
            // The overlay still works on demand: press ` to show it and ` again to
            // hide it before you capture. The bottom-left 17x13 corner also stays
            // tappable to toggle it, which is why our UI panel sits in the top-right.
            isOverlayToggleHintVisible: false,
        };
    }

    /**
     * Sets up the color palette and installs the shared UI theme colors.
     * The Save button itself is declared every frame in render().
     *
     * @returns {Promise<boolean>} Resolves to `true` when the demo is ready to run.
     */
    async init() {
        // Step 1: build the color palette
        // Create a palette with room for 256 colors. 256 is a classic retro amount.
        this.palette = BT.paletteCreate(256);

        // Store the static scene colors we always need.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(20, 20, 30)); // very dark blue-gray background

        // Pre-fill the six animated stripe slots with a starting color (dark gray).
        // They will be updated properly in update() on the very first tick.
        // Filling them now prevents any "empty slot" glitches on the first frame.
        for (let i = 0; i < 6; i++) {
            this.palette.set(C_STRIPE_0 + i, new Color32(40, 40, 40));
        }

        // Step 2: install the shared UI theme. applyTheme() writes the twelve UI kit
        // colors into high palette slots (240-251 by default), far above our scene
        // slots 1-15. Every kit widget (the panel, button, labels) draws with these
        // colors automatically - this demo never needs the slot numbers itself, so
        // we call applyTheme() only for that side effect and ignore its return value.
        applyTheme(this.palette);

        // Tell the engine "use this palette from now on."
        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Advances the demo clock, expires transient status messages, and updates
     * the animated stripe colors in the palette.
     * Runs at a fixed rate (60 times per second).
     */
    update() {
        // Let the UI kit do its per-tick housekeeping first: it latches keyboard
        // shortcuts (like the Save button's Space binding) and tracks touch contacts.
        // This must be the first line of update() so nothing misses a key press.
        ui.tick();

        // Bump the frame counter so animations and the on-screen "FRAME" row keep changing.
        this.tick++;

        // If we are showing a success or error message, count down until it should disappear.
        if (this.messageTimer > 0) {
            this.messageTimer--;
        }

        // Palette animation for the six horizontal stripes
        // Instead of computing colors inside render(), we compute them here in update()
        // and store the results in reserved palette slots. render() then just uses the index numbers.
        // This is the classic "palette animation" technique - retro hardware did the same thing!
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
            // render() will read C_STRIPE_0 + i to draw each stripe - no Color32 needed there!
            this.palette.set(C_STRIPE_0 + i, new Color32(r, g, b));
        }
    }

    /**
     * Renders the animated gradient test pattern and the UI kit panel with the
     * Save button and capture status. Runs once per screen refresh.
     */
    render() {
        // Ask the engine how wide and tall our virtual screen is in pixels.
        const screen = BT.displaySize;

        // Fill the whole framebuffer with the dark background before drawing anything else.
        // C_BG is just a number (2); the palette knows it means dark blue-gray.
        BT.clear(C_BG);

        // Draw six horizontal stripes using the animated palette slots we updated in update().
        // Each stripe's color was already computed and stored - we just reference the index.
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

        // UI kit panel in the top-right corner. We put it there (not bottom-left)
        // because the engine keeps the bottom-left 17x13 corner tappable for toggling
        // the stats overlay, and we do not want the two to fight over taps.
        // Note: this panel is drawn onto the frame, so it WILL be part of the saved
        // PNG. That is acceptable here - it even doubles as a caption telling you
        // which demo produced the screenshot.
        ui.begin('topRight');
        ui.panel('Image Output');

        // The Save button. ui.button() returns true only on the single frame it was
        // clicked, tapped, or its bound key (Space) was pressed - so holding Space
        // does not spam downloads. We also ignore it while a save is already running.
        if (ui.button('Save PNG (Space)', { key: 'Space' }) && !this.capturing) {
            this.saveFrame();
        }

        // One status row below the button. We always draw a row (even when idle) so
        // the panel does not jump in size when a message appears or disappears.
        if (this.capturing) {
            // A save is in flight - the browser is busy reading the canvas.
            ui.label('Capturing...', { color: 'info' });
        } else if (this.messageTimer > 0) {
            // A save just finished - show the result in green (success) or orange (error).
            ui.label(this.lastCaptureMessage, { color: this.lastCaptureColor });
        } else {
            // Nothing happening - a quiet hint in dim gray.
            ui.label('Saves the current frame', { color: 'dim' });
        }

        // Frame counter so you can tell consecutive screenshots apart.
        ui.kv('FRAME', this.tick);
        ui.end();
    }

    /**
     * Starts an asynchronous PNG download of the current frame and remembers
     * the outcome so render() can show a status message for a few seconds.
     */
    saveFrame() {
        // Mark the save as "in flight" so the button ignores further presses
        // and render() shows the "Capturing..." status row.
        this.capturing = true;

        // BT.downloadFrame() reads the canvas and asks the browser to save a file.
        // Most browsers open a "Save as" dialog or drop the file straight into your
        // Downloads folder (depends on your browser settings). The demo cannot pick
        // the folder for you - that is normal browser security.
        BT.downloadFrame('blit386-capture.png')
            .then(() => {
                // Success: remember a friendly message and show it in green.
                this.lastCaptureMessage = 'Saved: blit386-capture.png';
                this.lastCaptureColor = 'accent';
                this.messageTimer = 180; // 3 seconds at 60 FPS
                this.capturing = false;
                return null;
            })
            .catch((err) => {
                // Failure: show the error in orange and log details for developers.
                this.lastCaptureMessage = `Error: ${err.message}`;
                this.lastCaptureColor = 'warm';
                this.messageTimer = 180;
                this.capturing = false;
                console.error('[Demo] Capture failed:', err);
            });
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
