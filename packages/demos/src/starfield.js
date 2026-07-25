// Demo 011 - Starfield: parallax scrolling stars that feel like 3D depth.
//
// Demo 011 in the BLIT386 demo series (written for readers about 12 years old).
//
// Prerequisites:
//   001-Basics     https://demos.blit386.dev/001-basics
//   002-Primitives https://demos.blit386.dev/002-primitives
//   003-Colors     https://demos.blit386.dev/003-colors
//
// Live article: https://vancura.dev/articles/blit386-starfield
//
// WHAT YOU WILL SEE
// Three layers of stars scroll to the left at different speeds. Stars that are
// "far away" move slowly and look dim and tiny. Stars that are "close" move fast
// and look bright and a little bigger. Your brain reads that mix as depth, even
// though the screen is flat. Two everyday comparisons:
//   - Car window: nearby trees zip past, but faraway mountains barely move.
//   - Train window: the fence right beside the tracks blurs by, houses farther
//     back drift slowly, and distant hills almost look still.
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
// render() just reads that slot number - no Color32 objects needed per frame.
//
// The three explainer lines in the corner are drawn with the shared UI kit
// (src/shared/ui.js), so their colors and spacing match every other demo.
//
// The engine splits work the usual way: update() moves things; render() only draws.
// See the Basics demo for the full story: https://demos.blit386.dev/001-basics

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Logical screen size in "game pixels".
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// How many stars live in each layer. Far = many tiny dots; near = fewer, brighter blobs.
const FAR_COUNT = 30;
const MEDIUM_COUNT = 20;
const NEAR_COUNT = 10;

// Near stars are drawn as a small solid square this many pixels wide and tall.
const NEAR_STAR_SIZE = 2;

// Where in the palette we start registering individual star colors.
// Each star gets its own slot so brightness variety is preserved exactly.
// We have 30 + 20 + 10 = 60 stars, using slots 10..69.
const SLOT_START = 10;

// Static color slots.
const C_BG = 2; // Deep space background (very dark blue-black).
const C_CHART_TEXT = 3; // Light blue-white: overlay text and timing chart update bars.
const C_CHART_WARN = 4; // Dim blue-gray: overlay timing chart warning color.
const C_CHART_TAG = 5; // Even dimmer: overlay timing chart tag labels.
const C_STREAK = 7; // Cool white for the shooting star streak.

