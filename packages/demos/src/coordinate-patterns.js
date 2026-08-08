// Coordinate Patterns: an endless world that remembers nothing at all.
//
// Part of the BLIT386 demo series (written for readers about 12 years old).
//
// Prerequisites:
//   Basics        https://demos.blit386.dev/basics
//   Random Basics https://demos.blit386.dev/random-basics
//   Seeded Worlds https://demos.blit386.dev/seeded-worlds
//
// WHAT YOU WILL SEE
// A world you can scroll around forever with the arrow keys, the on-screen D-pad, or a
// swipe. Press "Jump far" to fling yourself thousands of tiles away, then "Home" to come
// straight back – and find every tile exactly where you left it.
//
// Nothing was saved. The demo stores zero tiles. Each square works out what it is from
// nothing but its own position.
//
// WHAT YOU WILL LEARN
//   - hash1i(x, seed) turns one number into a scrambled-but-repeatable number
//   - hash2i(x, y, seed) does the same for a pair, which is what a tile map needs
//   - hash3i(x, y, z, seed) adds a third number, so you get a whole new set of answers
//   - "Stateless" means the answer is worked out fresh every time, never looked up
//
// HOW THIS DIFFERS FROM SEEDED WORLDS
// The Seeded Worlds demo rolls its hills and trees once and keeps the list in memory:
// https://demos.blit386.dev/seeded-worlds
// This demo keeps nothing. Ask about tile (4000, -812) and it answers instantly, without
// ever having visited it. That is how games fit worlds far too big for memory.
//
// WHY IT LOOKS LIKE STATIC
// Every tile is scrambled on its own, so a tile knows nothing about its neighbors. That is
// why the world looks speckled rather than like real countryside, where a lake is one big
// lake instead of scattered puddles. Smoothing that speckle into rolling hills is what the
// Noise demo is for: https://demos.blit386.dev/noise
//
// WATCH THE LAYER SLIDER CLOSELY
// The ground comes from hash2i, which only knows x and y – so sliding the layer leaves the
// landscape untouched. The little rocks come from hash3i, which also knows the layer – so
// they change completely. Same place, different detail: that is the third number at work.
//
// The engine splits work the usual way: update() moves things; render() only draws.
// See the Basics demo for the full story: https://demos.blit386.dev/basics

