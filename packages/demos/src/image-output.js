// Image Output: demonstrates BT.downloadFrame() and BT.captureFrame().
// @description Capture frames as PNG with BT.downloadFrame and BT.captureFrame, at output or display size.
// @ogScale integer
//
// BT.downloadFrame() takes a screenshot of whatever is currently on screen and saves
// it as a PNG image file to your computer. Click or tap the "Save PNG" button from the
// shared UI kit (or press S) to download the current frame - so the demo works on
// touch screens too. Note: the kit panel is drawn on screen, so it appears in the
// saved PNG as well. That is fine for this demo - see the comment in render().
//
// BT.captureFrame() does the same screenshot but hands you the PNG as a Blob (a
// chunk of file data in memory) instead of saving it. Your game decides what to do
// with it: upload it, show it, keep it. The "Capture Blob" button (key B) captures a
// Blob and this demo reads its size and picture dimensions to show on screen.
//
// Both functions take an options object with a size: 'output' (the default) gives
// the full drawing buffer, 'display' gives exactly one PNG pixel per game pixel.
// The "Size" button (key Z) switches between them. This demo draws into a 320x240
// display on a 640x480 drawing buffer, so the two choices produce different images.
//
// Dev-mode extras, built into the engine itself (every demo gets these for free,
// not just this one): while BT.isDevMode is true (running from `pnpm run dev`, not
// a production build), pressing F9 copies the current frame to the OS clipboard, and
// Shift+F9 saves it as a timestamped file - neither needs a button click first. See
// HardwareSettings.isFrameCaptureShortcutEnabled.
// Note for demos other than this one: both shortcuts save at the logical
// BT.displaySize, not BT.outputSize, so they stay pixel-for-pixel even when a demo
// sets a larger drawingBufferSize for display-tier post-process effects (CRT,
// vignette, and the like) - those effects are not included in either shortcut's
// output. This demo does set a drawingBufferSize (640x480), so its shortcuts
// match the Save PNG button only while the Size button is on 'display'.
// The engine also exposes the whole BT namespace as window.BT in dev mode
// (BootstrapOptions.exposeGlobal, on by default), so you can run
// window.BT.downloadFrame('my-file.png') straight from the browser console at any time.
//
// Prerequisites: Basics (https://demos.blit386.dev/basics).
// Guide: https://blit386.dev/docs/api/rendering#frame-capture

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

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

// The two capture sizes the engine understands (the FrameCaptureSize type).
// We keep them in named constants so a typo cannot silently pick the wrong one.
const SIZE_OUTPUT = 'output'; // the whole drawing buffer, including display effects
const SIZE_DISPLAY = 'display'; // exact game pixels, one PNG pixel per game pixel

