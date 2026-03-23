// Bouncing Square -- a simple Blit-Tech demo.

import { BitmapFont, bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/**
 * The demo class.
 * This class is used to create a bouncing square demo.
 */
class Demo {
    // Where the square is on screen (x, y). Gets set to the center in initialize().
    pos = new Vector2i(160, 120);

    // How fast the square moves (x speed, y speed).
    speed = new Vector2i(2, 1);

    // How big the square is in pixels (width, height).
    size = new Vector2i(16, 16);

    // How many times the square has bounced; every time it hits a wall, this increments.
    bounces = 0;

    // The font we use to draw text.
    font = null;

    /**
     * Queries the hardware for display size and other settings.
     *
     * @returns {object} An object with displaySize, canvasDisplaySize, and targetFPS properties.
     */
    queryHardware() {
        return {
            displaySize: new Vector2i(320, 240), // the size of the visible screen in pixels
            canvasDisplaySize: new Vector2i(640, 480), // the size of the canvas in pixels (double resolution)
            targetFPS: 60, // the target frames per second
        };
    }

    /**
     * Sets up the demo before the game starts: loads the font and places the square in the center.
     * The engine waits for this to finish before calling update() or render().
     */
    async initialize() {
        // Load a font so we can draw text on screen.
        this.font = await BitmapFont.load('/fonts/PragmataPro14.btfont');

        // Put the square in the middle of the screen.
        // Vector2i truncates fractional values via |0, ensuring integer pixel positions
        // even when displaySize or size dimensions are odd.
        const screen = BT.displaySize();
        const x = Math.floor(screen.x / 2 - this.size.x / 2);
        const y = Math.floor(screen.y / 2 - this.size.y / 2);
        this.pos = new Vector2i(x, y);

        // Return true to indicate initialization is complete.
        return true;
    }

    /**
     * Moves the square and checks if it hit a wall. The engine calls this 60 times per second
     * to keep the game running at a steady speed, no matter how fast the computer is.
     */
    update() {
        // Move the square.
        this.pos = this.pos.add(this.speed);

        // Bounce off left and right walls.
        if (this.pos.x <= 0 || this.pos.x >= BT.displaySize().x - this.size.x) {
            this.speed.x = -this.speed.x;
            this.bounces++;
        }

        // Bounce off top and bottom walls.
        if (this.pos.y <= 0 || this.pos.y >= BT.displaySize().y - this.size.y) {
            this.speed.y = -this.speed.y;
            this.bounces++;
        }
    }

    /**
     * Draws everything on screen. The engine calls this once for every frame the browser
     * shows. If you switch to a different tab, the browser slows it down automatically.
     */
    render() {
        // Fill the screen with dark blue.
        BT.clear(new Color32(0, 0, 40));

        // Draw the white square.
        BT.drawRectFill(new Rect2i(this.pos.x, this.pos.y, this.size.x, this.size.y), Color32.white());

        // Draw a line from the center of the screen to the square.
        const center = BT.displaySize().div(2);
        BT.drawLine(center, this.pos, Color32.white());

        // Show some info on screen.
        BT.printFont(this.font, new Vector2i(10, 10), `FPS: ${BT.fps()}`, Color32.white());
        BT.printFont(this.font, new Vector2i(10, 26), `Position: ${this.pos.x} x ${this.pos.y}`, Color32.white());
        BT.printFont(this.font, new Vector2i(10, 42), `Bounces: ${this.bounces}`, Color32.blue());
    }
}

// Start the demo!
bootstrap(Demo);
