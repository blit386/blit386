/*

Starfield: parallax scrolling stars that feel like 3D depth.
@description Parallax scrolling stars at several speeds, so a flat two-dimensional field reads as real depth.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Colors: https://demos.blit386.dev/colors

Live version: https://demos.blit386.dev/starfield

Guides:
  - Game loop: https://blit386.dev/docs/guides/game-loop#smoothing-motion-between-updates
  - Random: https://blit386.dev/docs/guides/random#deterministic-by-default
  - Overlay: https://blit386.dev/docs/guides/overlay#colors-and-hud-palette-slots

Reference:
  - Rendering: https://blit386.dev/docs/api/rendering#primitives
  - Game loop: https://blit386.dev/docs/api/game-loop#interpolating-render-state-with-renderalpha
  - Random: https://blit386.dev/docs/api/random#engine-default-btrandom

---

WHAT YOU WILL SEE
-----------------

A very dark blue-black sky with 60 gray stars sliding to the left in three layers:

  - Far: 30 dim single pixels, slow (0.3 to 0.5 pixels per tick).
  - Medium: 20 brighter single pixels, faster (0.8 to 1.2 pixels per tick).
  - Near: 10 bright 2x2 squares, fastest (1.5 to 2.5 pixels per tick).

When a star leaves the left edge it reappears just past the right edge on a new row, so
the sky never runs out. Every few seconds a shooting star streaks across the upper half of
the screen: a short white line racing left and slightly down at 14 pixels per tick. Three
dim lines of text in the top-left corner name the layers.

Stars that are "far away" move slowly and look dim and tiny. Stars that are "close" move
fast and look bright and a little bigger. Your brain reads that mix as depth, even though
the screen is flat. Two everyday comparisons:

  - Car window: nearby trees zip past, but faraway mountains barely move.
  - Train window: the fence right beside the tracks blurs by, houses farther back drift
    slowly, and distant hills almost look still.

WHAT YOU WILL LEARN
-------------------

- Arrays of simple objects: each star remembers x, y, speed, brightness, and a palette
  slot.
- Parallax: fake depth by changing speed, size, and brightness together.
- Wrapping: when a star leaves the left side, jump it to the right for an endless sky.
- BT.random.float(min, max) and BT.random.intInclusive(min, max) for random positions,
  speeds, and brightness.
- Smooth motion with BT.renderAlpha: update() moves the stars in fixed ticks, and render()
  blends each star between its previous and current position so nothing hops.
- A shooting star: a fast diagonal line drawn with BT.drawLine().
- Turning on the engine overlay's timing chart from configure() and picking its colors.

HOW COLORS WORK IN THIS DEMO
----------------------------

Every star has its own brightness, a gray level from 80 (dim) to 255 (white). Instead of
making a new Color32 every frame, init() registers each star's gray in the palette once
(slots 10 to 69, one per star) and stores the slot number on the star. render() just
reads that slot number - no Color32 objects are created per frame.

The three label lines are drawn with the shared UI kit (src/shared/ui.js), so their color
and spacing match every other demo. applyTheme() puts the kit's colors in slots 240 and
up, far above this demo's slots 2 to 69.

The engine splits work the usual way: update() moves things; render() only draws. See the
Basics demo for the full story: https://demos.blit386.dev/basics

TRY THIS
--------

- Press the backquote key (`) to open the engine overlay. The timing chart band is turned
  on by configure(): the pale blue bars are update() time and the white bars are render()
  time, so you can watch what 60 moving stars cost.

*/

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

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

// Where in the palette we start registering individual star colors. Each star gets its
// own slot so brightness variety is preserved exactly. We have 30 + 20 + 10 = 60 stars,
// using slots 10 to 69.
const SLOT_START = 10;

// Static color slots.
const C_BG = 2; // deep space background (very dark blue-black)
const C_CHART_TEXT = 3; // light blue-white: overlay text and timing chart update bars
const C_CHART_WARN = 4; // dim blue-gray: overlay timing chart warning color
const C_CHART_TAG = 5; // even dimmer: overlay timing chart tag labels
const C_STREAK = 7; // cool white for the shooting star streak

// Parallax starfield with three layers plus an occasional shooting star.
class Demo {
    // The palette holds all colors used in this demo.
    /** @type {Palette | null} */
    palette = null;

    // Slot map for the shared UI kit theme, filled in init() by applyTheme(). The kit's
    // label widgets draw with these colors automatically.
    theme = null;

    // Three separate arrays. Each entry is a plain object: { x, y, prevX, prevY, speed,
    // brightness, paletteIndex }. paletteIndex is the slot number registered in init().
    farLayer = [];
    mediumLayer = [];
    nearLayer = [];

    // Shooting star: not an array - only one at a time, or none. When active is false, we
    // ignore the numbers until we spawn again. prevHeadX/prevHeadY remember the head
    // position at the START of the most recent update() tick, before this tick's
    // movement. render() blends between them and headX/headY using BT.renderAlpha so the
    // streak glides smoothly between ticks instead of hopping in 14-pixel jumps.
    streak = {
        active: false,
        headX: 0,
        headY: 0,
        prevHeadX: 0,
        prevHeadY: 0,
    };

