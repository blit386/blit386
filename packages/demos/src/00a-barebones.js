// @pageTitle Blit-Tech Demo 00a - Barebones
//
// The smallest possible Blit-Tech demo: a single square that moves and jumps.
// This is the "blank canvas" starter -- every other demo in the series builds on this pattern.
//
// What you will see:
//   - A square that falls under gravity.
//   - Hold the A button (or Space) to make it jump.
//   - Press left / right to move it sideways.
//
// The three methods every Blit-Tech demo can have:
//   init()   -- called once at startup to set up colors and load resources.
//   update() -- called 60 times per second to move things and respond to input.
//   render() -- called 60 times per second to draw everything on screen.

// #region Imports

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

// #endregion

// #region Type Definitions

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #endregion

// #region Demo Class

/**
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The color palette holds all the colors we are allowed to draw with.
    // Think of it like a numbered paint box: each slot holds one color.
    palette = null;

    // The player's current position on screen, in pixels.
    // Vector2i stores two whole numbers (x and y) -- no fractions needed for pixels.
    // Starting at (160, 120) puts the square roughly in the center of the 320x240 display.
    player = new Vector2i(160, 120);

    // How fast the player is currently falling, in pixels per tick.
    // Gravity pulls this number up every tick so the square accelerates downward.
    gravity = 0;

    // How hard the player is jumping, in pixels per tick upward.
    // Set to 0.1 while the A button is held; resets to 0 when released.
    jump = 0;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Called once when the demo starts.
     * Creates the palette and registers two colors: the background and the player square.
     *
     * @returns {Promise<boolean>} Return true to tell the engine everything loaded correctly.
     */
    async init() {
        // Create a palette that can hold up to 16 colors.
        // We only need two here (background + player), but 16 is a small, common choice.
        this.palette = BT.paletteCreate(16);

        // Slot 1: the color we will use for the player square.
        // RGB (18, 22, 32) is a very dark navy -- almost black, like a night sky.
        this.palette.set(1, new Color32(18, 22, 32));

        // Slot 2: the color we will use to clear the screen each frame.
        // RGB (32, 0, 128) is a deep violet-blue, the "background sky".
        this.palette.set(2, new Color32(32, 0, 128));

        // Hand this palette to the engine. From now on, every draw call uses slot numbers,
        // not Color32 objects -- the engine looks up the actual color from the palette.
        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Called 60 times per second before render(). Reads input and moves the player.
     * Think of this as the "physics" step -- we calculate where things should be,
     * but we do not draw anything here.
     */
    update() {
        // -- Input: jumping --
        // BT.buttonDown() returns true every tick that a button is held.
        // BTN_A maps to the Space bar on keyboards and the A button on gamepads.
        if (BT.buttonDown(BT.BTN_A, 0)) {
            // While held, build up jump force and cancel any downward gravity.
            this.jump += 0.1;
            this.gravity = 0;
        }

        // BT.buttonReleased() returns true only on the single tick the button is let go.
        if (BT.buttonReleased(BT.BTN_A, 0)) {
            // Once released, stop adding upward force so the square falls naturally.
            this.jump = 0;
        }

        // -- Input: left/right movement --
        if (BT.buttonDown(BT.BTN_RIGHT, 0)) {
            // Move one pixel to the right each tick the button is held.
            this.player.x++;
        }
        if (BT.buttonDown(BT.BTN_LEFT, 0)) {
            this.player.x--;
        }

        // -- Physics: gravity --
        // Each tick, gravity grows by 0.1 pixels/tick, pulling the square downward faster and faster.
        // Without a floor to land on (not added here), the square eventually flies off screen.
        this.gravity += 0.1;

        // Apply gravity: add the falling speed to the Y position.
        // Y increases downward in Blit-Tech -- 0 is the top edge of the screen.
        this.player.y += this.gravity;

        // Apply jump: subtract the jump force from Y to push the square upward.
        this.player.y -= this.jump;
    }

    /**
     * Called 60 times per second, after update(). Draws the current frame.
     * We clear the screen first, then draw the player square on top.
     */
    render() {
        // Clear the whole screen with slot 2 (the deep violet-blue background).
        // Without this, the previous frame's drawing would still be visible underneath.
        BT.clear(2);

        // Draw a 32x32 filled rectangle at the player's current position.
        // Rect2i(x, y, width, height) defines where and how large the rectangle is.
        // Slot 1 is our dark-navy player color.
        BT.drawRectFill(new Rect2i(this.player.x, this.player.y, 32, 32), 1);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// Hand the Demo class to Blit-Tech to start the demo loop.
// Blit-Tech creates one instance and calls init(), then update() + render() 60 times a second.
bootstrap(Demo);

// #endregion
