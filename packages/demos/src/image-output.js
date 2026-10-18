/*

Image Output: save the frame as a PNG with BT.downloadFrame() or BT.captureFrame().
@description Capture frames as PNG with BT.downloadFrame and BT.captureFrame, at output or display size.
@ogScale integer

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives

Live version: https://demos.blit386.dev/image-output

Guides:
  - Overlay: https://blit386.dev/docs/guides/overlay#visibility-model

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#frame-capture
  - Core: https://blit386.dev/docs/api/core#resolution-model
  - Core: https://blit386.dev/docs/api/core#dev-vs-release-mode

---

WHAT YOU WILL SEE
-----------------

A test pattern that is easy to check in an image viewer: six horizontal stripes, each 40
pixels tall, slowly cycling through the rainbow; a grid of single white dots every 20
pixels; a white border around the whole screen; and a small white crosshair in the exact
center. A UI kit panel titled "Image Output" sits in the top-left corner with three
buttons - "Save PNG (S)", "Size: output (Z)", and "Capture Blob (B)" - a status row, and a
FRAME counter that goes up by one every tick.

WHAT YOU WILL LEARN
-------------------

- BT.downloadFrame(filename, { size }) takes a screenshot of the next rendered frame and
  saves it as a PNG file on your computer.
- BT.captureFrame({ size }) takes the same screenshot but hands you the PNG as a Blob (a
  chunk of file data in memory) instead of saving it.
- The size option: 'output' (the default) gives the full drawing buffer, 'display' gives
  exactly one PNG pixel per game pixel.
- displaySize vs drawingBufferSize in configure(): this demo draws on a 320x240 grid but
  asks for a 640x480 drawing buffer, so the two capture sizes produce different images.
- Promises: both calls return a promise, and the demo reacts with .then() when the capture
  finishes and .catch() when it fails.
- Palette animation: update() writes new colors into six palette slots every tick, and
  render() keeps drawing with the same slot numbers.
- isOverlayToggleHintVisible: hiding the engine's overlay hint so it does not end up in
  the saved picture.

WHICH SIZE IS WHICH?
--------------------

Most games never set displaySize or drawingBufferSize and inherit the engine default: a
320x240 game grid drawn into a 640x480 buffer, so every game pixel is a crisp 2x2 block
on screen. This demo spells both sizes out in configure() so the choice is visible.

  - 'output' captures BT.outputSize, the 640x480 buffer, including any display-tier
    post-process effects (CRT, vignette, and the like). This is what the player sees.
  - 'display' captures BT.displaySize, the 320x240 game grid, with no upscale and no
    display-tier effects. Best for pixel-art export and image comparisons.

The "Size" button (key Z) switches between the two, and the status row after a capture
tells you which one was used.

The kit panel is drawn onto the frame like everything else, so it appears in the saved
PNG too. That is on purpose: it doubles as a caption saying which demo made the picture,
and it is what lets touch users save at all.

DEV-MODE SHORTCUTS
------------------

The engine itself adds two capture shortcuts in development builds (running from
`pnpm run dev`, not a production build), for every game, not just this demo: F9 copies
the current frame to the clipboard, and Shift+F9 downloads it as a timestamped PNG file.
Both capture at BT.displaySize, so they match this demo's Save PNG button only while the
Size button says 'display'. HardwareSettings.isFrameCaptureShortcutEnabled turns them on
or off explicitly; the default follows BT.isDevMode. In dev mode the engine also exposes
the whole BT namespace as window.BT (BootstrapOptions.exposeGlobal), so you can type
window.BT.downloadFrame('my-file.png') in the browser console at any time.

TRY THIS
--------

- Press S, or click or tap "Save PNG (S)", to download the current frame. The status row
  turns green with the file name on success, or orange with the error.
- Press Z to switch the size to 'display', save again, and compare the two files: one is
  640x480 with 2x2 blocks, the other is 320x240 with single pixels.
- Press B, or click "Capture Blob (B)", to capture without saving. The status row shows
  the picture's width, height, and byte count read straight from the Blob.
- Press the backquote key (`) to open the engine overlay, then save: the overlay is drawn
  on top of the frame, so it ends up in the PNG too. Press ` again to hide it first when
  you want a clean capture.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// Every color used for drawing is stored in a numbered "palette" slot. Think of each slot
// like a labeled paint jar on an artist's shelf. Slot 0 is always transparent, so our own
// colors start at 1. These are the scene colors - the test pattern itself. The panel,
// buttons, and text draw with the shared UI theme instead (installed by applyTheme() in
// init()).
const C_WHITE = 1; // grid dots, border, and crosshairs
const C_BG = 2; // very dark blue-gray background

// Dynamic slots: these six colors change every tick to create the animated rainbow
// stripes. We reserve slots 10 through 15, one for each horizontal stripe. update()
// calculates the new color and stores it here; render() just uses the slot number. This
// is called "palette animation" - the retro trick that made old consoles look alive.
const C_STRIPE_0 = 10; // top stripe; stripes 1-5 follow at C_STRIPE_0 + 1 through + 5

// The two capture sizes the engine understands (the FrameCaptureSize type). Named
// constants, so a typo cannot silently pick the wrong one.
const SIZE_OUTPUT = 'output'; // the whole drawing buffer, including display effects
const SIZE_DISPLAY = 'display'; // exact game pixels, one PNG pixel per game pixel

// Draws a colorful test pattern and saves the frame as a PNG when the kit's "Save PNG"
// button is clicked, tapped, or triggered with the S key.
class Demo {
    // The palette holds the list of colors the engine uses for drawing.
    /** @type {Palette | null} */
    palette = null;

    // Counts how many update() ticks have run since the demo started (goes up by 1 each
    // tick). We use it to animate the stripes and to show a frame number in the panel.
    tick = 0;

    // True while we are waiting for a capture to finish. It stops you from starting two
    // captures at once and makes render() show "Capturing..." on screen.
    capturing = false;

    // The text we show after a capture succeeds or fails (the file name, the Blob size,
    // or an error).
    lastCaptureMessage = '';

    // Which UI color role to draw that message with: 'accent' (green) for success, 'warm'
    // (orange) for an error.
    lastCaptureColor = 'accent';

    // The size option we pass to BT.downloadFrame() and BT.captureFrame(). 'output' means
    // the full drawing buffer (640x480 here); 'display' means one PNG pixel per game
    // pixel (320x240 here). The Size button switches between them.
    captureSize = SIZE_OUTPUT;

    // Counts down how many more ticks to show lastCaptureMessage before hiding it. 180
    // ticks is 3 seconds at 60 ticks per second.
    messageTimer = 0;

    // Hides the overlay toggle hint so saved screenshots stay clean, and sets a 320x240
    // display on a 640x480 drawing buffer so the two capture sizes differ.
    configure() {
        return {
            // The engine usually draws a small "~" hint in the bottom-left corner to tell
            // people they can press the backquote key (`) to open the stats overlay. This
            // demo's whole point is saving a picture, and the overlay is drawn on top of
            // everything, so that hint would end up baked into the saved PNG. We hide the
            // hint to keep captures tidy. (The kit panel DOES appear in the capture - a
            // deliberate trade-off so touch users can save at all; see render().) The
            // overlay still works on demand: press ` to show it and ` again to hide it
            // before you capture. The bottom-left 17x13 corner also stays tappable to
            // toggle it, which is why our panel sits in the top-left instead.
            isOverlayToggleHintVisible: false,

            // Most demos leave displaySize unset and let the engine fill in its default
            // hardware profile, which already includes a 640x480 drawing buffer - an
            // internal 2x upscale so the picture looks crisp on screen. Here we declare
            // both sizes ourselves so the demo is easy to read: displaySize is the grid
            // the game draws on (320x240 pixels).
            displaySize: new Vector2i(320, 240),

            // Now we ask for a bigger drawing buffer on purpose. This is the "scaled
            // display" case: the game still draws on a 320x240 grid, but the engine keeps
            // a 640x480 picture for the screen. BT.outputSize is that 640x480 size, so a
            // capture with size 'output' is 640x480 and a capture with size 'display' is
            // 320x240. Declaring it explicitly keeps the choice visible instead of
            // depending on engine defaults.
            drawingBufferSize: new Vector2i(640, 480),
        };
    }

    // Sets up the color palette and installs the shared UI theme colors. The buttons
    // themselves are declared every frame in render().
    async init() {
        // Step 1: build the color palette. 256 slots is the classic retro amount.
        this.palette = BT.paletteCreate(256);

        // Store the static scene colors we always need.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_BG, new Color32(20, 20, 30)); // very dark blue-gray background

        // Pre-fill the six animated stripe slots with a starting color (dark gray).
        // update() replaces them on the very first tick; filling them now prevents any
        // "empty slot" glitches on the first frame.
        for (let i = 0; i < 6; i++) {
            this.palette.set(C_STRIPE_0 + i, new Color32(40, 40, 40));
        }

        // Step 2: install the shared UI theme. applyTheme() writes the twelve UI kit
        // colors into high palette slots (240-251 by default), far above our scene slots
        // 1-15. Every kit widget (the panel, buttons, labels) draws with these colors
        // automatically - this demo never needs the slot numbers itself, so we call
        // applyTheme() only for that side effect and ignore its return value.
        applyTheme(this.palette);

        // Tell the engine "use this palette from now on."
        BT.paletteSet(this.palette);

        return true;
    }

    // Advances the demo clock, expires the status message, and updates the animated
    // stripe colors in the palette. Runs at a fixed rate (60 times per second).
    update() {
        // Let the UI kit do its per-tick housekeeping first: it latches keyboard
        // shortcuts (like the Save button's S binding) and tracks touch contacts. This
        // must be the first line of update() so nothing misses a key press.
        ui.tick();

        // Bump the tick counter so the animation and the on-screen FRAME row keep
        // changing.
        this.tick++;

        // If we are showing a success or error message, count down until it should go.
        if (this.messageTimer > 0) {
            this.messageTimer--;
        }

        // Palette animation for the six horizontal stripes. Instead of computing colors
        // inside render(), we compute them here in update() and store the results in the
        // reserved palette slots. render() then just uses the slot numbers.
        for (let i = 0; i < 6; i++) {
            // phase is an angle-like value from 0 to 359 that moves as tick increases.
            // Each stripe adds i * 20 so neighboring stripes do not look identical. The %
            // 360 (remainder after dividing by 360) keeps the value from growing forever
            // - it wraps back to 0 at 360.
            const phase = (this.tick + i * 20) % 360;

            // Red channel: Math.sin returns a wave between -1 and +1. Multiplying by 127
            // and adding 127 shifts that to a range of 0 to 254. Math.PI / 180 converts
            // degrees to radians, which is what Math.sin expects.
            const r = Math.floor(127 + 127 * Math.sin((phase * Math.PI) / 180));

            // Green channel: the same sine wave shifted 120 degrees around the color
            // wheel. Shifting each channel separately makes R, G, and B cycle out of
            // step, which creates the rainbow effect as the phase changes.
            const g = Math.floor(127 + 127 * Math.sin(((phase + 120) * Math.PI) / 180));

            // Blue channel: shifted 240 degrees so all three are evenly spaced.
            const b = Math.floor(127 + 127 * Math.sin(((phase + 240) * Math.PI) / 180));

            // Store the computed color in the palette slot for this stripe. render()
            // reads C_STRIPE_0 + i to draw each stripe - no Color32 needed there.
            this.palette.set(C_STRIPE_0 + i, new Color32(r, g, b));
        }
    }

    // Draws the animated test pattern and the UI kit panel with the buttons and the
    // capture status. Runs once per screen refresh.
    render() {
        // Ask the engine how wide and tall our game screen is in pixels.
        const screen = BT.displaySize;

        // Fill the whole screen with the dark background before drawing anything else.
        // C_BG is just a number (2); the palette knows it means dark blue-gray.
        BT.clear(C_BG);

        // Draw six horizontal stripes using the animated palette slots we updated in
        // update(). Each stripe's color was already computed and stored - we just use the
        // slot number.
        const stripeHeight = 40;

        for (let i = 0; i < 6; i++) {
            // y is the top edge of this stripe in pixels.
            const y = i * stripeHeight;

            // C_STRIPE_0 + i picks the palette slot for this stripe (10, 11, 12, ...).
            BT.drawRectFill(new Rect2i(0, y, screen.x, stripeHeight), C_STRIPE_0 + i);
        }

        // A grid of single white pixels every 20 pixels, so you can check alignment when
        // you open the PNG.
        for (let x = 0; x < screen.x; x += 20) {
            for (let y = 0; y < screen.y; y += 20) {
                BT.drawPixel(new Vector2i(x, y), C_WHITE);
            }
        }

        // Outline the entire display with a white rectangle so the edges are obvious in
        // the screenshot.
        BT.drawRect(new Rect2i(0, 0, screen.x, screen.y), C_WHITE);

        // Crosshairs at the exact center: cx is half the width, cy is half the height,
        // floored to whole pixels.
        const cx = Math.floor(screen.x / 2);
        const cy = Math.floor(screen.y / 2);

        // Horizontal line through the center (20 pixels left and right of center).
        BT.drawLine(new Vector2i(cx - 20, cy), new Vector2i(cx + 20, cy), C_WHITE);

        // Vertical line through the center (20 pixels up and down from center).
        BT.drawLine(new Vector2i(cx, cy - 20), new Vector2i(cx, cy + 20), C_WHITE);

        // UI kit panel in the top-left corner. We avoid the bottom-left because the
        // engine keeps that 17x13 corner tappable for toggling the stats overlay, and we
        // do not want the two to fight over taps; the top-left has no such conflict. This
        // panel is drawn onto the frame, so it WILL be part of the saved PNG. That is
        // acceptable here - it even doubles as a caption telling you which demo made the
        // screenshot.
        ui.begin(UI_ANCHORS.TOP_LEFT);
        ui.panel('Image Output');

        // The Save button. ui.button() returns true only on the single frame it was
        // clicked, tapped, or its bound key (S) was pressed - so holding S does not spam
        // downloads. We also ignore it while a capture is already running. Bound to S
        // rather than Space: Space is the browser's page-scroll key, and this demo does
        // not opt into isCapturingKeyboardScroll, so a Space press would both save AND
        // scroll the page - confusing on a page taller than the canvas.
        if (ui.button('Save PNG (S)', { key: 'KeyS' }) && !this.capturing) {
            this.saveFrame();
        }

        // The Size button flips between the two FrameCaptureSize choices. Its label shows
        // the choice that is active right now, so you can see what the next capture will
        // use. The label changes, so the button needs a fixed id to stay the same widget.
        if (ui.button(`Size: ${this.captureSize} (Z)`, { key: 'KeyZ', id: 'size' })) {
            this.captureSize = this.captureSize === SIZE_OUTPUT ? SIZE_DISPLAY : SIZE_OUTPUT;
        }

        // The Capture Blob button calls BT.captureFrame() instead of BT.downloadFrame().
        // Nothing is saved to disk - the demo gets the PNG data and reads it itself.
        if (ui.button('Capture Blob (B)', { key: 'KeyB' }) && !this.capturing) {
            this.captureBlob();
        }

        // One status row below the buttons. We always draw a row (even when idle) so the
        // panel does not jump in size when a message appears or disappears.
        if (this.capturing) {
            // A capture is in flight - the browser is busy reading the canvas.
            ui.label('Capturing...', { color: 'info' });
        } else if (this.messageTimer > 0) {
            // A capture just finished - show the result in green (success) or orange
            // (error).
            ui.label(this.lastCaptureMessage, { color: this.lastCaptureColor });
        } else {
            // Nothing happening - a quiet hint in dim gray. In dev mode (running from
            // `pnpm run dev`, not a production build) we also mention the F9/Shift+F9
            // shortcuts. They are engine defaults (every game gets them, see
            // HardwareSettings.isFrameCaptureShortcutEnabled), not something this demo
            // wires up itself; it has no button of its own to advertise them, so this
            // hint is the most relevant place.
            const hint1 = 'Saves the current frame';
            const hint2 = BT.isDevMode ? '(dev: F9 copies, Shift+F9 saves)' : '';
            ui.label(hint1, { color: 'dim' });
            ui.label(hint2, { color: 'dim' });
        }

        // Frame counter so you can tell consecutive screenshots apart.
        ui.kv('FRAME', this.tick);
        ui.end();
    }

    // Starts a PNG download of the current frame and remembers the outcome so render()
    // can show a status message for a few seconds.
    saveFrame() {
        // Mark the capture as "in flight" so the buttons ignore further presses and
        // render() shows the "Capturing..." status row.
        this.capturing = true;

        // Remember which size we asked for. You may press Z while we wait.
        const size = this.captureSize;

        // BT.downloadFrame() reads the canvas and asks the browser to save a file. Most
        // browsers open a "Save as" dialog or drop the file straight into your Downloads
        // folder (depends on your browser settings). The demo cannot pick the folder for
        // you - that is normal browser security.
        BT.downloadFrame('blit386-capture.png', { size })
            .then(() => {
                // Success: show a friendly message in green.
                this.showMessage(`Saved: blit386-capture.png (${size})`, 'accent');
                return null;
            })
            .catch((err) => {
                // Failure: show the error in orange and log the details for developers.
                this.showMessage(`Error: ${err.message}`, 'warm');
                console.error('[Demo] Capture failed:', err);
            });
    }

    // Captures the current frame as a Blob with BT.captureFrame() and reads the Blob's
    // byte count and picture dimensions for the status row.
    captureBlob() {
        // Same "in flight" flag as saveFrame(), so only one capture runs at a time.
        this.capturing = true;

        // Remember which size we asked for. You may press Z while we wait.
        const size = this.captureSize;

        // BT.captureFrame() resolves with a Blob: the PNG file held in memory. The
        // options object picks the size, exactly like BT.downloadFrame().
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
                // Failure: show the error in orange and log the details for developers.
                this.showMessage(`Error: ${err.message}`, 'warm');
                console.error('[Demo] Blob capture failed:', err);
            });
    }

    // Ends a capture: shows a status message for three seconds and unlocks the buttons.
    // `color` is a UI color role: 'accent' (green) for success, 'warm' (orange) for an
    // error.
    showMessage(text, color) {
        this.lastCaptureMessage = text;
        this.lastCaptureColor = color;
        this.messageTimer = 180; // 3 seconds at 60 ticks per second
        this.capturing = false;
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
