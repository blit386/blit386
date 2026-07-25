// Demo 007 - Camera: shows how to scroll a view over a world larger than the screen.
//
// Prerequisites: We learned about drawing and the game loop in Demo 001-Basics
// (https://demos.blit386.dev/001-basics) and shapes in Demo 002-Primitives
// (https://demos.blit386.dev/002-primitives).
//
// Live walkthrough: https://vancura.dev/articles/blit386-camera
//
// How BT.cameraSet() works: a positive camera offset shifts the view to the right, so the
// world appears to scroll left on the screen. A positive X offset means the camera is
// looking that many pixels to the right of the world's left edge - for example, an X
// offset of 200 shows the world starting 200 pixels in from the left (like the camera
// moved 200 steps east along the map).
//
// Imagine looking through a window: the window doesn't move, but you can shift
// what part of the outside world you see through it. That's exactly what a camera
// does in a game. The "camera" here is just an offset - how far we've scrolled
// the view to the right and down.
//
// This demo creates a 800x600 pixel world (bigger than the 320x240 screen),
// fills it with random buildings and trees, then automatically scrolls the camera
// along a smooth looping path (Lissajous-style motion from sine and cosine) so you can see
// more of the world.
//
// It also shows a mini-map in the corner that shows where in the world we currently are.
// The title panel in the top-left corner is drawn with the shared UI kit (src/shared/ui.js),
// so it looks the same as the info panels in every other demo.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// Every color in this demo is pre-registered in a numbered palette slot.
// Index 0 is always transparent. Custom colors start at 1.
// We separate static colors (fixed forever) from building colors (20 random ones).
// UI chrome (the title panel and the mini-map frame) uses the shared UI kit theme
// instead, which applyTheme() installs into high palette slots (240 and up).
const C_SKY = 2; // Sky blue: screen background
const C_GRID = 3; // Medium green: grid lines on the ground
const C_WORLD_BORDER = 4; // Red: rectangle around the entire world boundary
const C_TRUNK = 5; // Brown: tree trunk
const C_FOLIAGE = 6; // Dark green: tree foliage fill
const C_FOLIAGE_OUTLINE = 7; // Darker green: tree foliage outline
const C_BUILDING_OUTLINE = 8; // Very dark gray: building border
const C_WINDOW = 9; // Pale yellow (semi-transparent): building windows
const C_PLAYER = 10; // Salmon red: player square fill
const C_PLAYER_OUTLINE = 11; // Darker red: player square border
const C_BUILDING_DOT = 16; // Blue-gray: building dot on the mini-map
const C_VIEWPORT = 17; // Yellow: viewport rectangle on the mini-map
const C_OVERLAY_BAR = 40; // Semi-transparent bar behind overlay custom rows
const C_OVERLAY_TEXT = 41; // Light gray text for camera position in the overlay
const C_OVERLAY_AMBER = 42; // Amber accent for world size in the overlay

// Each of the 20 buildings gets its own randomly chosen color stored at index 20..39.
// We define the base index here so the code stays easy to read.
const C_BUILDING_BASE = 20; // building 0 is at index 20, building 1 at 21, and so on

