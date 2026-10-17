/*

Coordinate Patterns: an endless world that remembers nothing at all.
@description An endless world computed from hash1i, hash2i, and hash3i that stores no tiles, yet never changes.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Keyboard Input: https://demos.blit386.dev/keyboard-input
  - Snake Game: https://demos.blit386.dev/snake-game
  - Seeded Worlds: https://demos.blit386.dev/seeded-worlds

Live version: https://demos.blit386.dev/coordinate-patterns

Guides:
  - Random: https://blit386.dev/docs/guides/random#procedural-patterns-from-coordinates
  - Input: https://blit386.dev/docs/guides/input#keyboard

Reference:
  - Random: https://blit386.dev/docs/api/random#coordinate-hashing

---

WHAT YOU WILL SEE
-----------------

A 640x480 screen. Along the top runs a strip of thin blue bars, one per screen column.
Below it sits a window of 32-pixel tiles in four kinds of ground - water, rock, forest,
and grass - with small pale dots (the "rocks") scattered over about one tile in five. Two
panels sit at the bottom: "Travel" on the left and "This world" on the right.

You can scroll around forever with the arrow keys, the on-screen D-pad, or a swipe. Press
"Jump far" to fling yourself 4000 tiles away, then "Home" to come straight back - and find
every tile exactly where you left it.

Nothing was saved. The demo stores zero tiles. Each square works out what it is from
nothing but its own position.

WHAT YOU WILL LEARN
-------------------

- hash1i(x, seed) turns one whole number into a scrambled-but-repeatable number.
- hash2i(x, y, seed) does the same for a pair, which is what a tile map needs.
- hash3i(x, y, z, seed) adds a third number, so you get a whole new set of answers.
- All three hand back an unsigned 32-bit number, from 0 up to about 4.3 billion; the %
  remainder squashes it into a range you can use.
- "Stateless" means the answer is worked out fresh every time, never looked up.
- BT.isKeyDown(code) reads a held arrow key, and isCapturingKeyboardScroll in configure()
  keeps the browser page from scrolling along with it.
- ui.dpad.isDown(direction), ui.dpadWidget(), and ui.swipe() from the shared UI kit give
  touch screens the same controls.

HOW THIS DIFFERS FROM SEEDED WORLDS
-----------------------------------

The Seeded Worlds demo rolls its hills and trees once and keeps the list in memory:
https://demos.blit386.dev/seeded-worlds

This demo keeps nothing. Ask about tile (4000, -812) and it answers instantly, without
ever having visited it. That is how games fit worlds far too big for memory.

WHY DOES IT LOOK LIKE STATIC?
-----------------------------

Every tile is scrambled on its own, so a tile knows nothing about its neighbors. That is
why the world looks speckled rather than like real countryside, where a lake is one big
lake instead of scattered puddles. Smoothing that speckle into rolling hills is what the
Noise demo is for: https://demos.blit386.dev/noise

TRY THIS
--------

- Hold an arrow key or a D-pad direction to scroll 6 pixels per update tick, or swipe to
  jump 320 pixels - half the screen - in one go.
- Press J ("Jump far") to travel 128000 pixels right and down - 4000 tiles each way - then
  H ("Home") to return to tile (0, 0). Nothing has moved.
- Drag the "Layer" slider from 0 to 8 and watch closely. The ground comes from hash2i,
  which only knows x and y, so the landscape stays put. The dots come from hash3i, which
  also knows the layer, so they change completely. Same place, different detail: that is
  the third number at work.
- The "stored" readout says "0 tiles" however far you go.

*/