/**
 * Image output demo.
 * Draws a colorful test pattern and saves the frame to PNG when the kit's
 * "Save PNG" button is clicked, tapped, or triggered with the S key.
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

    // captureSize is the size option we pass to BT.downloadFrame() and BT.captureFrame().
    // 'output' means the full drawing buffer (640x480 here); 'display' means one PNG
    // pixel per game pixel (320x240 here). The Size button switches between them.
    captureSize = SIZE_OUTPUT;

    // messageTimer counts down how many more frames to show lastCaptureMessage before hiding it.
    // 180 frames is 3 seconds at 60 FPS, then the message disappears.
    messageTimer = 0;

    /**
     * Hides the overlay toggle hint so saved screenshots stay clean, and sets a
     * 320x240 display on a 640x480 drawing buffer so the two capture sizes differ.
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
            // tappable to toggle it, which is why our UI panel avoids that corner
            // (it sits in the top-left instead).
            isOverlayToggleHintVisible: false,

            // Most demos leave displaySize unset and let the engine fill in its
            // default hardware profile, which already includes a 640x480 "drawing
            // buffer" - an internal 2x upscale so the picture looks crisp on screen.
            // Here we declare both sizes ourselves so the demo is easy to read:
            // displaySize is the grid the game draws on (320x240 pixels).
            displaySize: new Vector2i(320, 240),

            // Now we ask for a bigger drawing buffer on purpose. This is the
            // "scaled display" case: the game still draws on a 320x240 grid, but the
            // engine keeps a 640x480 picture for the screen. BT.outputSize is that
            // 640x480 size, so a capture with size 'output' is 640x480 and a capture
            // with size 'display' is 320x240. Declaring it explicitly keeps the
            // choice visible in this demo instead of depending on engine defaults.
            drawingBufferSize: new Vector2i(640, 480),
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
        // shortcuts (like the Save button's S binding) and tracks touch contacts.
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

        // UI kit panel in the top-left corner. We avoid bottom-left specifically
        // because the engine keeps that 17x13 corner tappable for toggling the stats
        // overlay, and we do not want the two to fight over taps; top-left has no
        // such conflict.
        // Note: this panel is drawn onto the frame, so it WILL be part of the saved
        // PNG. That is acceptable here - it even doubles as a caption telling you
        // which demo produced the screenshot.
        ui.begin(UI_ANCHORS.TOP_LEFT);
        ui.panel('Image Output');

        // The Save button. ui.button() returns true only on the single frame it was
        // clicked, tapped, or its bound key (S) was pressed - so holding S does not
        // spam downloads. We also ignore it while a save is already running.
        // Bound to S rather than Space: Space is the browser's page-scroll key, and
        // this demo does not opt into isCapturingKeyboardScroll, so a Space press
        // would both save AND scroll the page - confusing on a page taller than the
        // canvas.
        if (ui.button('Save PNG (S)', { key: 'KeyS' }) && !this.capturing) {
            this.saveFrame();
        }

        // The Size button flips between the two FrameCaptureSize choices. It shows
        // the choice that is active right now, so you can see what the next
        // capture will use.
        if (ui.button(`Size: ${this.captureSize} (Z)`, { key: 'KeyZ', id: 'size' })) {
            this.captureSize = this.captureSize === SIZE_OUTPUT ? SIZE_DISPLAY : SIZE_OUTPUT;
        }

        // The Capture Blob button calls BT.captureFrame() instead of downloadFrame().
        // Nothing is saved to disk - the demo gets the PNG data and reads it itself.
        if (ui.button('Capture Blob (B)', { key: 'KeyB' }) && !this.capturing) {
            this.captureBlob();
        }

        // One status row below the buttons. We always draw a row (even when idle) so
        // the panel does not jump in size when a message appears or disappears.
        if (this.capturing) {
            // A save is in flight - the browser is busy reading the canvas.
            ui.label('Capturing...', { color: 'info' });
        } else if (this.messageTimer > 0) {
            // A save just finished - show the result in green (success) or orange (error).
            ui.label(this.lastCaptureMessage, { color: this.lastCaptureColor });
        } else {
            // Nothing happening - a quiet hint in dim gray. In dev mode (running from
            // `pnpm run dev`, not a production build) we also mention the F9/Shift+F9
            // shortcuts - engine defaults (every demo gets them, see
            // HardwareSettings.isFrameCaptureShortcutEnabled), not something this demo
            // wires up itself. It has no visible button of its own to advertise them, so
            // this is the most relevant place to mention them.
            const hint = BT.isDevMode
                ? 'Saves the current frame (dev: F9 copies, Shift+F9 saves)'
                : 'Saves the current frame';
            ui.label(hint, { color: 'dim' });
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

        // Remember which size we asked for. The player may press Size while we wait.
        const size = this.captureSize;

        // BT.downloadFrame() reads the canvas and asks the browser to save a file.
        // Most browsers open a "Save as" dialog or drop the file straight into your
        // Downloads folder (depends on your browser settings). The demo cannot pick
        // the folder for you - that is normal browser security.
        BT.downloadFrame('blit386-capture.png', { size })
            .then(() => {
                // Success: show a friendly message in green.
                this.showMessage(`Saved: blit386-capture.png (${size})`, 'accent');
                return null;
            })
            .catch((err) => {
                // Failure: show the error in orange and log details for developers.
                this.showMessage(`Error: ${err.message}`, 'warm');
                console.error('[Demo] Capture failed:', err);
            });
    }

    /**
     * Captures the current frame as a Blob with BT.captureFrame() and reads the
     * Blob's byte count and picture dimensions for the status row.
     */
    captureBlob() {
        // Same "in flight" flag as saveFrame(), so only one capture runs at a time.
        this.capturing = true;

        // Remember which size we asked for. The player may press Size while we wait.
        const size = this.captureSize;

        // BT.captureFrame() resolves with a Blob: the PNG file held in memory.
        // The options object picks the size, exactly like BT.downloadFrame().
        BT.captureFrame({ size })
            .then(async (blob) => {
                // createImageBitmap() decodes the PNG so we can read its real width and
                // height. This proves the Blob holds the size we asked for.
                const image = await createImageBitmap(blob);
                const message = `Blob ${size}: ${image.width}x${image.height}, ${blob.size} bytes`;

                // Free the decoded picture; we only needed its dimensions.
                image.close();

                this.showMessage(message, 'accent');
                return null;
            })
            .catch((err) => {
                // Failure: show the error in orange and log details for developers.
                this.showMessage(`Error: ${err.message}`, 'warm');
                console.error('[Demo] Blob capture failed:', err);
            });
    }

    /**
     * Ends a capture: shows a status message for three seconds and unlocks the buttons.
     *
     * @param {string} text - The message to show.
     * @param {string} color - UI color role: 'accent' (green) for success, 'warm' (orange) for an error.
     */
    showMessage(text, color) {
        this.lastCaptureMessage = text;
        this.lastCaptureColor = color;
        this.messageTimer = 180; // 3 seconds at 60 FPS
        this.capturing = false;
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
