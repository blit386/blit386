// {{projectName}} - a tiny BLIT386 game called "Catcher".
//
// Move the paddle to catch the blocks falling from the top.
// On a phone or tablet: drag or tap - the paddle centers under your finger.
// On a computer: move the mouse, or use the left and right arrow keys as a fallback.
// Catch one: +1 point. Miss one: lose a life. Run out of lives and the game starts over.
//
// Every BLIT386 game is one class with up to four methods. We use three of them here:
//   init()   - runs once at the start (we set up our colors here).
//   update() - runs about 60 times a second (we move things and check for catches here).
//   render() - runs about 60 times a second (we draw everything here).
//
// Optional hooks you can add later: configure() for screen settings, onHotReload() to keep
// score across init() edits while the Vite plugin hot-reloads (see the commented example below).
//
// We do not write a configure() method, so we get the default screen: 320 by 240 pixels at 60 frames per second.
// Want to learn more? Read AGENTS.md or the docs/ folder next to this file.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

// Color slot numbers. We put real colors into these slots in init(), then draw using the numbers.
// Slot 0 is always transparent, so we start counting at 1.
const COLOR_BACKGROUND = 1;
const COLOR_PADDLE = 2;
const COLOR_ITEM = 3;
const COLOR_TEXT = 4;

// Sizes and speeds. These are the fun knobs to turn. Change a number, save, and watch what happens.
const PADDLE_WIDTH = 48;
const PADDLE_HEIGHT = 8;
const ITEM_SIZE = 10;
const PADDLE_SPEED = 3; // how many pixels the paddle moves each step
const ITEM_FALL_SPEED = 2; // how many pixels a block falls each step
const SPAWN_EVERY = 45; // a new block appears every this many steps (60 steps is about one second)
const STARTING_LIVES = 3;

class Game {
    // How big the screen is. We read the real size in init().
    screen = new Vector2i(320, 240);

    // The paddle's initial position.
    paddlePos = new Vector2i(0, 0);

    // The blocks falling right now. Each one is a Vector2i holding its top-left corner.
    /** @type {Vector2i[]} */
    items = [];

    // The player's score and lives.
    score = 0;
    lives = STARTING_LIVES;

    async init() {
        // Remember the screen size so the game fits no matter how big it is.
        this.screen = BT.displaySize;

        // Make a palette (a numbered set of colors) and choose four colors.
        // Color32(red, green, blue) - each value goes from 0 (none) to 255 (full).
        const palette = BT.paletteCreate(16);

        palette.set(COLOR_BACKGROUND, new Color32(18, 22, 40)); // dark blue
        palette.set(COLOR_PADDLE, new Color32(90, 200, 160)); // teal
        palette.set(COLOR_ITEM, new Color32(240, 180, 70)); // warm yellow
        palette.set(COLOR_TEXT, new Color32(235, 240, 255)); // near white

        BT.paletteSet(palette);

        // Put the paddle in the middle, near the bottom.
        this.paddlePos.x = Math.floor((this.screen.x - PADDLE_WIDTH) / 2);
        this.paddlePos.y = this.screen.y - PADDLE_HEIGHT - 6;

        return true; // tell the engine that setup worked
    }