    // Counts how many update() ticks passed since the last shooting star (for timing).
    ticksSinceShoot = 0;

    // After a shooting star finishes, wait this many ticks before launching the next one.
    nextShootDelay = 200;

    // Shows the timing chart while many stars move each frame (useful for spotting render
    // spikes), and picks palette slots for the overlay bars and chart colors.
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

    // Sets up the palette and creates the star layers. The order matters:
    //   1. Create the palette and register the static colors.
    //   2. Build the star layers (this decides each star's brightness).
    //   3. Register each star's gray in the palette and store the slot on the star.
    //   4. BT.paletteSet() - tell the engine to use this palette.
    async init() {
        console.log('[StarfieldDemo] Initializing...');

        // Step 1: create the palette and the static colors.
        this.palette = BT.paletteCreate(256);

        // Deep space (very dark blue-black), then three grays for the overlay text and
        // timing chart (update bars, warnings, tag labels), then a cool white for the
        // streak.
        this.palette.set(C_BG, new Color32(4, 6, 18));
        this.palette.set(C_CHART_TEXT, new Color32(200, 210, 230));
        this.palette.set(C_CHART_WARN, new Color32(140, 150, 170));
        this.palette.set(C_CHART_TAG, new Color32(110, 120, 140));
        this.palette.set(C_STREAK, new Color32(230, 240, 255));

        // Step 2: build the three star layers. Each call picks random positions, speeds,
        // and brightness values in the given ranges.
        //   Far stars: slow (0.3 to 0.5 pixels per tick), dim (brightness 80 to 120).
        //   Medium stars: medium speed (0.8 to 1.2), brighter (150 to 200).
        //   Near stars: fast (1.5 to 2.5), bright (220 to 255).
        this.farLayer = this.createLayerData(FAR_COUNT, 0.3, 0.5, 80, 120);
        this.mediumLayer = this.createLayerData(MEDIUM_COUNT, 0.8, 1.2, 150, 200);
        this.nearLayer = this.createLayerData(NEAR_COUNT, 1.5, 2.5, 220, 255);

        // Step 3: register each star's color in the palette. We walk all three layers in
        // one pass, giving each star its own slot number. new Color32(b, b, b) makes a
        // neutral gray: equal red, green, and blue.
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

        // Install the shared UI kit theme. applyTheme() writes twelve UI colors into high
        // palette slots (240 and up), far above this demo's slots (2 to 69), so the star
        // colors and the UI colors never fight over the same slots.
        this.theme = applyTheme(this.palette);

        // Step 4: activate the palette.
        BT.paletteSet(this.palette);

        // Start the shooting-star timer at a pleasant "about 200 ticks" delay. int()
        // picks a whole number from the first value up to, but not including, the second.
        this.ticksSinceShoot = 0;
        this.nextShootDelay = BT.random.int(180, 220);

        console.log('[StarfieldDemo] Ready.');
        return true;
    }

    // Fixed-step game logic: slide every star left, wrap the ones that left the screen,
    // and spawn or advance the shooting star.
    update() {
        // Move the three layers. The second argument is how wide the star is, for the
        // "gone off the left?" check.
        this.moveLayer(this.farLayer, 1);
        this.moveLayer(this.mediumLayer, 1);
        this.moveLayer(this.nearLayer, NEAR_STAR_SIZE);

        this.updateStreak();
    }

    // Draws the sky, the stars (back to front), the shooting streak, then the text labels
    // on top. Notice: no Color32 objects appear here. Every draw call uses a palette
    // index.
    render() {
        // Deep space background.
        BT.clear(C_BG);

        // Draw back to front so near stars cover far ones, like real depth. Far and
        // medium stars are single pixels (size 1); near stars are bigger blocks.
        this.drawLayer(this.farLayer, 1);
        this.drawLayer(this.mediumLayer, 1);
        this.drawLayer(this.nearLayer, NEAR_STAR_SIZE);
        this.drawStreak();
        this.drawLabels();
    }

    // Builds one layer's raw data: `count` stars with random positions, speeds, and
    // brightness. Returns objects with { x, y, prevX, prevY, speed, brightness,
    // paletteIndex } - paletteIndex is filled in later by init() once the palette is
    // ready. BT.random is the engine's shared random number generator; float() returns a
    // decimal from the first value up to (but not including) the second.
    createLayerData(count, speedMin, speedMax, brightMin, brightMax) {
        const layer = [];

        for (let i = 0; i < count; i++) {
            // Spread stars across the whole sky at the start so the screen looks full.
            const x = BT.random.float(0, DISPLAY_W);
            const y = BT.random.float(0, DISPLAY_H);

            // Speed: how many pixels left per update tick (a decimal keeps motion
            // smooth).
            const speed = BT.random.float(speedMin, speedMax);

            // Brightness: 0 = black, 255 = white. Used to make a gray Color32.
            // intInclusive() gives a whole number and, unlike int(), the top value is a
            // possible answer too - so the brightest stars really can hit brightMax.
            const brightness = BT.random.intInclusive(brightMin, brightMax);

            // paletteIndex starts at 0; init() fills it in after palette setup.
            // prevX/prevY start equal to x/y - see moveLayer() for how they update.
            layer.push({ x, y, prevX: x, prevY: y, speed, brightness, paletteIndex: 0 });
        }

        return layer;
    }

