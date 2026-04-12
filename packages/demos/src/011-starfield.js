// Demo 011 -- Starfield: parallax scrolling stars that feel like 3D depth.
//
// Demo 011 in the Blit-Tech demo series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics     https://vancura.dev/articles/blit-tech-basics
//   002-Primitives https://vancura.dev/articles/blit-tech-primitives
//   003-Colors     https://vancura.dev/articles/blit-tech-colors
//
// Live article: https://vancura.dev/articles/blit-tech-starfield
//
// WHAT YOU WILL SEE
// Three layers of stars scroll to the left at different speeds. Stars that are
// "far away" move slowly and look dim and tiny. Stars that are "close" move fast
// and look bright and a little bigger. Your brain reads that mix as depth, even
// though the screen is flat -- like looking out a car window: nearby trees zip
// past, but faraway mountains barely seem to move.
//
// WHAT YOU WILL LEARN
//   - Arrays of simple objects (each star remembers x, y, speed, and a palette slot)
//   - Parallax: fake depth by changing speed, size, and brightness together
//   - Wrapping: when a star leaves the left side, jump it to the right (endless sky)
//   - A shooting star: a fast diagonal line drawn with BT.drawLine
//
// HOW COLORS WORK IN THIS DEMO
// Every star has a unique brightness (how bright its gray color is). Instead of
// making a new Color32 every frame, we register each star's gray color in the
// palette once at startup and store the palette slot number on the star.
// render() just reads that slot number -- no Color32 objects needed per frame.
//
// The engine splits work the usual way: update() moves things; render() only draws.
// See the Basics demo for the full story: https://vancura.dev/articles/blit-tech-basics

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// Logical screen size in "game pixels".
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// How many stars live in each layer. Far = many tiny dots; near = fewer, brighter blobs.
const FAR_STAR_COUNT = 30;
const MEDIUM_STAR_COUNT = 20;
const NEAR_STAR_COUNT = 10;

// Near stars are drawn as a small solid square this many pixels wide and tall.
const NEAR_STAR_SIZE = 2;

// Where in the palette we start registering individual star colors.
// Each star gets its own slot so brightness variety is preserved exactly.
// We have 30 + 20 + 10 = 60 stars, using slots 10..69.
const STAR_SLOT_START = 10;

// Static color slots.
const C_WHITE = 1; // White -- font base color.
const C_BG = 2; // Deep space background (very dark blue-black).
const C_TITLE = 3; // Light blue-white for the title text.
const C_LABEL = 4; // Dim blue-gray for the layer description lines.
const C_TIP = 5; // Even dimmer for the tip at the bottom.
const C_FPS = 6; // Dimmer still for the FPS counter.
const C_STREAK = 7; // Cool white for the shooting star streak.

// #endregion

// #region Demo Class