    update() {
        // BLIT386 supports two ways to move the paddle: pointer input (mouse and touch) and arrow keys.
        // We check the pointer first because it works on phones, tablets, and any computer with a mouse.
        // The "0" you see in BT.isPointerActive(0) and BT.pointerPos(0) means "the first pointer slot."
        // A phone can track several fingers at once; slot 0 is always the first (or only) one.
        if (BT.isPointerActive(0)) {
            // BT.pointerPos(0) returns a Vector2i: the exact pixel position of the pointer right now.
            // We want the CENTER of the paddle under the pointer, not its left edge.
            // Subtracting half the paddle width shifts it left so it is balanced around the cursor or finger.
            this.paddlePos.x = BT.pointerPos(0).x - Math.floor(PADDLE_WIDTH / 2);
        } else {
            // No pointer is active - fall back to the arrow keys (or a connected gamepad).
            // BT.isDown() is true for every frame the button is held down, not just the frame it was pressed.
            if (BT.isDown(BT.BTN_LEFT, 0)) {
                this.paddlePos.x -= PADDLE_SPEED;
            }

            if (BT.isDown(BT.BTN_RIGHT, 0)) {
                this.paddlePos.x += PADDLE_SPEED;
            }
        }

        // Keep the paddle on the screen no matter how it moved.
        // Math.floor makes sure we store a whole number, not a fraction of a pixel.
        const maxX = this.screen.x - PADDLE_WIDTH;
        if (this.paddlePos.x < 0) {
            this.paddlePos.x = 0;
        }
        if (this.paddlePos.x > maxX) {
            this.paddlePos.x = maxX;
        }

        // Every SPAWN_EVERY steps, drop a new block at a random spot along the top.
        if (BT.ticks % SPAWN_EVERY === 0) {
            const x = Math.floor(Math.random() * (this.screen.x - ITEM_SIZE));
            this.items.push(new Vector2i(x, -ITEM_SIZE));
        }

        // The paddle as a rectangle, used to check for catches.
        const paddleRect = new Rect2i(this.paddlePos.x, this.paddlePos.y, PADDLE_WIDTH, PADDLE_HEIGHT);

        // Move each block down, then decide: caught, missed, or still falling.
        /** @type {Vector2i[]} */
        const stillFalling = [];
        for (const item of this.items) {
            item.y += ITEM_FALL_SPEED;
            const itemRect = new Rect2i(item.x, item.y, ITEM_SIZE, ITEM_SIZE);

            if (paddleRect.isIntersecting(itemRect)) {
                this.score += 1; // the paddle touched it: caught
            } else if (item.y > this.screen.y) {
                this.lives -= 1; // it fell off the bottom: missed
            } else {
                stillFalling.push(item); // still on its way down
            }
        }
        this.items = stillFalling;

        // Out of lives? Start a fresh game.
        if (this.lives <= 0) {
            this.score = 0;
            this.lives = STARTING_LIVES;
            this.items = [];
        }
    }

    render() {
        // Paint the background first. This also erases last frame's drawing.
        BT.clear(COLOR_BACKGROUND);

        // Draw every falling block.
        for (const item of this.items) {
            BT.drawRectFill(new Rect2i(item.x, item.y, ITEM_SIZE, ITEM_SIZE), COLOR_ITEM);
        }

        // Draw the paddle.
        BT.drawRectFill(new Rect2i(this.paddlePos.x, this.paddlePos.y, PADDLE_WIDTH, PADDLE_HEIGHT), COLOR_PADDLE);

        // Show the score and lives in the top-left corner.
        BT.systemPrint(new Vector2i(6, 6), COLOR_TEXT, `Score ${this.score}`);
        BT.systemPrint(new Vector2i(6, 18), COLOR_TEXT, `Lives ${this.lives}`);
    }

    // Optional hot-reload hook (engine 1.4.0+). The blit386() Vite plugin calls this after a
    // save that re-runs init() (or after a method-only swap). Use the snapshot to keep score
    // and other fields when you tweak init(). Leave it commented until you need it.
    // Full detail: docs/hot-reload.md
    //
    // onHotReload(context) {
    //     // Only restore after a re-init (not after a method-only swap).
    //     if (context.reason !== 'reinit' || !context.snapshot) {
    //         return;
    //     }
    //     if (typeof context.snapshot.score === 'number') {
    //         this.score = context.snapshot.score;
    //     }
    //     if (typeof context.snapshot.lives === 'number') {
    //         this.lives = context.snapshot.lives;
    //     }
    // }
}

// Hand the Game class to BLIT386. It builds one game, runs init() once, then update() and render() about 60 times a second.
bootstrap(Game);