    // Moves every star in one layer to the left by its speed, then wraps it if it exited
    // on the left. `wrapW` is how many pixels wide the drawn star is.
    moveLayer(layer, wrapW) {
        for (let i = 0; i < layer.length; i++) {
            const star = layer[i];

            // Remember where the star was before this tick moves it, so render() can draw
            // a smooth in-between position instead of a pop.
            star.prevX = star.x;
            star.prevY = star.y;

            // Left means subtract from x (the origin is at the top-left of the screen).
            star.x -= star.speed;

            // If the whole star is past the left edge, teleport it to the right. Think of
            // a conveyor belt: exit left, re-enter right on a fresh row.
            if (star.x < -wrapW) {
                star.x = BT.random.float(DISPLAY_W, DISPLAY_W + 40);
                star.y = BT.random.float(0, DISPLAY_H);

                // Snap prevX/prevY to the teleported spot too. Without this, render()
                // would blend from the old off-screen-left position all the way across to
                // the new one, drawing a streak clear across the sky.
                star.prevX = star.x;
                star.prevY = star.y;
            }
        }
    }

    // Starts a new streak when the timer runs out, or moves the current one until it
    // leaves the screen.
    updateStreak() {
        if (this.streak.active) {
            // Remember the head's position before this tick moves it.
            this.streak.prevHeadX = this.streak.headX;
            this.streak.prevHeadY = this.streak.headY;

            // Very fast compared to normal stars - 14 pixels per tick.
            this.streak.headX -= 14;

            // A gentle downward drift sells the "falling" look.
            this.streak.headY += 0.7;

            // Once the head is well past the left edge, turn it off and reset the timer.
            if (this.streak.headX < -24) {
                this.streak.active = false;
                this.ticksSinceShoot = 0;
                this.nextShootDelay = BT.random.int(180, 240);
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

    // Places a new streak just beyond the right edge so it flies across the sky.
    spawnStreak() {
        this.streak.active = true;

        // Start slightly off-screen to the right so it enters smoothly.
        this.streak.headX = BT.random.float(DISPLAY_W + 10, DISPLAY_W + 70);

        // Keep it in the upper half so it reads as "sky" above the labels.
        this.streak.headY = BT.random.float(16, 16 + DISPLAY_H * 0.45);

        // Snap prevHeadX/prevHeadY to the spawn point too, so the very first render after
        // spawning does not blend in from wherever the last streak died.
        this.streak.prevHeadX = this.streak.headX;
        this.streak.prevHeadY = this.streak.headY;
    }

    // Draws a short bright line: the tail trails behind the head along the direction of
    // motion. Uses the static C_STREAK palette slot registered in init().
    drawStreak() {
        if (!this.streak.active) {
            return;
        }

        // Blend the head's previous and current tick position by BT.renderAlpha - a
        // fraction from 0 (a tick just finished) to just under 1 (the next tick is about
        // to happen) - so the streak's drawn position matches this exact render moment
        // instead of only its last-tick position.
        const alpha = BT.renderAlpha;
        const hx = Math.floor(this.streak.prevHeadX + (this.streak.headX - this.streak.prevHeadX) * alpha);
        const hy = Math.floor(this.streak.prevHeadY + (this.streak.headY - this.streak.prevHeadY) * alpha);

        // The tail sits to the right and a little up because we move left and down.
        const tailX = hx + 14;
        const tailY = hy - 4;

        // C_STREAK is the cool white color registered in init().
        BT.drawLine(new Vector2i(tailX, tailY), new Vector2i(hx, hy), C_STREAK);
    }

    // Draws one layer of stars. All three layers share the same movement math; only the
    // drawn size differs, so one method handles them all. `size` is the star's width and
    // height in pixels: 1 draws a single pixel, anything bigger draws a filled square
    // (near stars use NEAR_STAR_SIZE). Each star's paletteIndex was set in init() to
    // point at its own gray shade.
    drawLayer(layer, size) {
        // Blend each star's previous and current tick position by BT.renderAlpha - a
        // fraction from 0 (a tick just finished) to just under 1 (the next tick is about
        // to happen) - so the star's drawn position matches this exact render moment
        // instead of only its last-tick position.
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

    // Explains the three layers with the shared UI kit (drawn last so the text stays
    // readable). We skip ui.panel() on purpose: without it the group is just floating
    // text, which keeps the sky visible behind the caption instead of covering it with a
    // box.
    drawLabels() {
        ui.begin(UI_ANCHORS.TOP_LEFT);
        ui.label('FAR: slow, dim, 1 pixel', { color: 'dim' });
        ui.label('MED: faster, brighter pixel', { color: 'dim' });
        ui.label('NEAR: fastest, bright 2x2 block', { color: 'dim' });
        ui.end();
    }
}

// bootstrap finds your canvas, constructs Demo, and runs the game loop for you.
bootstrap(Demo);