/**
 * Parallax starfield with three layers plus an occasional shooting star.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // The palette holds all colors used in this demo.
    palette = null;

    // Three separate arrays. Each entry is a plain object:
    // { x, y, speed, paletteIndex }
    // paletteIndex is the slot number registered during initialize().
    farStars = [];
    mediumStars = [];
    nearStars = [];

    // Shooting star: not an array -- only one at a time, or none.
    // When active is false, we ignore the numbers until we spawn again.
    shootingStar = {
        active: false,
        headX: 0,
        headY: 0,
    };

    // Counts how many update() ticks passed since the last shooting star (for timing).
    ticksSinceShoot = 0;

    // After a shooting star finishes, wait this many ticks before planning the next one.
    nextShootDelay = 200;

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Tell Blit-Tech how big the internal display is, how big the HTML canvas looks,
     * and how many logic updates to aim for per second.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    queryHardware() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            canvasDisplaySize: new Vector2i(640, 480),
            targetFPS: 60,
        };
    }

    /**
     * Sets up the palette and creates star layers.
     *
     * IMPORTANT ORDER:
     *   1. Create palette and register static colors.
     *   2. Build the star layers (this decides each star's brightness).
     *   3. Register each star's gray color in the palette, store the slot on the star.
     *   4. BT.paletteSet() -- tell the engine to use this palette.
     *
     * @returns {Promise<boolean>}
     */
    async initialize() {
        console.log('[StarfieldDemo] Initializing...');

        // --- Step 1: Create palette and static colors ---
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(255, 255, 255));
        this.palette.set(C_BG, new Color32(4, 6, 18)); // Deep space: very dark blue-black.
        this.palette.set(C_TITLE, new Color32(200, 210, 230)); // Light blue-white title.
        this.palette.set(C_LABEL, new Color32(140, 150, 170)); // Dim blue-gray labels.
        this.palette.set(C_TIP, new Color32(110, 120, 140)); // Dimmer tip text.
        this.palette.set(C_FPS, new Color32(90, 95, 110)); // Very dim FPS counter.
        this.palette.set(C_STREAK, new Color32(230, 240, 255)); // Cool white shooting streak.

        // --- Step 2: Build the three star layers ---
        // Each helper picks random positions, speeds, and brightness values in the given ranges.
        // Far stars: slow (0.3..0.5 pixels/tick), dim (80..120 brightness).
        // Medium stars: medium (0.8..1.2), brighter (150..200).
        // Near stars: fast (1.5..2.5), bright (220..255).
        this.farStars = this.createStarLayerData(FAR_STAR_COUNT, 0.3, 0.5, 80, 120);
        this.mediumStars = this.createStarLayerData(MEDIUM_STAR_COUNT, 0.8, 1.2, 150, 200);
        this.nearStars = this.createStarLayerData(NEAR_STAR_COUNT, 1.5, 2.5, 220, 255);

        // --- Step 3: Register each star's color in the palette ---
        // We walk all three layers in one pass, giving each star its own slot number.
        // new Color32(b, b, b) makes a neutral gray: equal red, green, and blue.
        let slot = STAR_SLOT_START;

        for (const star of this.farStars) {
            const b = star.brightness;
            this.palette.set(slot, new Color32(b, b, b));
            star.paletteIndex = slot;
            slot++;
        }

        for (const star of this.mediumStars) {
            const b = star.brightness;
            this.palette.set(slot, new Color32(b, b, b));
            star.paletteIndex = slot;
            slot++;
        }

        for (const star of this.nearStars) {
            const b = star.brightness;
            this.palette.set(slot, new Color32(b, b, b));
            star.paletteIndex = slot;
            slot++;
        }

        // --- Activate the palette ---
        BT.paletteSet(this.palette);

        // Start the shooting-star timer at a pleasant "about 200 ticks" delay.
        this.ticksSinceShoot = 0;
        this.nextShootDelay = 180 + Math.floor(Math.random() * 40);

        console.log('[StarfieldDemo] Ready.');
        return true;
    }

    /**
     * Fixed-step game logic: slide every star left, wrap off-screen ones,
     * and maybe spawn or advance the shooting star.
     */
    update() {
        // Move the three layers. wrapW is how wide the star is for "gone off the left?" checks.
        this.moveStarLayer(this.farStars, 1);
        this.moveStarLayer(this.mediumStars, 1);
        this.moveStarLayer(this.nearStars, NEAR_STAR_SIZE);

        this.updateShootingStar();
    }

    /**
     * Draw sky, stars (back to front), shooting streak, then text labels on top.
     * Notice: NO Color32 objects appear here. Every draw call uses a palette index number.
     */
    render() {
        // Deep space background.
        BT.clear(C_BG);

        // Draw back to front so near stars visually cover far ones, like real depth.
        this.drawFarStars();
        this.drawMediumStars();
        this.drawNearStars();
        this.drawShootingStar();
        this.drawLabels();
    }

    // #endregion

    // #region Star Creation and Movement

    /**
     * Build one layer's raw data: count stars with random positions and brightness.
     * Returns objects with { x, y, speed, brightness } -- paletteIndex is added later
     * in initialize() once the palette is ready.
     *
     * Math.random() returns a fraction from 0 up to (but not including) 1.
     *
     * @param {number} count
     * @param {number} speedMin
     * @param {number} speedMax
     * @param {number} brightMin
     * @param {number} brightMax
     * @returns {Array<{x: number, y: number, speed: number, brightness: number, paletteIndex: number}>}
     */
    createStarLayerData(count, speedMin, speedMax, brightMin, brightMax) {
        const layer = [];

        for (let i = 0; i < count; i++) {
            // Spread stars across the whole sky at the start so the screen looks full.
            const x = Math.random() * DISPLAY_W;
            const y = Math.random() * DISPLAY_H;

            // Speed: how many pixels left per update tick (float keeps motion smooth).
            const speed = speedMin + Math.random() * (speedMax - speedMin);

            // Brightness: 0 = black, 255 = white. Used to make a gray Color32.
            const brightness = Math.floor(brightMin + Math.random() * (brightMax - brightMin + 1));

            // paletteIndex starts at 0; initialize() will fill it in after palette setup.
            layer.push({ x, y, speed, brightness, paletteIndex: 0 });
        }

        return layer;
    }

    /**
     * Move every star in one layer to the left by its speed, then wrap if it exited left.
     *
     * @param {Array<{x: number, y: number, speed: number, brightness: number, paletteIndex: number}>} layer
     * @param {number} wrapW how many pixels wide the drawable star occupies (for wrapping)
     */
    moveStarLayer(layer, wrapW) {
        for (let i = 0; i < layer.length; i++) {
            const star = layer[i];

            // Left means subtract from x (the origin is at the top-left of the screen).
            star.x -= star.speed;

            // If the whole star is past the left edge, teleport it to the right.
            // Think of a conveyor belt: exit left, re-enter right with a fresh row position.
            if (star.x < -wrapW) {
                star.x = DISPLAY_W + Math.random() * 40;
                star.y = Math.random() * DISPLAY_H;
            }
        }
    }

    // #endregion

    // #region Shooting Star

    /**
     * Maybe start a new streak, or move the current one until it leaves the screen.
     */
    updateShootingStar() {
        if (this.shootingStar.active) {
            // Very fast compared to normal stars -- several pixels per tick.
            this.shootingStar.headX -= 14;

            // A gentle downward drift sells the "falling" look.
            this.shootingStar.headY += 0.7;

            // Once the head is well past the left edge, turn it off and reset the timer.
            if (this.shootingStar.headX < -24) {
                this.shootingStar.active = false;
                this.ticksSinceShoot = 0;
                this.nextShootDelay = 180 + Math.floor(Math.random() * 60);
            }

            return;
        }

        // No active streak: count ticks until the next launch window.
        this.ticksSinceShoot += 1;

        if (this.ticksSinceShoot >= this.nextShootDelay) {
            this.spawnShootingStar();
            this.ticksSinceShoot = 0;
        }
    }

    /**
     * Place a new streak just beyond the right edge so it flies across the sky.
     */
    spawnShootingStar() {
        this.shootingStar.active = true;
        // Start slightly off-screen to the right so it enters smoothly.
        this.shootingStar.headX = DISPLAY_W + 10 + Math.random() * 60;
        // Keep it in the upper half so it reads as "sky" above the labels.
        this.shootingStar.headY = 16 + Math.random() * (DISPLAY_H * 0.45);
    }

    /**
     * Draw a short bright line: tail behind the head along the motion direction.
     * Uses the static C_STREAK palette slot registered in initialize().
     */
    drawShootingStar() {
        if (!this.shootingStar.active) {
            return;
        }

        const hx = Math.floor(this.shootingStar.headX);
        const hy = Math.floor(this.shootingStar.headY);

        // Tail sits to the right and a little up because we move left and down each tick.
        const tailX = hx + 14;
        const tailY = hy - 4;

        // C_STREAK is the cool white color registered in initialize().
        BT.drawLine(new Vector2i(tailX, tailY), new Vector2i(hx, hy), C_STREAK);
    }

    // #endregion

    // #region Drawing Star Layers

    /**
     * Farthest layer: one pixel per star (BT.drawPixel), dim gray range.
     * Each star's paletteIndex was set in initialize() to point at its unique gray shade.
     */
    drawFarStars() {
        for (let i = 0; i < this.farStars.length; i++) {
            const star = this.farStars[i];
            BT.drawPixel(new Vector2i(Math.floor(star.x), Math.floor(star.y)), star.paletteIndex);
        }
    }

    /**
     * Middle layer: still single pixels, but brighter.
     */
    drawMediumStars() {
        for (let i = 0; i < this.mediumStars.length; i++) {
            const star = this.mediumStars[i];
            BT.drawPixel(new Vector2i(Math.floor(star.x), Math.floor(star.y)), star.paletteIndex);
        }
    }

    /**
     * Closest layer: filled rectangle (NEAR_STAR_SIZE x NEAR_STAR_SIZE) so stars look bigger.
     */
    drawNearStars() {
        for (let i = 0; i < this.nearStars.length; i++) {
            const star = this.nearStars[i];
            const px = Math.floor(star.x);
            const py = Math.floor(star.y);

            BT.drawRectFill(new Rect2i(px, py, NEAR_STAR_SIZE, NEAR_STAR_SIZE), star.paletteIndex);
        }
    }

    // #endregion

    // #region Labels

    /**
     * Explain the three layers using the system font (drawn last so text stays readable).
     * systemPrint takes (position, paletteIndex, text).
     */
    drawLabels() {
        BT.systemPrint(new Vector2i(8, 6), C_TITLE, 'STARFIELD (PARALLAX)');

        // One line per layer so readers can match words to what they see moving.
        BT.systemPrint(new Vector2i(8, 22), C_LABEL, 'FAR: slow, dim, 1 pixel');
        BT.systemPrint(new Vector2i(8, 38), C_LABEL, 'MED: faster, brighter pixel');
        BT.systemPrint(new Vector2i(8, 54), C_LABEL, 'NEAR: fastest, bright 2x2 block');

        BT.systemPrint(new Vector2i(8, 200), C_TIP, 'Tip: like a car window -- close stuff moves faster.');

        BT.systemPrint(new Vector2i(230, 220), C_FPS, `FPS: ${BT.fps()}`);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// bootstrap finds your canvas, constructs Demo, and runs the game loop for you.
bootstrap(Demo);

// #endregion