/**
 * Demonstrates camera scrolling with a procedurally generated city.
 * Buildings and trees are randomly placed; the camera automatically scrolls.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // The total size of the game world in pixels.
    // The screen is only 320x240, but the world is much bigger.
    worldWidth = 800;
    worldHeight = 600;

    // Where the camera is currently looking in world coordinates.
    // (0,0) means the top-left corner of the world is visible.
    cameraPos = new Vector2i(0, 0);

    // Where the camera was at the START of the most recent update() tick, before this
    // tick's sine/cosine math moved it. render() blends between cameraPrevPos and
    // cameraPos using BT.renderAlpha so the camera pans smoothly between physics ticks
    // instead of jumping - see "Interpolating render state with renderAlpha" in the
    // engine's docs/api-game-loop.md.
    cameraPrevPos = new Vector2i(0, 0);

    // Reused every render() call for the render-time (interpolated) camera position,
    // so we do not allocate a new Vector2i every frame.
    cameraRenderPos = new Vector2i(0, 0);

    // A stationary red square we call the "player" - it stays in place
    // while the camera moves around it.
    playerPos = new Vector2i(400, 300);

    // Arrays that store the randomly generated world objects.
    // Each building has a position, size, and a palette colorIndex number.
    // Each tree just has a position.
    buildings = [];
    trees = [];

    // The palette holds all the colors this demo uses.
    /** @type {Palette | null} */
    palette = null;

    // Slot map for the shared UI kit theme, filled in init() by applyTheme().
    // It tells us which palette slots hold the kit's panel, border, and text colors.
    theme = null;

    // Reused every frame for the engine overlay (camera position + world size).
    // We keep one array and update the text strings in place so we do not
    // allocate new objects on every screen refresh.
    overlayRowData = [
        { leftText: 'Camera (0, 0)', textPaletteIndex: C_OVERLAY_TEXT },
        { leftText: 'World 800x600', textPaletteIndex: C_OVERLAY_AMBER },
    ];

    // These objects are reused every frame instead of creating new ones in the draw loop.
    // Reusing objects is faster because the browser doesn't have to reclaim old ones.
    tempVec1 = new Vector2i(0, 0);
    tempVec2 = new Vector2i(0, 0);
    tempRect = new Rect2i(0, 0, 0, 0);
    worldSize = new Vector2i(800, 600); // matches worldWidth/worldHeight above

    /**
     * Called once at the very start. Tells the engine which palette slots to use
     * for the overlay bars (FPS strip, demo title, and custom debug rows).
     *
     * The palette grid shows 32 swatches per row and 2 visible rows (64 colors at
     * a time); scroll the band to browse the rest of the 256-slot palette.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            isOverlayPaletteEnabled: true,
            overlayPaletteColumns: 32,
            overlayPaletteRowsVisible: 2,
            overlayStyle: {
                barPaletteIndex: C_OVERLAY_BAR,
                textPaletteIndex: C_OVERLAY_TEXT,
                gapPaletteIndex: C_OVERLAY_BAR,
            },
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_OVERLAY_TEXT,
                renderBarPaletteIndex: C_OVERLAY_AMBER,
                warningPaletteIndex: C_OVERLAY_AMBER,
                errorPaletteIndex: C_OVERLAY_AMBER,
                tagPaletteIndex: C_OVERLAY_TEXT,
            },
        };
    }

    /**
     * Runs once when the demo starts. Sets up the palette and generates random
     * buildings and trees to fill the world.
     *
     * @returns {Promise<boolean>} Returns true when ready to run.
     */
    async init() {
        // Set up the color palette
        // Think of a palette like an artist choosing paint colors before painting a picture.
        // Every color we might draw with gets a numbered slot. We set the static colors
        // first, then add the 20 random building colors when we generate the buildings.
        this.palette = BT.paletteCreate(256);

        // Static colors - these are the same every time the demo runs.
        this.palette.set(C_SKY, new Color32(135, 206, 235)); // sky blue background
        this.palette.set(C_GRID, new Color32(100, 180, 100)); // medium green for the ground grid
        this.palette.set(C_WORLD_BORDER, new Color32(255, 0, 0)); // red world boundary rectangle
        this.palette.set(C_TRUNK, new Color32(101, 67, 33)); // warm brown tree trunk
        this.palette.set(C_FOLIAGE, new Color32(34, 139, 34)); // green tree leaves
        this.palette.set(C_FOLIAGE_OUTLINE, new Color32(20, 100, 20)); // darker green leaf outline
        this.palette.set(C_BUILDING_OUTLINE, new Color32(50, 50, 50)); // near-black building border
        this.palette.set(C_WINDOW, new Color32(255, 255, 200, 200)); // pale yellow semi-transparent window
        this.palette.set(C_PLAYER, new Color32(255, 100, 100)); // salmon red player fill
        this.palette.set(C_PLAYER_OUTLINE, new Color32(200, 50, 50)); // darker red player outline
        this.palette.set(C_BUILDING_DOT, new Color32(150, 150, 200)); // blue-gray dots on mini-map
        this.palette.set(C_VIEWPORT, new Color32(255, 255, 0)); // yellow viewport box on mini-map

        // Overlay colors (must match configure().overlayStyle and overlayRowData).
        this.palette.set(C_OVERLAY_BAR, new Color32(0, 0, 0, 200)); // dark bar behind custom overlay rows
        this.palette.set(C_OVERLAY_TEXT, new Color32(200, 200, 200)); // camera position line
        this.palette.set(C_OVERLAY_AMBER, new Color32(220, 180, 60)); // world size line

        // Install the shared UI kit theme. applyTheme() writes twelve UI colors into
        // high palette slots (240 and up), far above this demo's scene slots (1..42),
        // and returns a map of slot numbers we can draw with (panel, border, text...).
        this.theme = applyTheme(this.palette);

        // Tell the engine "use this palette from now on."
        BT.paletteSet(this.palette);

        // Generate buildings AFTER the palette is set up.
        // generateBuildings() adds 20 random colors to the palette (slots 20..39)
        // and stores the slot index on each building instead of a Color32 object.
        this.generateBuildings();
        this.generateTrees();
        return true;
    }

    /**
     * Runs at a fixed rate (60 times per second) to move the camera.
     * The camera follows a smooth sinusoidal (wave-like) path through the world.
     * In a real game you would move the camera based on player input instead.
     */
    update() {
        // Remember where the camera was before this tick's math moves it, so render()
        // has an "old" and "new" position to blend between.
        this.cameraPrevPos.set(this.cameraPos.x, this.cameraPos.y);

        // t increases slowly each tick, driving the sinusoidal movement.
        // Multiplying ticks by 0.02 makes the movement nice and slow.
        const t = BT.ticks * 0.02;

        // Math.sin and Math.cos produce values between -1 and +1.
        // Multiplying by 150 and 100 turns those into pixel distances.
        // Adding 200 or 150 keeps the camera away from the very top-left corner.
        this.cameraPos.x = Math.floor(200 + Math.sin(t) * 150);
        this.cameraPos.y = Math.floor(150 + Math.cos(t * 0.7) * 100);

        // Make sure the camera doesn't scroll past the edges of the world.
        // The right edge is worldWidth minus the screen width, because we don't want
        // the screen to show empty space past the world's right boundary.
        this.cameraPos = BT.cameraClamp(this.cameraPos, this.worldSize, BT.displaySize);

        // BT.cameraSet() now happens in render(), using a position blended between
        // cameraPrevPos and cameraPos - see renderWorld() below.
    }

    /**
     * Runs once per screen refresh to draw the world and the UI overlay.
     *
     * Important: anything drawn BEFORE BT.cameraReset() is offset by the camera.
     * Anything drawn AFTER BT.cameraReset() is drawn in screen coordinates (no offset).
     */
    render() {
        // Clear the screen to sky blue.
        BT.clear(C_SKY);

        // Blend cameraPrevPos toward cameraPos by BT.renderAlpha - a fraction from 0
        // (a tick just finished) to just under 1 (the next tick is about to happen) -
        // so the camera's on-screen position matches this exact render moment instead
        // of only its last-tick position. Set it here, right before any world drawing,
        // so every draw call this frame uses the same smoothed offset.
        this.cameraRenderPos.set(
            Math.floor(this.cameraPrevPos.x + (this.cameraPos.x - this.cameraPrevPos.x) * BT.renderAlpha),
            Math.floor(this.cameraPrevPos.y + (this.cameraPos.y - this.cameraPrevPos.y) * BT.renderAlpha),
        );
        BT.cameraSet(this.cameraRenderPos);

        // Draw all the world content (trees, buildings, player).
        // These are offset by the camera, so they appear to scroll.
        this.renderWorld();

        // Reset the camera so the UI (text, mini-map) stays fixed on screen.
        // Without this, the UI would scroll away when the camera moves.
        BT.cameraReset();

        // Draw the UI overlay (title, camera position, mini-map).
        // These are drawn in screen coordinates, so they never move.
        this.renderUI();
    }

    /**
     * Optional hook: tells the engine what extra lines to draw in the overlay.
     *
     * The overlay is the thin bars at the top and bottom (FPS, demo title, etc.).
     * Custom rows stack upward from just above the bottom FPS bar. Colors come from
     * palette slots we set in init() and from configure().overlayStyle.
     * We return the same overlayRowData array every time and only change the text.
     *
     * @returns {readonly { leftText: string }[]}
     */
    overlayRows() {
        // Use this.cameraPos, not BT.camera: the engine calls this hook after render(),
        // and we call BT.cameraReset() at the end of render() so screen UI stays fixed.
        this.overlayRowData[0].leftText = `Camera (${this.cameraPos.x}, ${this.cameraPos.y})`;
        this.overlayRowData[1].leftText = `World ${this.worldWidth}x${this.worldHeight}`;

        return this.overlayRowData;
    }

    /**
     * Creates 20 buildings with random positions, sizes, and colors.
     * Each building color is registered in the palette and the index is stored on the building.
     * This is why we pass numbers (indices) to draw calls instead of Color32 objects.
     */
    generateBuildings() {
        for (let i = 0; i < 20; i++) {
            // Each building gets its own palette slot starting at C_BUILDING_BASE (20).
            const colorIndex = C_BUILDING_BASE + i;

            // Give each building a slightly different blue-gray tint by randomizing R, G, B.
            // Math.random() gives a number from 0 up to 1; multiplying stretches that range.
            // Math.floor() rounds down to a whole number.
            const r = 100 + Math.floor(Math.random() * 100);
            const g = 100 + Math.floor(Math.random() * 100);
            const b = 150 + Math.floor(Math.random() * 100);

            // Register this building's color in the palette at its reserved slot.
            // Later, render() will pass colorIndex to BT.drawRectFill() instead of a Color32.
            this.palette.set(colorIndex, new Color32(r, g, b));

            this.buildings.push({
                // Place the building anywhere in the world, with some margin so it fits.
                pos: new Vector2i(
                    Math.floor(Math.random() * (this.worldWidth - 50)),
                    Math.floor(Math.random() * (this.worldHeight - 50)),
                ),

                // Vary the width (30-70 pixels) and height (40-100 pixels).
                size: new Vector2i(30 + Math.floor(Math.random() * 40), 40 + Math.floor(Math.random() * 60)),

                // Store the palette index number, not a Color32 object.
                // When drawing, we just pass this number to the draw call.
                colorIndex,
            });
        }
    }

    /**
     * Creates 50 trees at random positions across the entire world.
     */
    generateTrees() {
        for (let i = 0; i < 50; i++) {
            this.trees.push({
                pos: new Vector2i(
                    Math.floor(Math.random() * this.worldWidth),
                    Math.floor(Math.random() * this.worldHeight),
                ),
            });
        }
    }

    /**
     * Draws everything in the game world: the ground grid, trees, buildings, and player.
     * All of these are drawn in world coordinates, so the camera offset applies.
     */
    renderWorld() {
        // Draw a green grid over the ground.
        this.renderGrid();

        // Draw a red rectangle around the entire world boundary so you can see the edge.
        this.tempRect.set(0, 0, this.worldWidth, this.worldHeight);
        BT.drawRect(this.tempRect, C_WORLD_BORDER);

        // Draw trees first so buildings appear on top of them.
        for (const tree of this.trees) {
            this.renderTree(tree.pos);
        }

        // Draw each building using its pre-stored palette color index.
        for (const building of this.buildings) {
            this.renderBuilding(building);
        }

        // Draw the player on top of everything else.
        this.renderPlayer();
    }

    /**
     * Draws a grid of green lines across the entire world.
     * The grid helps you see that the world is larger than the visible screen.
     */
    renderGrid() {
        const gridSize = 40; // Lines every 40 pixels.

        // Draw vertical lines (top to bottom).
        for (let x = 0; x < this.worldWidth; x += gridSize) {
            this.tempVec1.set(x, 0);
            this.tempVec2.set(x, this.worldHeight);
            BT.drawLine(this.tempVec1, this.tempVec2, C_GRID);
        }

        // Draw horizontal lines (left to right).
        for (let y = 0; y < this.worldHeight; y += gridSize) {
            this.tempVec1.set(0, y);
            this.tempVec2.set(this.worldWidth, y);
            BT.drawLine(this.tempVec1, this.tempVec2, C_GRID);
        }
    }

    /**
     * Draws a single tree: a brown trunk below a green leafy top.
     *
     * @param {Vector2i} pos - The center-bottom of the tree in world coordinates.
     */
    renderTree(pos) {
        // Brown trunk: 4 pixels wide, 8 pixels tall, centered on pos.x.
        this.tempRect.set(pos.x - 2, pos.y - 8, 4, 8);
        BT.drawRectFill(this.tempRect, C_TRUNK);

        // Green foliage: 12 pixels wide, 12 pixels tall, centered and above the trunk.
        this.tempRect.set(pos.x - 6, pos.y - 16, 12, 12);
        BT.drawRectFill(this.tempRect, C_FOLIAGE);

        // Darker green outline around the foliage.
        BT.drawRect(this.tempRect, C_FOLIAGE_OUTLINE);
    }

    /**
     * Draws a single building: a colored rectangle with a dark outline and small windows.
     * The building's color is identified by its colorIndex (a palette slot number),
     * so no Color32 object is created during drawing.
     *
     * @param {{pos: Vector2i, size: Vector2i, colorIndex: number}} building - The building data.
     */
    renderBuilding(building) {
        // Draw the filled body of the building using its stored palette index.
        this.tempRect.set(building.pos.x, building.pos.y, building.size.x, building.size.y);
        BT.drawRectFill(this.tempRect, building.colorIndex);

        // Draw a dark outline around the building.
        BT.drawRect(this.tempRect, C_BUILDING_OUTLINE);

        // Draw a grid of small windows inside the building.
        // Start 10 pixels from the top, stop 10 from the bottom, space every 15 pixels.
        for (let y = 10; y < building.size.y - 10; y += 15) {
            for (let x = 5; x < building.size.x - 5; x += 15) {
                // Each window is an 8x8 filled rectangle with the pale-yellow window color.
                this.tempRect.set(building.pos.x + x, building.pos.y + y, 8, 8);
                BT.drawRectFill(this.tempRect, C_WINDOW);
            }
        }
    }

    /**
     * Draws the player as a red square with a darker red outline.
     * It stays in the center of the world and doesn't move.
     */
    renderPlayer() {
        // Center the 16x16 square on playerPos by subtracting half the size (8).
        this.tempRect.set(this.playerPos.x - 8, this.playerPos.y - 8, 16, 16);
        BT.drawRectFill(this.tempRect, C_PLAYER);
        BT.drawRect(this.tempRect, C_PLAYER_OUTLINE);
    }

    /**
     * Draws the HUD (heads-up display) overlaid on the screen.
     * Camera position and world size are shown in overlayRows() above the bottom
     * FPS bar (see the Basics demo for the same pattern).
     * Everything here is in screen coordinates (not offset by the camera).
     */
    renderUI() {
        // The title panel is built with the shared UI kit. Every widget declared
        // between ui.begin() and ui.end() stacks into one anchored group; the kit
        // measures the rows, draws the panel background, and places it for us.
        // The kit draws in whatever camera space is active, so this must run AFTER
        // BT.cameraReset() - otherwise the panel would scroll away with the world.
        ui.begin('topLeft');
        ui.panel('Camera Demo');
        ui.label('Auto-scrolling camera', { color: 'dim' });

        // KEY: value rows showing where the camera is looking right now and how big
        // the world is, so you can watch the numbers change as the view drifts around.
        ui.kv('CAMERA', `${this.cameraPos.x}, ${this.cameraPos.y}`);
        ui.kv('WORLD', `${this.worldWidth}x${this.worldHeight}`);
        ui.end();

        // Draw the mini-map in the bottom-right corner.
        this.renderMiniMap();
    }

    /**
     * Draws a small overview map showing the whole world scaled down.
     * Buildings appear as dots. The visible screen area is shown as a yellow box.
     * The player is shown as a tiny red square.
     */
    renderMiniMap() {
        // Position and size of the mini-map on screen.
        const mapX = 220;
        const mapY = 160;
        const mapW = 90;
        const mapH = 70;

        // Background and border for the mini-map frame. The kit has no mini-map
        // widget, so we draw this panel by hand - but we borrow the shared theme's
        // panel and border slots so it matches the kit's look exactly.
        this.tempRect.set(mapX, mapY, mapW, mapH);
        BT.drawRectFill(this.tempRect, this.theme.panel);
        BT.drawRect(this.tempRect, this.theme.border);

        // Draw a dot for each building, scaled down to fit the mini-map.
        // We divide by worldWidth/Height to get a 0.0-1.0 fraction, then multiply
        // by mapW/H to convert to mini-map pixels.
        for (const building of this.buildings) {
            const miniX = mapX + Math.floor((building.pos.x / this.worldWidth) * mapW);
            const miniY = mapY + Math.floor((building.pos.y / this.worldHeight) * mapH);
            this.tempVec1.set(miniX, miniY);
            BT.drawPixel(this.tempVec1, C_BUILDING_DOT);
        }

        // Draw a yellow rectangle showing the visible area (the camera viewport).
        const displaySize = BT.displaySize;
        const viewX = mapX + Math.floor((this.cameraPos.x / this.worldWidth) * mapW);
        const viewY = mapY + Math.floor((this.cameraPos.y / this.worldHeight) * mapH);
        const viewW = Math.floor((displaySize.x / this.worldWidth) * mapW);
        const viewH = Math.floor((displaySize.y / this.worldHeight) * mapH);

        this.tempRect.set(viewX, viewY, viewW, viewH);
        BT.drawRect(this.tempRect, C_VIEWPORT);

        // Draw the player position as a small red square on the mini-map.
        const playerMiniX = mapX + Math.floor((this.playerPos.x / this.worldWidth) * mapW);
        const playerMiniY = mapY + Math.floor((this.playerPos.y / this.worldHeight) * mapH);

        this.tempRect.set(playerMiniX - 1, playerMiniY - 1, 2, 2);
        BT.drawRectFill(this.tempRect, C_PLAYER);
    }
}

// Hand the Demo class to BLIT386 to start the demo loop.
bootstrap(Demo);