import { bootstrap, BT, Color32, hash1i, hash2i, hash3i, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */

// This demo runs at the engine's default screen size of 320x240 "game pixels".
const DISPLAY_W = 320;

// The seed for this whole world. Change this one number and every tile everywhere becomes
// something else.
const WORLD_SEED = 20260730;

// The 1D strip along the top: one bar per screen column.
const STRIP_Y = 14;
const STRIP_H = 22;

// The tile grid below it.
const TILE = 16;
const GRID_Y = 44;
const GRID_H = 94;

// How fast holding a direction scrolls, in pixels per update tick.
const SCROLL_SPEED = 3;

// A swipe throws you this many pixels, and "Jump far" this many.
const SWIPE_DISTANCE = 160;
const JUMP_DISTANCE = 64000;

// How many layers the slider can reach.
const LAYER_MAX = 8;

// Color slots. The shared UI kit owns slots 240-251, so scene colors stay well below that.
const C_BG = 1; // Background behind everything.
const C_STRIP = 2; // The 1D bars along the top.
const C_INK = 3; // Frames and bright marks.
const C_DIM = 4; // Faded lines.
const C_ROCK_DOT = 5; // The little decorations that hash3i places.

// The four kinds of ground, in slots 10-13. The order matters: the number a tile hashes to
// is compared against the thresholds below in this same order.
const C_TERRAIN_BASE = 10;
const TERRAIN_WATER = 0;
const TERRAIN_ROCK = 1;
const TERRAIN_TREE = 2;
const TERRAIN_GRASS = 3;

/**
 * Works out what kind of ground sits at a tile, using nothing but the tile's position.
 *
 * There is no list of tiles anywhere in this demo. This function is the world: hand it a
 * position and it hands back the ground, the same answer every time, forever.
 *
 * @param {number} tx – Tile column. Can be any whole number, including huge and negative ones.
 * @param {number} ty – Tile row.
 * @returns {number} One of the TERRAIN_* values.
 */
function terrainAt(tx, ty) {
    // hash2i scrambles the two coordinates together into a big number. "Scrambled" is the
    // point: neighboring tiles get wildly different answers, so the world looks random even
    // though nothing random ever happened.
    //
    // The number can be up to about 4 billion, which is far too big to be useful. Taking the
    // remainder after dividing by 100 (that is what % does) squashes it down to 0-99, which
    // is easy to split into slices.
    const value = hash2i(tx, ty, WORLD_SEED) % 100;

    if (value < 12) {
        return TERRAIN_WATER; // 12 tiles in every 100.
    }

    if (value < 26) {
        return TERRAIN_ROCK; // 14 in every 100.
    }

    if (value < 42) {
        return TERRAIN_TREE; // 16 in every 100.
    }

    return TERRAIN_GRASS; // The remaining 58.
}

/**
 * An endless scrollable world computed from coordinates, storing nothing.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Slot map for the shared UI kit theme, filled in by applyTheme() during init().
    theme = null;

    // Where we are looking, measured in world pixels. These two numbers are the only thing
    // the demo remembers about the world – and they are a position, not a map.
    camX = 0;
    camY = 0;

    // Which layer the third hash coordinate is reading.
    layer = 0;

    /**
     * Builds the palette. There is no world to build – that is the whole idea.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(12, 14, 22)); // Background.
        this.palette.set(C_STRIP, new Color32(126, 195, 255)); // 1D bars.
        this.palette.set(C_INK, new Color32(226, 232, 244)); // Frames and marks.
        this.palette.set(C_DIM, new Color32(64, 72, 92)); // Faded lines.
        this.palette.set(C_ROCK_DOT, new Color32(232, 214, 160)); // hash3i decorations.

        this.palette.set(C_TERRAIN_BASE + TERRAIN_WATER, new Color32(44, 82, 140)); // Water.
        this.palette.set(C_TERRAIN_BASE + TERRAIN_ROCK, new Color32(104, 104, 112)); // Rock.
        this.palette.set(C_TERRAIN_BASE + TERRAIN_TREE, new Color32(52, 118, 68)); // Forest.
        this.palette.set(C_TERRAIN_BASE + TERRAIN_GRASS, new Color32(86, 150, 84)); // Grass.

        // Install the shared UI colors, then hand the finished palette to the engine.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Moves the view. Nothing else changes, because there is nothing else.
     */
    update() {
        // Always first: this latches key shortcuts, the D-pad, and the swipe recognizer.
        ui.tick();

        // Held keys and the on-screen D-pad both scroll. isKeyDown is "held right now", which
        // is safe to read from either update() or render() – unlike a key press, which is a
        // one-off event and must be read here.
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

        // A swipe throws the view a screen's worth in one go, so a phone can cover ground
        // without holding anything down.
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

    /**
     * Draws the 1D strip, the tile grid, and the panels.
     */
    render() {
        BT.clear(C_BG);

        this.renderStrip();
        this.renderGrid();

        ui.caption(4, 4, 'hash1i: one number in', { color: 'dim' });
        ui.caption(4, 34, 'hash2i and hash3i: a whole world', { color: 'dim' });

        this.renderControlPanel();
        this.renderReadoutPanel();

        // The D-pad draws itself and appears once the demo has seen a touch.
        ui.dpadWidget();
    }

    /**
     * Draws one bar per screen column, using the 1D hash.
     */
    renderStrip() {
        for (let sx = 0; sx < DISPLAY_W; sx++) {
            // The bar belongs to a world column, not a screen column, so it scrolls with the
            // view instead of sitting still. Math.floor keeps it a whole number even when the
            // camera is at a negative position.
            const worldColumn = Math.floor(this.camX) + sx;

            // Same trick as the tiles: scramble the coordinate, then squash the huge result
            // down to a height that fits the strip.
            const height = hash1i(worldColumn, WORLD_SEED) % STRIP_H;

            BT.drawLine(new Vector2i(sx, STRIP_Y + STRIP_H), new Vector2i(sx, STRIP_Y + STRIP_H - height), C_STRIP);
        }

        BT.drawLine(new Vector2i(0, STRIP_Y + STRIP_H + 1), new Vector2i(DISPLAY_W - 1, STRIP_Y + STRIP_H + 1), C_DIM);
    }

    /**
     * Draws every tile currently on screen, working each one out from its position.
     */
    renderGrid() {
        // Which tile is under the top-left corner of the view, and how far into that tile we
        // are. The leftover is what makes scrolling look smooth instead of jumping a whole
        // tile at a time.
        const firstTileX = Math.floor(this.camX / TILE);
        const firstTileY = Math.floor(this.camY / TILE);
        const offsetX = this.camX - firstTileX * TILE;
        const offsetY = this.camY - firstTileY * TILE;

        // One extra column and row so the partly-visible tiles at the edges still get drawn.
        const cols = Math.ceil(DISPLAY_W / TILE) + 1;
        const rows = Math.ceil(GRID_H / TILE) + 1;

        // The grid is a window cut into the middle of the screen, not the whole screen, so
        // the rows at its top and bottom have to be trimmed to fit. Skipping this lets tiles
        // spill over the frame and cover the caption above and the panels below.
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

                // Left and right need no such care: those edges are the screen itself, and the
                // engine already ignores whatever hangs off it.
                BT.drawRectFill(new Rect2i(screenX, visibleTop, TILE, visibleH), C_TERRAIN_BASE + terrainAt(tx, ty));

                // The decoration is the only thing that knows about the layer. hash3i takes a
                // third coordinate, so changing the layer gives a completely different answer
                // for the very same tile – while the ground underneath, which came from
                // hash2i, does not budge.
                //
                // A dot is too small to be worth trimming, so one that would poke outside the
                // window is simply left out.
                const dotY = tileTop + 6;

                if (dotY >= GRID_Y && dotY + 3 <= gridBottom && hash3i(tx, ty, this.layer, WORLD_SEED) % 100 < 20) {
                    BT.drawRectFill(new Rect2i(screenX + 6, dotY, 3, 3), C_ROCK_DOT);
                }
            }
        }

        // A frame around the grid, drawn last so it sits on top of the tiles.
        BT.drawRect(new Rect2i(0, GRID_Y, DISPLAY_W, GRID_H), C_DIM);
    }

    /**
     * The travel buttons.
     */
    renderControlPanel() {
        ui.begin('bottomLeft');
        ui.panel('Travel');

        if (ui.button('Jump far', { key: 'KeyJ' })) {
            // Thousands of tiles in one step. A world held in memory could not do this – there
            // would be nothing out there yet. Here there is nothing to prepare.
            this.camX += JUMP_DISTANCE;
            this.camY += JUMP_DISTANCE;
        }

        if (ui.button('Home', { key: 'KeyH' })) {
            // Coming home proves the point: the tiles are exactly as they were, because they
            // were never stored and never had a chance to drift.
            this.camX = 0;
            this.camY = 0;
        }

        ui.label('Arrows, D-pad, or swipe', { color: 'dim' });
        ui.end();
    }

    /**
     * Where we are, what layer we are on, and the number that matters most.
     */
    renderReadoutPanel() {
        ui.begin('bottomRight');
        ui.panel('This world');
        ui.kv('tile x', Math.floor(this.camX / TILE));
        ui.kv('tile y', Math.floor(this.camY / TILE));

        // The headline. However far you travel, this never moves off zero.
        ui.kv('stored', '0 tiles');

        this.layer = Math.round(ui.slider('Layer', this.layer, { min: 0, max: LAYER_MAX }));

        ui.separator();
        ui.label('Ground ignores the layer.', { color: 'dim' });
        ui.label('Rocks do not.', { color: 'dim' });
        ui.end();
    }
}

bootstrap(Demo);
