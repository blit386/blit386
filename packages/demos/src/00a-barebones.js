// The smallest possible BLIT386 demo: a single square that moves and jumps.
// This is the "blank canvas" starter - every other demo in the series builds on this pattern.
//
// What you will see:
//   - A square that falls under gravity.
//   - Hold the A button (or Space) to make it jump.
//   - Press left / right to move it sideways.
//   - On touch screens: tap the left or right half of the screen to nudge the square,
//     and tap the small A button (drawn by the shared UI kit) for an upward hop.
//
// The three methods every BLIT386 demo can have:
//   init()   - called once at startup to set up colors and load resources.
//   update() - called 60 times per second to move things and respond to input.
//   render() - called 60 times per second to draw everything on screen.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').Palette} Palette */

// Invisible touch zones: the left and right halves of the 320x240 display.
// A tap inside one of these rectangles counts as a left or right press on touch screens.
const LEFT_ZONE = new Rect2i(0, 0, 160, 240);
const RIGHT_ZONE = new Rect2i(160, 0, 160, 240);

/**
 * @implements {IBTDemo}
 */
class Demo {
    // The color palette holds all the colors we are allowed to draw with.
    // Think of it like a numbered paint box: each slot holds one color.
    /** @type {Palette | null} */
    palette = null;

    // Where the shared UI theme colors landed in the palette, filled by applyTheme() in
    // init(). The UI kit draws its button and hint text with these slots.
    theme = null;

    // The player's current position on screen, in pixels.
    // Vector2i stores two whole numbers (x and y) - no fractions needed for pixels.
    // Starting at (160, 120) puts the square roughly in the center of the 320x240 display.
    player = new Vector2i(160, 120);

    // How fast the player is currently falling, in pixels per tick.
    // update() makes this number grow a little each tick - that steady growing IS gravity,
    // which is why the square speeds up as it falls.
    fallSpeed = 0;

    // How fast the player is being lifted upward, in pixels per tick.
    // It grows by 0.1 every tick the A button is held, so longer holds lift harder.
    // It resets to 0 when the button is released.
    liftSpeed = 0;

    // Set by render() when the on-screen A button is tapped; update() reads and clears it.
    jumpQueued = false;

    /**
     * Called once when the demo starts.
     * Creates the palette, registers the two scene colors, and installs the UI theme.
     *
     * @returns {Promise<boolean>} Return true to tell the engine everything loaded correctly.
     */
    async init() {
        // Create a palette that can hold up to 16 colors.
        // Slots 1-2 are our scene colors; the shared UI theme fills the rest.
        this.palette = BT.paletteCreate(16);

        // Slot 1: the color we will use for the player square.
        // RGB (18, 22, 32) is a very dark navy - almost black, like a night sky.
        this.palette.set(1, new Color32(18, 22, 32));

        // Slot 2: the color we will use to clear the screen each frame.
        // RGB (32, 0, 128) is a deep violet-blue, the "background sky".
        this.palette.set(2, new Color32(32, 0, 128));

        // Install the shared UI theme (the colors every demo's buttons and labels use).
        // It writes 12 colors starting at the slot we pass - slots 4..15 here, which fills
        // the rest of our small 16-color paint box exactly. This must happen before
        // BT.paletteSet() below, and before any ui.* drawing.
        this.theme = applyTheme(this.palette, 4);

        // Hand this palette to the engine. From now on, every draw call uses slot numbers,
        // not Color32 objects - the engine looks up the actual color from the palette.
        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Called 60 times per second before render(). Reads input and moves the player.
     * Think of this as the "physics" step - we calculate where things should be,
     * but we do not draw anything here.
     */
    update() {
        // Let the UI kit track touch contacts and taps. This must be the first line of
        // update() so ui.tapIn() below sees this tick's presses.
        ui.tick();

        // Input: jumping
        // BT.isDown() returns true every tick that a button is held.
        // BTN_A maps to the Space bar on keyboards and the A button on gamepads.
        if (BT.isDown(BT.BTN_A, 0)) {
            // While held, build up lift speed and cancel any downward falling.
            this.liftSpeed += 0.1;
            this.fallSpeed = 0;
        }

        // BT.isReleased() returns true only on the single tick the button is let go.
        if (BT.isReleased(BT.BTN_A, 0)) {
            // Once released, stop adding upward force so the square falls naturally.
            this.liftSpeed = 0;
        }

        // render() only ASKS for a jump (by setting this flag when the on-screen A button
        // is tapped) - here in update() we actually perform it, as an instant upward kick.
        if (this.jumpQueued) {
            this.fallSpeed = -3;
            this.jumpQueued = false;
        }

        // Input: left/right movement
        if (BT.isDown(BT.BTN_RIGHT, 0)) {
            // Move one pixel to the right each tick the button is held.
            this.player.x++;
        }
        if (BT.isDown(BT.BTN_LEFT, 0)) {
            this.player.x--;
        }

        // Touch input: treat a tap on either half of the screen like a left or right press.
        // ui.tapIn() is true only on the single tick the tap lands, so one tap moves the
        // square one pixel - a tiny nudge, which is fine for this starter demo.
        if (ui.tapIn(LEFT_ZONE)) {
            this.player.x--;
        }
        if (ui.tapIn(RIGHT_ZONE)) {
            this.player.x++;
        }

        // Physics: gravity
        // Each tick, fallSpeed grows by 0.1 pixels/tick - that steady growing is gravity,
        // and it makes the square fall faster and faster.
        // Without a floor to land on (not added here), the square eventually flies off screen.
        this.fallSpeed += 0.1;

        // Apply the fall: add the falling speed to the Y position.
        // Y increases downward in BLIT386 - 0 is the top edge of the screen.
        this.player.y += this.fallSpeed;

        // Apply the lift: subtract the lift speed from Y to push the square upward.
        this.player.y -= this.liftSpeed;
    }

    /**
     * Called 60 times per second, after update(). Draws the current frame.
     * We clear the screen first, then draw the player square and the touch UI on top.
     */
    render() {
        // Clear the whole screen with slot 2 (the deep violet-blue background).
        // Without this, the previous frame's drawing would still be visible underneath.
        BT.clear(2);

        // Draw a 32x32 filled rectangle at the player's current position.
        // Rect2i(x, y, width, height) defines where and how large the rectangle is.
        // Slot 1 is our dark-navy player color.
        BT.drawRectFill(new Rect2i(this.player.x, this.player.y, 32, 32), 1);

        // A small on-screen A button in the bottom-right corner, for touch screens.
        // Keyboard players hold Space, but a finger cannot "hold" a UI button here:
        // ui.button() only reports the single frame it was tapped, so one tap gives
        // the square an instant upward kick instead of the build-up jump.
        ui.begin('bottomRight');
        if (ui.button('A', { width: 28 })) {
            // render() only ASKS for the jump by raising this flag - update() performs it.
            this.jumpQueued = true;
        }
        ui.end();

        // Show a dim hint once the player has touched the screen at least once.
        // No ui.panel() call means this group is just floating text - no box around it.
        if (ui.hasTouch()) {
            ui.begin('topLeft');
            ui.label('Tap left/right to move, tap A to hop', { color: 'dim' });
            ui.end();
        }
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
// BLIT386 creates one instance and calls init(), then update() + render() 60 times a second.
bootstrap(Demo);