import { bootstrap, BT, Color32, hash1i, hash2i, hash3i, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// This demo runs at a doubled screen size of 640x480 "game pixels" (the engine default is
// 320x240), so every layout constant below is twice the size it would be at the default.
const DISPLAY_W = 640;
const DISPLAY_H = 480;

// The seed for this whole world. Change this one number and every tile everywhere becomes
// something else.
const WORLD_SEED = 20260730;

// The 1D strip along the top: one bar per screen column.
const STRIP_Y = 28;
const STRIP_H = 44;

// The tile grid below it.
const TILE = 32;
const GRID_Y = 90;
const GRID_H = 400;

// How fast holding a direction scrolls, in pixels per update tick.
const SCROLL_SPEED = 6;

// A swipe throws you this many pixels, and "Jump far" this many.
const SWIPE_DISTANCE = 320;
const JUMP_DISTANCE = 128000;

// How many layers the slider can reach.
const LAYER_MAX = 8;

// Color slots. The shared UI kit owns slots 240-251, so scene colors stay well below
// that.
const C_BG = 1; // background behind everything
const C_STRIP = 2; // the 1D bars along the top
const C_INK = 3; // frames and bright marks
const C_DIM = 4; // faded lines
const C_ROCK_DOT = 5; // the little decorations that hash3i places

// The four kinds of ground, in slots 10-13. The order matters: the number a tile hashes
// to is compared against the thresholds below in this same order.
const C_TERRAIN_BASE = 10;
const TERRAIN_WATER = 0;
const TERRAIN_ROCK = 1;
const TERRAIN_TREE = 2;
const TERRAIN_GRASS = 3;

// Works out what kind of ground sits at a tile, using nothing but the tile's position.
// `tx` and `ty` are the tile column and row; either can be any whole number, including
// huge and negative ones. Returns one of the TERRAIN_* values.
//
// There is no list of tiles anywhere in this demo. This function is the world: hand it a
// position and it hands back the ground, the same answer every time, forever.
function terrainAt(tx, ty) {
    // hash2i scrambles the two coordinates together into a big number. "Scrambled" is the
    // point: neighboring tiles get wildly different answers, so the world looks random
    // even though nothing random ever happened.
    //
    // The number can be up to about 4.3 billion, which is far too big to be useful.
    // Taking the remainder after dividing by 100 (that is what % does) squashes it down
    // to 0-99, which is easy to split into slices.
    const value = hash2i(tx, ty, WORLD_SEED) % 100;

    if (value < 12) {
        return TERRAIN_WATER; // 12 tiles in every 100
    }

    if (value < 26) {
        return TERRAIN_ROCK; // 14 in every 100
    }

    if (value < 42) {
        return TERRAIN_TREE; // 16 in every 100
    }

    return TERRAIN_GRASS; // the remaining 58
}

// An endless scrollable world computed from coordinates, storing nothing.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Slot map for the shared UI kit theme, filled in by applyTheme() during init().
    theme = null;

    // Where we are looking, measured in world pixels, left to right. Together with camY
    // this is the only thing the demo remembers about the world - and it is a position,
    // not a map.
    camX = 0;

    // Where we are looking, top to bottom.
    camY = 0;

    // Which layer the third hash coordinate is reading.
    layer = 0;

    // Runs the demo at 640x480. Arrow keys normally scroll the browser page, but this
    // demo uses them to scroll the world instead, so it asks the engine to keep the page
    // still while you play.
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            isCapturingKeyboardScroll: true,
        };
    }

    // Builds the palette. There is no world to build - that is the whole idea.
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(12, 14, 22)); // background
        this.palette.set(C_STRIP, new Color32(126, 195, 255)); // 1D bars
        this.palette.set(C_INK, new Color32(226, 232, 244)); // frames and marks
        this.palette.set(C_DIM, new Color32(64, 72, 92)); // faded lines
        this.palette.set(C_ROCK_DOT, new Color32(232, 214, 160)); // hash3i decorations

        // The four kinds of ground: water, rock, forest, and grass.
        this.palette.set(C_TERRAIN_BASE + TERRAIN_WATER, new Color32(44, 82, 140));
        this.palette.set(C_TERRAIN_BASE + TERRAIN_ROCK, new Color32(104, 104, 112));
        this.palette.set(C_TERRAIN_BASE + TERRAIN_TREE, new Color32(52, 118, 68));
        this.palette.set(C_TERRAIN_BASE + TERRAIN_GRASS, new Color32(86, 150, 84));

        // Install the shared UI colors, then hand the finished palette to the engine.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        return true;
    }

    // Moves the view. Nothing else changes, because there is nothing else.
    update() {
        // Always first: this latches key shortcuts, the D-pad, and the swipe recognizer.
        ui.tick();

        // Held keys and the on-screen D-pad both scroll. isKeyDown is "held right now",
        // which is safe to read from either update() or render() - unlike a key press,
        // which is a one-off event and must be read here.
        if (BT.isKeyDown('ArrowLeft') || ui.dpad.isDown('left')) {
            this.camX -= SCROLL_SPEED;
        }

        if (BT.isKeyDown('ArrowRight') || ui.dpad.isDown('right')) {
            this.camX += SCROLL_SPEED;
        }

        if (BT.isKeyDown('ArrowUp') || ui.dpad.isDown('up')) {
            this.camY -= SCROLL_SPEED;
        }

        if (BT.isKeyDown('ArrowDown') || ui.dpad.isDown('down')) {
            this.camY += SCROLL_SPEED;
        }

        // A swipe throws the view half a screen's width (320 pixels) in one go, so a
        // phone can cover ground without holding anything down. Swiping left pulls the
        // world left, so the view moves right - the same way a photo moves under your
        // finger.
        const swipe = ui.swipe();

        if (swipe === 'left') {
            this.camX += SWIPE_DISTANCE;
        } else if (swipe === 'right') {
            this.camX -= SWIPE_DISTANCE;
        } else if (swipe === 'up') {
            this.camY += SWIPE_DISTANCE;
        } else if (swipe === 'down') {
            this.camY -= SWIPE_DISTANCE;
        }
    }

    // Draws the 1D strip, the tile grid, and the panels.
    render() {
        BT.clear(C_BG);

        this.renderStrip();
        this.renderGrid();

        ui.caption(8, 8, 'hash1i: one number in', { color: 'dim' });
        ui.caption(8, STRIP_Y + STRIP_H + 8, 'hash2i and hash3i: a whole world', { color: 'dim' });

        this.renderControlPanel();
        this.renderReadoutPanel();

        // The D-pad draws itself and appears once the demo has seen a touch.
        ui.dpadWidget();
    }

    // Draws one bar per screen column, using the 1D hash.
    renderStrip() {
        for (let sx = 0; sx < DISPLAY_W; sx++) {
            // The bar belongs to a world column, not a screen column, so it scrolls with
            // the view instead of sitting still. Math.floor keeps it a whole number even
            // when the camera is at a negative position.
            const worldColumn = Math.floor(this.camX) + sx;

            // Same trick as the tiles: scramble the coordinate, then squash the huge
            // result down to a height that fits the strip.
            const height = hash1i(worldColumn, WORLD_SEED) % STRIP_H;

            BT.drawLine(new Vector2i(sx, STRIP_Y + STRIP_H), new Vector2i(sx, STRIP_Y + STRIP_H - height), C_STRIP);
        }

        // A faint baseline under the strip.
        BT.drawLine(new Vector2i(0, STRIP_Y + STRIP_H + 1), new Vector2i(DISPLAY_W - 1, STRIP_Y + STRIP_H + 1), C_DIM);
    }

    // Draws every tile currently on screen, working each one out from its position.
    renderGrid() {
        // Which tile is under the top-left corner of the view, and how far into that tile
        // we are. The leftover is what makes scrolling look smooth instead of jumping a
        // whole tile at a time.
        const firstTileX = Math.floor(this.camX / TILE);
        const firstTileY = Math.floor(this.camY / TILE);
        const offsetX = this.camX - firstTileX * TILE;
        const offsetY = this.camY - firstTileY * TILE;

        // One extra column and row so the partly-visible tiles at the edges still get
        // drawn.
        const cols = Math.ceil(DISPLAY_W / TILE) + 1;
        const rows = Math.ceil(GRID_H / TILE) + 1;

        // The grid is a window cut into the middle of the screen, not the whole screen,
        // so the rows at its top and bottom have to be trimmed to fit. Skipping this lets
        // tiles spill over the frame and cover the caption above and the panels below.
        const gridBottom = GRID_Y + GRID_H;

        for (let row = 0; row < rows; row++) {
            const tileTop = GRID_Y + row * TILE - offsetY;

            // Keep only the slice of this row that lands inside the window.
            const visibleTop = Math.max(tileTop, GRID_Y);
            const visibleH = Math.min(tileTop + TILE, gridBottom) - visibleTop;

            // A row that ended up entirely outside the window has nothing to draw.
            if (visibleH <= 0) {
                continue;
            }

            for (let col = 0; col < cols; col++) {
                const tx = firstTileX + col;
                const ty = firstTileY + row;

                const screenX = col * TILE - offsetX;

                // Left and right need no such care: those edges are the screen itself,
                // and the engine already ignores whatever hangs off it.
                BT.drawRectFill(new Rect2i(screenX, visibleTop, TILE, visibleH), C_TERRAIN_BASE + terrainAt(tx, ty));

                // The decoration is the only thing that knows about the layer. hash3i
                // takes a third coordinate, so changing the layer gives a completely
                // different answer for the very same tile - while the ground underneath,
                // which came from hash2i, does not budge. One tile in five (a remainder
                // under 20 out of 100) gets a 6x6 dot.
                //
                // A dot is too small to be worth trimming, so one that would poke outside
                // the window is simply left out.
                const dotY = tileTop + 12;

                if (dotY >= GRID_Y && dotY + 6 <= gridBottom && hash3i(tx, ty, this.layer, WORLD_SEED) % 100 < 20) {
                    BT.drawRectFill(new Rect2i(screenX + 12, dotY, 6, 6), C_ROCK_DOT);
                }
            }
        }

        // A frame around the grid, drawn last so it sits on top of the tiles.
        BT.drawRect(new Rect2i(0, GRID_Y, DISPLAY_W, GRID_H), C_DIM);
    }

    // The travel buttons.
    renderControlPanel() {
        ui.begin(UI_ANCHORS.BOTTOM_LEFT);
        ui.panel('Travel');

        if (ui.button('Jump far', { key: 'KeyJ' })) {
            // Thousands of tiles in one step. A world held in memory could not do this -
            // there would be nothing out there yet. Here there is nothing to prepare.
            this.camX += JUMP_DISTANCE;
            this.camY += JUMP_DISTANCE;
        }

        if (ui.button('Home', { key: 'KeyH' })) {
            // Coming home proves the point: the tiles are exactly as they were, because
            // they were never stored and never had a chance to drift.
            this.camX = 0;
            this.camY = 0;
        }

        ui.label('Arrows, D-pad, or swipe', { color: 'dim' });
        ui.end();
    }

    // Where we are, what layer we are on, and the number that matters most.
    renderReadoutPanel() {
        ui.begin(UI_ANCHORS.BOTTOM_RIGHT);
        ui.panel('This world');
        ui.kv('tile x', Math.floor(this.camX / TILE));
        ui.kv('tile y', Math.floor(this.camY / TILE));

        // The headline. However far you travel, this never moves off zero.
        ui.kv('stored', '0 tiles');

        // The slider answers a number anywhere in its range; rounding snaps it to whole
        // layers, so the knob steps instead of sliding between two different worlds.
        this.layer = Math.round(ui.slider('Layer', this.layer, { min: 0, max: LAYER_MAX }));

        ui.separator();
        ui.label('Ground ignores the layer.', { color: 'dim' });
        ui.label('Rocks do not.', { color: 'dim' });
        ui.end();
    }
}

bootstrap(Demo);