/**
 * Parallax starfield with three layers plus an occasional shooting star.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // The palette holds all colors used in this demo.
    /** @type {Palette | null} */
    palette = null;

    // Slot map for the shared UI kit theme, filled in init() by applyTheme().
    // The kit's label widgets draw with these colors automatically.
    theme = null;

    // Three separate arrays. Each entry is a plain object:
    // { x, y, speed, paletteIndex }
    // paletteIndex is the slot number registered during init().
    farLayer = [];
    mediumLayer = [];
    nearLayer = [];

    // Shooting star: not an array - only one at a time, or none.
    // When active is false, we ignore the numbers until we spawn again.
    // prevHeadX/prevHeadY remember the head position at the START of the most recent
    // update() tick, before this tick's movement. render() blends between them and
    // headX/headY using BT.renderAlpha so the streak glides smoothly between physics
    // ticks instead of hopping in 14px jumps - see "Interpolating render state with
    // renderAlpha" in the engine's docs/api-game-loop.md.
    streak = {
        active: false,
        headX: 0,
        headY: 0,
        prevHeadX: 0,
        prevHeadY: 0,
    };

    // Counts how many update() ticks passed since the last shooting star (for timing).
    ticksSinceShoot = 0;

    // After a shooting star finishes, wait this many ticks before planning the next one.
    nextShootDelay = 200;

    /**
     * Shows the timing chart while many stars move each frame (useful for spotting render spikes).
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayTimingChartEnabled: true,
            overlayStyle: {
                barPaletteIndex: C_BG,
                textPaletteIndex: C_CHART_TEXT,
                gapPaletteIndex: C_BG,
            },
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_CHART_TEXT,
                renderBarPaletteIndex: C_STREAK,
                warningPaletteIndex: C_CHART_WARN,
                errorPaletteIndex: C_STREAK,
                tagPaletteIndex: C_CHART_TAG,
            },
        };
    }

    /**
     * Sets up the palette and creates star layers.
     *
     * IMPORTANT ORDER:
     *   1. Create palette and register static colors.
     *   2. Build the star layers (this decides each star's brightness).
     *   3. Register each star's gray color in the palette, store the slot on the star.
     *   4. BT.paletteSet() - tell the engine to use this palette.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        console.log('[StarfieldDemo] Initializing...');

        // Step 1: Create palette and static colors
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(4, 6, 18)); // Deep space: very dark blue-black.
        this.palette.set(C_CHART_TEXT, new Color32(200, 210, 230)); // Overlay text and chart update bars.
        this.palette.set(C_CHART_WARN, new Color32(140, 150, 170)); // Dim blue-gray chart warnings.
        this.palette.set(C_CHART_TAG, new Color32(110, 120, 140)); // Dimmer chart tag labels.
        this.palette.set(C_STREAK, new Color32(230, 240, 255)); // Cool white shooting streak.

        // Step 2: Build the three star layers
        // Each helper picks random positions, speeds, and brightness values in the given ranges.
        // Far stars: slow (0.3..0.5 pixels/tick), dim (80..120 brightness).
        // Medium stars: medium (0.8..1.2), brighter (150..200).
        // Near stars: fast (1.5..2.5), bright (220..255).
        this.farLayer = this.createLayerData(FAR_COUNT, 0.3, 0.5, 80, 120);
        this.mediumLayer = this.createLayerData(MEDIUM_COUNT, 0.8, 1.2, 150, 200);
        this.nearLayer = this.createLayerData(NEAR_COUNT, 1.5, 2.5, 220, 255);

        // Step 3: Register each star's color in the palette
        // We walk all three layers in one pass, giving each star its own slot number.
        // new Color32(b, b, b) makes a neutral gray: equal red, green, and blue.
        let slot = SLOT_START;

        for (const star of this.farLayer) {
            const b = star.brightness;
            this.palette.set(slot, new Color32(b, b, b));
            star.paletteIndex = slot;
            slot++;
        }

        for (const star of this.mediumLayer) {
            const b = star.brightness;
            this.palette.set(slot, new Color32(b, b, b));
            star.paletteIndex = slot;
            slot++;
        }

        for (const star of this.nearLayer) {
            const b = star.brightness;
            this.palette.set(slot, new Color32(b, b, b));
            star.paletteIndex = slot;
            slot++;
        }

        // Install the shared UI kit theme. applyTheme() writes twelve UI colors into
        // high palette slots (240 and up), far above this demo's scene slots (1..69),
        // so the star colors and the UI colors never fight over the same slots.
        this.theme = applyTheme(this.palette);

        // Activate the palette
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
        this.moveLayer(this.farLayer, 1);
        this.moveLayer(this.mediumLayer, 1);
        this.moveLayer(this.nearLayer, NEAR_STAR_SIZE);

        this.updateStreak();
    }

    /**
     * Draw sky, stars (back to front), shooting streak, then text labels on top.
     * Notice: NO Color32 objects appear here. Every draw call uses a palette index number.
     */
    render() {
        // Deep space background.
        BT.clear(C_BG);

        // Draw back to front so near stars visually cover far ones, like real depth.
        // Far and medium stars are single pixels (size 1); near stars are bigger blocks.
        this.drawLayer(this.farLayer, 1);
        this.drawLayer(this.mediumLayer, 1);
        this.drawLayer(this.nearLayer, NEAR_STAR_SIZE);
        this.drawStreak();
        this.drawLabels();
    }

    /**
     * Build one layer's raw data: count stars with random positions and brightness.
     * Returns objects with { x, y, speed, brightness } - paletteIndex is added later
     * in init() once the palette is ready.
     *
     * Math.random() returns a fraction from 0 up to (but not including) 1.
     *
     * @param {number} count
     * @param {number} speedMin
     * @param {number} speedMax
     * @param {number} brightMin
     * @param {number} brightMax
     * @returns {Array<{x: number, y: number, prevX: number, prevY: number, speed: number, brightness: number, paletteIndex: number}>}
     */
    createLayerData(count, speedMin, speedMax, brightMin, brightMax) {
        const layer = [];

        for (let i = 0; i < count; i++) {
            // Spread stars across the whole sky at the start so the screen looks full.
            const x = Math.random() * DISPLAY_W;
            const y = Math.random() * DISPLAY_H;

            // Speed: how many pixels left per update tick (float keeps motion smooth).
            const speed = speedMin + Math.random() * (speedMax - speedMin);

            // Brightness: 0 = black, 255 = white. Used to make a gray Color32.
            const brightness = Math.floor(brightMin + Math.random() * (brightMax - brightMin + 1));

            // paletteIndex starts at 0; init() will fill it in after palette setup.
            // prevX/prevY start equal to x/y - see moveLayer() for how they update.
            layer.push({ x, y, prevX: x, prevY: y, speed, brightness, paletteIndex: 0 });
        }

        return layer;
    }

    /**
     * Move every star in one layer to the left by its speed, then wrap if it exited left.
     *
     * @param {Array<{x: number, y: number, speed: number, brightness: number, paletteIndex: number}>} layer
     * @param {number} wrapW how many pixels wide the drawable star occupies (for wrapping)
     */
    moveLayer(layer, wrapW) {
        for (let i = 0; i < layer.length; i++) {
            const star = layer[i];

            // Remember where the star was before this tick moves it, so render() can
            // draw a smooth in-between position instead of a pop.
            star.prevX = star.x;
            star.prevY = star.y;

            // Left means subtract from x (the origin is at the top-left of the screen).
            star.x -= star.speed;

            // If the whole star is past the left edge, teleport it to the right.
            // Think of a conveyor belt: exit left, re-enter right with a fresh row position.
            if (star.x < -wrapW) {
                star.x = DISPLAY_W + Math.random() * 40;
                star.y = Math.random() * DISPLAY_H;

                // Snap prevX/prevY to match the teleported spot too. Without this,
                // render() would blend from the old off-screen-left position all the
                // way across to the new one, drawing a streak clear across the sky.
                star.prevX = star.x;
                star.prevY = star.y;
            }
        }
    }

    /**
     * Maybe start a new streak, or move the current one until it leaves the screen.
     */
    updateStreak() {
        if (this.streak.active) {
            // Remember the head's position before this tick moves it.
            this.streak.prevHeadX = this.streak.headX;
            this.streak.prevHeadY = this.streak.headY;

            // Very fast compared to normal stars - several pixels per tick.
            this.streak.headX -= 14;

            // A gentle downward drift sells the "falling" look.
            this.streak.headY += 0.7;

            // Once the head is well past the left edge, turn it off and reset the timer.
            if (this.streak.headX < -24) {
                this.streak.active = false;
                this.ticksSinceShoot = 0;
                this.nextShootDelay = 180 + Math.floor(Math.random() * 60);
            }

            return;
        }

        // No active streak: count ticks until the next launch window.
        this.ticksSinceShoot += 1;

        if (this.ticksSinceShoot >= this.nextShootDelay) {
            this.spawnStreak();
            this.ticksSinceShoot = 0;
        }
    }

    /**
     * Place a new streak just beyond the right edge so it flies across the sky.
     */
    spawnStreak() {
        this.streak.active = true;
        // Start slightly off-screen to the right so it enters smoothly.
        this.streak.headX = DISPLAY_W + 10 + Math.random() * 60;
        // Keep it in the upper half so it reads as "sky" above the labels.
        this.streak.headY = 16 + Math.random() * (DISPLAY_H * 0.45);

        // Snap prevHeadX/prevHeadY to the spawn point too, so the very first render
        // after spawning does not blend in from wherever the last streak died.
        this.streak.prevHeadX = this.streak.headX;
        this.streak.prevHeadY = this.streak.headY;
    }

    /**
     * Draw a short bright line: tail behind the head along the motion direction.
     * Uses the static C_STREAK palette slot registered in init().
     */
    drawStreak() {
        if (!this.streak.active) {
            return;
        }

        // Blend the head's previous and current tick position by BT.renderAlpha - a
        // fraction from 0 (a tick just finished) to just under 1 (the next tick is
        // about to happen) - so the streak's drawn position matches this exact render
        // moment instead of only its last-tick position.
        const alpha = BT.renderAlpha;
        const hx = Math.floor(this.streak.prevHeadX + (this.streak.headX - this.streak.prevHeadX) * alpha);
        const hy = Math.floor(this.streak.prevHeadY + (this.streak.headY - this.streak.prevHeadY) * alpha);

        // Tail sits to the right and a little up because we move left and down each tick.
        const tailX = hx + 14;
        const tailY = hy - 4;

        // C_STREAK is the cool white color registered in init().
        BT.drawLine(new Vector2i(tailX, tailY), new Vector2i(hx, hy), C_STREAK);
    }

    /**
     * Draws one layer of stars. All three layers share the same movement math;
     * only the drawn size differs, so one method handles them all.
     * Each star's paletteIndex was set in init() to point at its unique gray shade.
     *
     * @param {Array<{x: number, y: number, prevX: number, prevY: number, paletteIndex: number}>} layer
     * @param {number} size - Star width and height in pixels: 1 draws a single pixel,
     *   anything bigger draws a filled square (near stars use NEAR_STAR_SIZE).
     */
    drawLayer(layer, size) {
        // Blend each star's previous and current tick position by BT.renderAlpha - a
        // fraction from 0 (a tick just finished) to just under 1 (the next tick is
        // about to happen) - so the star's drawn position matches this exact render
        // moment instead of only its last-tick position.
        const alpha = BT.renderAlpha;

        for (let i = 0; i < layer.length; i++) {
            const star = layer[i];
            const px = Math.floor(star.prevX + (star.x - star.prevX) * alpha);
            const py = Math.floor(star.prevY + (star.y - star.prevY) * alpha);

            if (size === 1) {
                BT.drawPixel(new Vector2i(px, py), star.paletteIndex);
            } else {
                BT.drawRectFill(new Rect2i(px, py, size, size), star.paletteIndex);
            }
        }
    }

    /**
     * Explain the three layers with the shared UI kit (drawn last so text stays readable).
     * We skip ui.panel() on purpose: without it the group is just floating text, which
     * keeps the sky visible behind the caption instead of covering it with a box.
     */
    drawLabels() {
        ui.begin('topLeft');
        ui.label('FAR: slow, dim, 1 pixel', { color: 'dim' });
        ui.label('MED: faster, brighter pixel', { color: 'dim' });
        ui.label('NEAR: fastest, bright 2x2 block', { color: 'dim' });
        ui.end();
    }
}

// bootstrap finds your canvas, constructs Demo, and runs the game loop for you.
bootstrap(Demo);
