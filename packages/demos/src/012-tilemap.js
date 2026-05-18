// Demo 012 - Tilemap: build a grid world from a 2D array and scroll the camera across it.
//
// Prerequisites: 001-Basics (https://vancura.dev/articles/blit-tech-basics),
// 002-Primitives (https://vancura.dev/articles/blit-tech-primitives),
// 007-Camera (https://vancura.dev/articles/blit-tech-camera),
// 008-Sprites (https://vancura.dev/articles/blit-tech-sprites) - same idea of arranging
// art on a grid, but here we use colored rectangles instead of a sprite sheet image.
//
// Live walkthrough: https://vancura.dev/articles/blit-tech-tilemap
//
// A "tilemap" is like a floor made of same-sized square tiles. Each cell in a 2D array
// (a list of rows, each row a list of columns) stores a small number that means "which
// kind of tile goes here" - like a Lego instruction sheet that says which brick color
// fits each stud. The computer walks the grid with nested loops (one loop for rows,
// one loop for columns) and draws only the tiles the camera can see, which is faster
// than drawing thousands of off-screen tiles nobody would see.
//
// This demo uses a 30 by 20 tile world (480 by 320 pixels at 16 pixels per tile). The
// visible screen is only 320 by 240, so the camera slowly pans so you can explore the
// whole map. A mini-map in the corner shows the full world and the yellow box is the
// part you are looking at right now.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

// These numbers are the "tile IDs" stored inside the 2D array.
// Using named constants helps you remember what each number means when you read the map.
const TILE_SKY = 0; // Empty air - we skip drawing and let the sky clear color show through.
const TILE_GRASS = 1; // Green ground.
const TILE_DIRT = 2; // Brown earth below or beside grass.
const TILE_STONE = 3; // Gray rocks.
const TILE_WATER = 4; // Blue water (we animate the shade a little each frame).
const TILE_TREE_TOP = 5; // Dark green tree canopy.

// How many tiles wide and tall the world is. Multiply by TILE_SIZE to get pixel size.
const MAP_WIDTH_TILES = 30;
const MAP_HEIGHT_TILES = 20;

// Every tile is a small square on a pixel grid. 16 is a common retro size.
const TILE_SIZE = 16;

// World size in pixels: 30 * 16 = 480 wide, 20 * 16 = 320 tall.
const WORLD_WIDTH_PX = MAP_WIDTH_TILES * TILE_SIZE;
const WORLD_HEIGHT_PX = MAP_HEIGHT_TILES * TILE_SIZE;

// Each color in this demo has a reserved palette slot (a number from 1 upward).
// Index 0 is always transparent. Giving each slot a name makes the drawing code
// easier to read - "draw in C_GRASS" is clearer than "draw in index 5."
const C_WHITE = 1; // Pure white: font base color, mini-map border
const C_SKY = 2; // Soft sky blue: fills the screen background
const C_HUD_BAR = 3; // Semi-transparent black: the dark bar behind the HUD text
const C_TEXT_DIM = 4; // Dimmed white: subtitle and secondary text
const C_GRASS = 5; // Green: grass tiles
const C_DIRT = 6; // Brown: dirt tiles
const C_STONE = 7; // Gray: stone/rock tiles
const C_TREE_TOP = 8; // Dark green: tree canopy tiles
const C_MINIMAP_WATER = 9; // Static blue: water color on the mini-map (not animated)
const C_MINIMAP_BG = 10; // Very dark semi-transparent: mini-map background panel
const C_MINIMAP_BORDER = 11; // Near-white: mini-map panel border
const C_VIEWPORT = 12; // Yellow: rectangle showing the camera view on the mini-map
const C_FPS = 13; // Dim gray: the FPS counter text color
const C_WATER = 14; // DYNAMIC: the animated water tile color, updated every tick in update()

// #endregion

// #region Main Logic

/**
 * Shows a scrolling tile-based landscape with a mini-map and animated water.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    // tilemap is an array of rows. tilemap[row][column] is one cell.
    // row 0 is the top of the world; column 0 is the left edge.
    // Think of it like a spreadsheet: first index is how far down, second is how far right.
    tilemap = [];

    // cameraPos is the top-left corner of the world (in pixels) that appears at the
    // top-left of the screen. When this moves right, the world seems to slide left.
    cameraPos = new Vector2i(0, 0);

    // palette holds all the colors this demo uses. We fill it in init()
    // so the engine knows every color before drawing begins.
    palette = null;

    // #endregion

    // #region Reusable draw objects

    // One rectangle object we rewrite each time we draw a tile. Reusing it avoids
    // making a new Rect2i for every single tile, which would stress the garbage collector.
    tileRect = new Rect2i(0, 0, TILE_SIZE, TILE_SIZE);

    // Scratch vectors for text positions and similar.
    tempVec = new Vector2i(0, 0);

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Runs once at startup: builds the palette, the tilemap, and loads the font file.
     *
     * @returns {Promise<boolean>} True when the demo is ready to run.
     */
    async init() {
        console.log('[TilemapDemo] Initializing...');

        // Set up the color palette
        // A palette is like an artist's paint tray - we choose all our colors BEFORE
        // drawing anything. Each color gets a number (an "index") that we use in draw calls.
        this.palette = BT.paletteCreate(256);

        // Static (fixed) colors: these never change from frame to frame.
        this.palette.set(C_WHITE, new Color32(255, 255, 255)); // pure white
        this.palette.set(C_SKY, new Color32(135, 206, 250)); // soft sky blue
        this.palette.set(C_HUD_BAR, new Color32(0, 0, 0, 185)); // black with some transparency (alpha 185)
        this.palette.set(C_TEXT_DIM, new Color32(200, 200, 200)); // dimmed white for labels
        this.palette.set(C_GRASS, new Color32(50, 160, 60)); // medium green grass
        this.palette.set(C_DIRT, new Color32(130, 90, 55)); // earthy brown dirt
        this.palette.set(C_STONE, new Color32(120, 120, 130)); // cool gray stone
        this.palette.set(C_TREE_TOP, new Color32(15, 90, 30)); // very dark green canopy
        this.palette.set(C_MINIMAP_WATER, new Color32(30, 110, 200)); // solid blue for mini-map water
        this.palette.set(C_MINIMAP_BG, new Color32(0, 0, 0, 210)); // very dark panel behind mini-map
        this.palette.set(C_MINIMAP_BORDER, new Color32(240, 240, 240)); // near-white border
        this.palette.set(C_VIEWPORT, new Color32(255, 230, 60)); // yellow camera-viewport box
        this.palette.set(C_FPS, new Color32(160, 160, 160)); // medium gray FPS counter

        // Dynamic color: the animated water tile. We give it a starting value here so
        // there is no empty slot on the very first frame before update() runs.
        this.palette.set(C_WATER, new Color32(30, 110, 210)); // initial water blue (updated each tick)

        // Tell the engine to use this palette for all drawing from now on.
        BT.paletteSet(this.palette);

        // Fill tilemap with a simple outdoor scene: sky, grass, dirt, trees, water, rocks.
        this.buildLandscapeTilemap();

        console.log('[TilemapDemo] Initialized');
        return true;
    }

    /**
     * Runs at a fixed rate (60 Hz) for game logic. Moves the camera and updates the
     * animated water color in the palette so render() can use C_WATER as a plain index.
     */
    update() {
        // BT.ticks() counts how many fixed updates have happened since the demo started.
        // Multiplying by a small number makes the wave change slowly over time.
        const t = BT.ticks() * 0.028;

        // Math.sin(t) wiggles forever between -1 and +1, like a gentle wave on water.
        // We scale and shift it so the camera slides horizontally across most of the map.
        // Floor turns the float into a whole pixel position (Blit-Tech uses integer pixels).
        const viewSize = BT.displaySize();
        const maxCamX = WORLD_WIDTH_PX - viewSize.x;
        const maxCamY = WORLD_HEIGHT_PX - viewSize.y;
        const centerX = maxCamX / 2;
        const centerY = maxCamY / 2;
        const amplitudeX = Math.max(0, maxCamX / 2);
        const amplitudeY = Math.max(0, maxCamY / 2);

        this.cameraPos.x = Math.floor(centerX + Math.sin(t) * amplitudeX);
        this.cameraPos.y = Math.floor(centerY + Math.sin(t * 0.65) * amplitudeY);

        // Clamp keeps the camera inside the world so you never see empty void past the edge.
        this.cameraPos = BT.cameraClamp(this.cameraPos, new Vector2i(WORLD_WIDTH_PX, WORLD_HEIGHT_PX), viewSize);

        // From this point until BT.cameraReset(), all drawing uses world coordinates
        // shifted by this offset - like sliding a picture under a fixed window.
        BT.cameraSet(this.cameraPos);

        // Update the animated water color in the palette
        // Instead of computing a new Color32 inside render() every frame, we compute it
        // here in update() and store it in the reserved C_WATER palette slot.
        // render() can then just write C_WATER as a plain number - no Color32 needed there.
        // This "palette animation" technique is how retro hardware made water shimmer!
        const waterPulse = Math.sin(BT.ticks() * 0.12); // a slow gentle wave between -1 and +1
        const waterBlue = Math.floor(210 + waterPulse * 28); // shifts the blue channel 28 units up and down
        this.palette.set(C_WATER, new Color32(30, 110, waterBlue));
    }

    /**
     * Runs once per monitor refresh. Clears the sky, draws visible tiles, then draws HUD
     * in screen space after resetting the camera.
     */
    render() {
        // Soft sky blue behind everything. Tiles with ID 0 (sky) are not drawn, so this
        // color shows through in "empty" cells.
        BT.clear(C_SKY);

        // Draw the chunk of the world that might be visible right now.
        this.renderVisibleTiles();

        // HUD and mini-map should stick to the screen, not scroll away with the world.
        BT.cameraReset();

        this.renderHud();
    }

    // #endregion

    // #region Building the world

    /**
     * Creates the 2D array and paints a simple slice of nature: sky, ground strip, trees,
     * a pond at the bottom, and a few stone patches in the water.
     */
    buildLandscapeTilemap() {
        // Start with a fresh empty array we will push rows into.
        this.tilemap = [];

        // Outer loop: each row is one horizontal line of tiles from left to right.
        for (let row = 0; row < MAP_HEIGHT_TILES; row++) {
            // Inner collection for this row's tile IDs.
            const line = [];

            for (let col = 0; col < MAP_WIDTH_TILES; col++) {
                // Default every cell to sky until we overwrite it below.
                line.push(TILE_SKY);
            }

            // Attach the finished row to the map (rows stack from top to bottom).
            this.tilemap.push(line);
        }

        // Ground band: a few rows of grass and dirt in the middle-lower area.
        const grassRow = 9;
        for (let col = 0; col < MAP_WIDTH_TILES; col++) {
            this.tilemap[grassRow][col] = TILE_GRASS;
            this.tilemap[grassRow + 1][col] = TILE_DIRT;
            this.tilemap[grassRow + 2][col] = TILE_DIRT;
        }

        // Small hills of dirt sticking up into the sky on the left and right.
        for (let col = 2; col < 8; col++) {
            this.tilemap[grassRow - 1][col] = TILE_DIRT;
        }
        for (let col = 22; col < 28; col++) {
            this.tilemap[grassRow - 1][col] = TILE_DIRT;
        }

        // Tree tops sit on top of grass like broccoli on a plate.
        const treeCols = [4, 5, 14, 15, 16, 25, 26];
        for (const col of treeCols) {
            this.tilemap[grassRow - 1][col] = TILE_TREE_TOP;
            this.tilemap[grassRow - 2][col] = TILE_TREE_TOP;
        }
        // Wider tree: two tiles side by side on the second canopy row only.
        this.tilemap[grassRow - 2][6] = TILE_TREE_TOP;
        this.tilemap[grassRow - 2][7] = TILE_TREE_TOP;

        // Lower area: more dirt, then water rows filling the bottom of the map.
        const waterTopRow = 14;
        for (let row = grassRow + 3; row < waterTopRow; row++) {
            for (let col = 0; col < MAP_WIDTH_TILES; col++) {
                this.tilemap[row][col] = TILE_DIRT;
            }
        }

        // Pond: water across the bottom rows.
        for (let row = waterTopRow; row < MAP_HEIGHT_TILES; row++) {
            for (let col = 0; col < MAP_WIDTH_TILES; col++) {
                this.tilemap[row][col] = TILE_WATER;
            }
        }

        // Stepping stones and little islands (stone replaces water in those cells).
        const stoneSpots = [
            [15, 16],
            [15, 17],
            [16, 16],
            [17, 8],
            [17, 9],
            [18, 20],
            [18, 21],
            [19, 12],
            [19, 13],
            [19, 14],
        ];
        for (const [row, col] of stoneSpots) {
            this.tilemap[row][col] = TILE_STONE;
        }

        // One stone tile peeking at the shoreline.
        this.tilemap[waterTopRow - 1][10] = TILE_STONE;
        this.tilemap[waterTopRow - 1][11] = TILE_STONE;
    }

    // #endregion

    // #region World drawing

    /**
     * Figures out which tile rows and columns overlap the screen and draws only those.
     * That is a simple "culling" optimization: work scales with visible tiles, not the
     * whole 30x20 map (though for this small map either way would be fine).
     */
    renderVisibleTiles() {
        // How big is the virtual screen in pixels?
        const viewW = BT.displaySize().x;
        const viewH = BT.displaySize().y;

        // Camera position is the world pixel at the top-left of the view.
        const camX = this.cameraPos.x;
        const camY = this.cameraPos.y;

        // Convert pixel edges to tile indices. Math.floor for the left/top tile,
        // Math.ceil for the pixel just past the right/bottom edge so we include partial tiles.
        const startCol = Math.max(0, Math.floor(camX / TILE_SIZE));
        const startRow = Math.max(0, Math.floor(camY / TILE_SIZE));
        const endCol = Math.min(MAP_WIDTH_TILES - 1, Math.ceil((camX + viewW) / TILE_SIZE) - 1);
        const endRow = Math.min(MAP_HEIGHT_TILES - 1, Math.ceil((camY + viewH) / TILE_SIZE) - 1);

        // Nested loops: outer walks down the rows, inner walks across columns.
        // This visits every visible cell exactly once.
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                // Read which tile kind lives in this grid cell.
                const id = this.tilemap[row][col];

                // Sky tiles are invisible rectangles; the clear color already painted the sky.
                if (id === TILE_SKY) {
                    continue;
                }

                // World pixel position of this tile's top-left corner.
                const worldX = col * TILE_SIZE;
                const worldY = row * TILE_SIZE;

                // Reuse the same Rect2i: set(x, y, width, height).
                this.tileRect.set(worldX, worldY, TILE_SIZE, TILE_SIZE);

                // Pick the palette index for this tile ID. if / else if is like a menu: first match wins.
                // We pass just a number (C_GRASS, C_DIRT, etc.) - the palette knows the actual color.
                if (id === TILE_GRASS) {
                    BT.drawRectFill(this.tileRect, C_GRASS);
                } else if (id === TILE_DIRT) {
                    BT.drawRectFill(this.tileRect, C_DIRT);
                } else if (id === TILE_STONE) {
                    BT.drawRectFill(this.tileRect, C_STONE);
                } else if (id === TILE_WATER) {
                    // C_WATER is the animated water slot - update() already set its color this frame.
                    BT.drawRectFill(this.tileRect, C_WATER);
                } else if (id === TILE_TREE_TOP) {
                    BT.drawRectFill(this.tileRect, C_TREE_TOP);
                }
            }
        }
    }

    // #endregion

    // #region HUD and mini-map

    /**
     * Draws labels and the mini-map after the camera is reset so they stay on the screen.
     */
    renderHud() {
        // Semi-transparent bar at the top so white text stays readable on any tile.
        this.tileRect.set(0, 0, 320, 38);
        BT.drawRectFill(this.tileRect, C_HUD_BAR);

        // systemPrint takes (position, paletteIndex, text).
        this.tempVec.set(8, 8);
        BT.systemPrint(this.tempVec, C_WHITE, 'Tilemap Demo (012)');

        this.tempVec.set(8, 22);
        BT.systemPrint(this.tempVec, C_TEXT_DIM, '30x20 tiles, 16px each, camera scrolls');

        // Mini-map sits in the bottom-right, like a treasure map corner-fold.
        this.renderMiniMap();

        this.tempVec.set(8, 226);
        BT.systemPrint(this.tempVec, C_FPS, `FPS: ${BT.fps()}`);
    }

    /**
     * Scales the whole tilemap down so each tile is a 3x3 pixel square on the HUD.
     * Draws a yellow rectangle around the area the main camera is showing.
     */
    renderMiniMap() {
        const mapX = 218;
        const mapY = 158;
        const scale = 3; // Each world tile becomes a 3 by 3 block on the mini-map.
        const mapPixelW = MAP_WIDTH_TILES * scale;
        const mapPixelH = MAP_HEIGHT_TILES * scale;

        // Backing panel.
        this.tileRect.set(mapX - 2, mapY - 2, mapPixelW + 4, mapPixelH + 4);
        BT.drawRectFill(this.tileRect, C_MINIMAP_BG);
        BT.drawRect(this.tileRect, C_MINIMAP_BORDER);

        // Walk every tile in the entire world (the map is small, so this is cheap).
        for (let row = 0; row < MAP_HEIGHT_TILES; row++) {
            for (let col = 0; col < MAP_WIDTH_TILES; col++) {
                const id = this.tilemap[row][col];
                const px = mapX + col * scale;
                const py = mapY + row * scale;

                // Pick a palette index for each tile type.
                // Using C_SKY for sky tiles shows the background color as the map background.
                // We use C_MINIMAP_WATER for water on the mini-map - this is a static shade,
                // not the animated C_WATER, so the mini-map stays calm even as the tiles shimmer.
                let c = C_SKY;
                if (id === TILE_GRASS) {
                    c = C_GRASS;
                } else if (id === TILE_DIRT) {
                    c = C_DIRT;
                } else if (id === TILE_STONE) {
                    c = C_STONE;
                } else if (id === TILE_WATER) {
                    c = C_MINIMAP_WATER;
                } else if (id === TILE_TREE_TOP) {
                    c = C_TREE_TOP;
                }

                this.tileRect.set(px, py, scale, scale);
                BT.drawRectFill(this.tileRect, c);
            }
        }

        // Viewport indicator: where is the 320x240 window inside the 480x320 world?
        const cam = BT.cameraGet();
        const disp = BT.displaySize();
        const vx = mapX + Math.floor((cam.x / WORLD_WIDTH_PX) * mapPixelW);
        const vy = mapY + Math.floor((cam.y / WORLD_HEIGHT_PX) * mapPixelH);
        const vw = Math.max(1, Math.floor((disp.x / WORLD_WIDTH_PX) * mapPixelW));
        const vh = Math.max(1, Math.floor((disp.y / WORLD_HEIGHT_PX) * mapPixelH));

        this.tileRect.set(vx, vy, vw, vh);
        BT.drawRect(this.tileRect, C_VIEWPORT);
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

// bootstrap() wires this class into the engine: it creates an instance and runs the loop.
bootstrap(Demo);

// #endregion
