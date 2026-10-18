/*

Noise: turning scrambled numbers into landscapes.
@description Value, Perlin, and Simplex noise at matched settings, with an octaves slider and a terrain ramp.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Coordinate Patterns: https://demos.blit386.dev/coordinate-patterns

Live version: https://demos.blit386.dev/noise

Guides:
  - Random: https://blit386.dev/docs/guides/random#procedural-patterns-from-coordinates

Reference:
  - Random: https://blit386.dev/docs/api/random#pattern-noise

---

WHAT YOU WILL SEE
-----------------

A 320x240 landscape filling the whole screen (the engine overlay is off), drawn as a grid
of square blocks, colored on a twelve-step ramp from deep water through sand, grass,
forest, and rock up to snow - or, with terrain colors switched off, on a sixteen-step
ramp from near-black to white.

A toolbar along the top holds the "1 Value", "2 Perlin", and "3 Simplex" buttons and a
block-size button that steps through 8, 4, 2, and 1 pixel blocks. The flavor in use and
the block-size button are lit green. Two panels of the same
height sit in the bottom corners: "Cost" on the left with the block size, how many noise
samples one picture takes, and how often it is rebuilt, and a panel on the right named
after the current flavor with the Octaves and Zoom sliders and two checkboxes.

It opens on Perlin noise at the finest setting, one block per pixel, drifting slowly like
clouds. Switch between the three ways of making noise, stack extra layers of detail on
top of each other, zoom in and out, and coarsen the blocks to see what each step costs.

WHAT YOU WILL LEARN
-------------------

- new ValueNoise(seed), new PerlinNoise(seed), and new SimplexNoise(seed): three flavors
  with the same methods and a different character.
- noise2D(x, y) gives a smooth value from -1 to 1 for any spot you ask about.
- "Octaves" means stacking the same noise again, smaller and fainter each time, which is
  what adds crags to smooth hills. That stack is called fbm: fbm2D(x, y, octaves).
- noise3D(x, y, z) and fbm3D(x, y, z, octaves) use the third number as time, which makes
  clouds drift.
- Bigger blocks mean fewer noise samples, so the picture is coarser but much cheaper to
  work out: halving the block size quadruples the samples, up to 76,800 at 1px.
- ui.button(label, { lit: { fill, rim } }) from the shared UI kit draws a button that is
  switched on, and litRimColor() works out its lighter rim from the theme.
- Working the whole picture out once into a buffer of palette slots, turning it into a
  sprite sheet with SpriteSheet.fromIndexedPixels(), and drawing it every frame with one
  BT.drawSprite() call - redone only when a control changes.

WHERE THIS CARRIES ON FROM
--------------------------

The Coordinate Patterns demo gave every tile its own scrambled number, and the result
looked like static: https://demos.blit386.dev/coordinate-patterns

Real landscapes are not static. Next to a hilltop you find more hilltop, not sea. Noise
fixes exactly that: it still works out an answer from a position, but nearby positions
now get answers close to each other. That single change turns speckle into scenery.

TRY THIS
--------

- Press 1, 2, or 3 (or tap Value, Perlin, Simplex) to switch flavor. All three share one
  seed, so the differences you see are the flavor, not luck.
- Drag "Octaves" from 1 to 6. One octave is plain noise; each extra octave piles finer
  detail on top.
- Drag "Zoom" to stretch the landscape out or crowd it together.
- Press T ("T Terrain colors") to switch between the terrain ramp and plain gray.
- Press A ("A Drift (3D)") to stop or restart the landscape moving through the third
  dimension.
- The demo starts at 1px blocks with drift on: the picture is worked out from scratch,
  76,800 samples at a time, every tick. Press B (the "B 1px" button) to step through 8,
  4, 2, and 1 pixel blocks, and watch the "Samples" count in the Cost panel.

*/

import { bootstrap, BT, Color32, PerlinNoise, Rect2i, SimplexNoise, SpriteSheet, ValueNoise, Vector2i } from 'blit386';

import { applyTheme, litRimColor, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// This demo runs at the engine's default screen size of 320x240 "game pixels".
const DISPLAY_W = 320;
const DISPLAY_H = 240;

// The seed every generator shares, so switching flavors compares like with like.
const WORLD_SEED = 424242;

// The three flavors, in the order the buttons offer them.
const KIND_VALUE = 0;
const KIND_PERLIN = 1;
const KIND_SIMPLEX = 2;
const KIND_NAMES = ['Value', 'Perlin', 'Simplex'];

// Block sizes the B key steps through. Each block is one noise sample, so halving the
// block size quadruples the samples: 1,200 at 8px, 4,800 at 4px, 19,200 at 2px, and
// 76,800 at 1px - one per screen pixel.
//
// Drawing does not get dearer, though. The blocks are not drawn one by one: every
// rebuild paints them into one 320x240 picture, and each frame draws that picture with a
// single call. (Drawing 1px blocks one rectangle at a time would mean 76,800 draws per
// frame, which brings the frame rate to a crawl.) What grows is the noise math, and only
// when the picture is rebuilt - every tick while it drifts, otherwise only when a control
// changes.
const BLOCK_SIZES = [8, 4, 2, 1];
const DEFAULT_BLOCK_INDEX = 3;

// Zoom range. A smaller number stretches the landscape out; a bigger one crowds it
// together.
const SCALE_MIN = 0.01;
const SCALE_MAX = 0.12;
const SCALE_DEFAULT = 0.035;

// How many times the noise may be stacked on itself.
const OCTAVES_MIN = 1;
const OCTAVES_MAX = 6;

// How fast the clouds drift when animation is switched on.
const DRIFT_SPEED = 0.012;

// The whole screen, as the source rectangle of the field picture and its spot on screen.
const FIELD_RECT = new Rect2i(0, 0, DISPLAY_W, DISPLAY_H);
const FIELD_POS = new Vector2i(0, 0);

// Layout. A slim toolbar along the top holds the flavor and block-size buttons, and two
// panels of the same height sit in the bottom corners. The landscape fills the screen
// behind them.
const MARGIN = 4;
const TOOL_GAP = 4;
const PANEL_H = 119;
const PANEL_Y = DISPLAY_H - MARGIN - PANEL_H;
const PANEL_GAP = 6;
const SHAPE_PANEL_W = 150;
const COST_PANEL_W = DISPLAY_W - 2 * MARGIN - PANEL_GAP - SHAPE_PANEL_W;

// Widgets inside a panel are 20 pixels narrower than the panel itself.
const PANEL_CONTENT_SHRINK = 20;

// The toolbar's buttons, left to right. The kit stacks a group's rows, so the toolbar
// reserves one button row and each button is placed with its own tiny group on top. A
// group pinned with pad 0 starts its first row 5 pixels above the y it is given.
const TOOLBAR_CONTENT_X = 9;
const TOOLBAR_CONTENT_Y = 4;
const BUTTON_ROW_H = 27;
const PINNED_ROW_SHIFT = 5;
const TOOLBAR_W = DISPLAY_W - 2 * MARGIN;
const FLAVOR_BUTTON_W = 62;
const BLOCK_BUTTON_W = TOOLBAR_W - PANEL_CONTENT_SHRINK - 3 * FLAVOR_BUTTON_W - 3 * TOOL_GAP;

// The bottom panels' rows fall short of PANEL_H by different amounts; this much empty
// space before each one's closing note evens them out, with the note at the bottom.
const COST_NOTE_GAP = 36;
const SHAPE_NOTE_GAP = 4;

// The cost panel's value column starts after this many characters.
const COST_KV_COLS = 8;

// Color ramps. The shared UI kit owns slots 240-251, so both ramps stay well below that.
// Terrain runs deep water to snow in slots 10-21; gray runs near-black to white in slots
// 30-45.
const C_TERRAIN_BASE = 10;
const TERRAIN_STEPS = 12;
const C_GRAY_BASE = 30;
const GRAY_STEPS = 16;

// The toolbar lights the button that is switched on - the current flavor and block size
// - in the same green the Keyboard Diagnostic demo lights a held key with, rimmed with a
// lighter shade of it (written in init()).
const C_LIT = 50;
const C_LIT_RIM = 51;
const LIT_BUTTON = { fill: C_LIT, rim: C_LIT_RIM };

// The terrain ramp, from the bottom of the sea to the top of the mountains. Each entry is
// the color for one step of the ramp.
const TERRAIN_COLORS = [
    [16, 38, 78], // deep water
    [24, 56, 106],
    [36, 78, 134],
    [52, 102, 160], // shallows
    [186, 176, 122], // sand
    [96, 148, 78], // grass
    [74, 126, 62],
    [56, 104, 50], // forest
    [98, 94, 88], // rock
    [124, 120, 114],
    [168, 166, 162],
    [232, 234, 238], // snow
];

// A landscape made of noise, with controls for every knob that shapes it.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Slot map for the shared UI kit theme, filled in by applyTheme() during init().
    theme = null;

    // One generator per flavor. All three share a seed so switching is a fair comparison.
    generators = [];

    // Which flavor is on screen - one of the KIND_* numbers. Perlin first: its rounded,
    // natural-looking shapes make the clearest landscape to start from.
    kind = KIND_PERLIN;

    // How zoomed in the landscape is.
    scale = SCALE_DEFAULT;

    // How many stacked layers of noise are added together.
    octaves = 4;

    // Which entry of BLOCK_SIZES is in use.
    blockIndex = DEFAULT_BLOCK_INDEX;

    // Terrain colors, or plain gray.
    showTerrain = true;

    // Whether the clouds are drifting. On from the start, at the finest block size, so
    // the demo opens on its most expensive setting - see the Cost panel.
    animate = true;

    // How far through the drift we are - the third coordinate handed to the 3D noise.
    driftZ = 0;

    // The finished picture, one palette slot per screen pixel: every block is painted
    // into it as a square of its own color. Allocated once, so no rebuild ever has to
    // make a new array.
    /** @type {Uint8Array | null} */
    pixels = null;

    // The picture as something the engine can draw: a sprite sheet made from `pixels`,
    // replaced after every rebuild.
    /** @type {SpriteSheet | null} */
    fieldSheet = null;

    // How many noise samples the last rebuild took.
    sampleCount = 0;

    // Set whenever a control changes, telling render() the picture is out of date.
    needsRebuild = true;

    // Turns the engine overlay off, so the landscape fills the screen.
    configure() {
        return {
            isOverlayEnabled: false,
        };
    }

    // Builds both color ramps and the three generators.
    async init() {
        this.palette = BT.paletteCreate(256);

        // The terrain ramp, straight from the table above.
        for (let i = 0; i < TERRAIN_STEPS; i++) {
            const [r, g, b] = TERRAIN_COLORS[i];

            this.palette.set(C_TERRAIN_BASE + i, new Color32(r, g, b));
        }

        // The gray ramp, evenly spaced from near-black (20) to white (255). Dividing by
        // (steps - 1) makes the last step land exactly on 255.
        for (let i = 0; i < GRAY_STEPS; i++) {
            const level = Math.round((i / (GRAY_STEPS - 1)) * 235) + 20;

            this.palette.set(C_GRAY_BASE + i, new Color32(level, level, level));
        }

        this.palette.set(C_LIT, new Color32(75, 210, 120)); // lit button green

        // Install the shared UI colors, then hand the finished palette to the engine. The
        // lit buttons' rim is worked out from the theme, so it comes after applyTheme().
        this.theme = applyTheme(this.palette);
        this.palette.set(C_LIT_RIM, litRimColor(this.palette, this.palette.get(C_LIT)));

        BT.paletteSet(this.palette);

        // Same seed for all three, so any difference you see is the flavor, not the seed.
        // Each one is stored at the position its KIND_ number names, so the buttons can
        // look a generator up just by counting.
        this.generators[KIND_VALUE] = new ValueNoise(WORLD_SEED);
        this.generators[KIND_PERLIN] = new PerlinNoise(WORLD_SEED);
        this.generators[KIND_SIMPLEX] = new SimplexNoise(WORLD_SEED);

        // A Uint8Array holds whole numbers from 0 to 255 - exactly the range of a palette
        // slot - in a fraction of the memory a normal array would take.
        this.pixels = new Uint8Array(DISPLAY_W * DISPLAY_H);

        return true;
    }

    // Advances the drift when animation is on.
    update() {
        // Always first: this is what makes the { key } shortcuts on buttons work.
        ui.tick();

        if (this.animate) {
            // Walking forward through the third dimension is what makes the picture move.
            // Standing still in x and y while sliding through z is exactly how drifting
            // clouds are made.
            this.driftZ += DRIFT_SPEED;
            this.needsRebuild = true;
        }
    }

    // Rebuilds the field when needed, draws it, then draws the toolbar and panels.
    //
    // The field is a sprite like the panels, and sprites draw in the order they are
    // called, so it has to come first or it would cover them. A control changed this
    // frame therefore shows up in the next frame's rebuild - a sixtieth of a second
    // later.
    render() {
        if (this.needsRebuild) {
            this.rebuildField();
            this.needsRebuild = false;
        }

        BT.drawSprite(this.fieldSheet, FIELD_RECT, FIELD_POS);

        this.renderToolbar();
        this.renderCostPanel();
        this.renderShapePanel();
    }

    // Works out a palette slot for every block on screen, paints each block into the
    // picture, and turns the picture into a sprite sheet.
    //
    // This is the expensive part, which is why it only runs when something actually
    // changed. Standing still with animation off costs nothing at all.
    rebuildField() {
        const block = BLOCK_SIZES[this.blockIndex];
        const generator = this.generators[this.kind];
        const cols = Math.ceil(DISPLAY_W / block);
        const rows = Math.ceil(DISPLAY_H / block);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // Turn the block's position on screen into a position in the landscape.
                // Multiplying by the scale is the zoom: a smaller scale means neighboring
                // blocks land closer together in the landscape, so the view is stretched
                // out.
                const nx = col * block * this.scale;
                const ny = row * block * this.scale;

                const value = this.sample(generator, nx, ny);

                // The generators answer somewhere between -1 and 1. Adding 1 and halving
                // shifts that to between 0 and 1, which is what a ramp position needs to
                // be.
                const slot = this.rampSlot((value + 1) / 2);

                this.paintBlock(col * block, row * block, block, slot);
            }
        }

        this.sampleCount = cols * rows;

        // A sheet's pixels go to the graphics card once, the first time it is drawn, so a
        // changed picture needs a new sheet. destroy() frees the old one's memory.
        this.fieldSheet?.destroy();
        this.fieldSheet = SpriteSheet.fromIndexedPixels(DISPLAY_W, DISPLAY_H, this.pixels);
    }

    // Fills one block-sized square of the picture with `slot`, starting at pixel (x, y).
    // Blocks along the right and bottom edges are cut off at the edge of the picture.
    paintBlock(x, y, size, slot) {
        const right = Math.min(x + size, DISPLAY_W);
        const bottom = Math.min(y + size, DISPLAY_H);

        for (let py = y; py < bottom; py++) {
            // fill() writes one value into a run of the array: here, one row of the
            // block.
            this.pixels.fill(slot, py * DISPLAY_W + x, py * DISPLAY_W + right);
        }
    }

    // Asks one generator for a single value, in whichever way the controls call for. `nx`
    // and `ny` are the position in the landscape. Returns a value from about -1 to 1.
    sample(generator, nx, ny) {
        // With animation on, the third number is how far the drift has traveled. Without
        // it, the flat 2D version is all we need and is cheaper to work out.
        if (this.animate) {
            if (this.octaves <= 1) {
                return generator.noise3D(nx, ny, this.driftZ);
            }

            return generator.fbm3D(nx, ny, this.driftZ, this.octaves);
        }

        // One octave means the plain noise, with no stacking at all. This is the honest
        // starting point - everything above it is the same shape with detail piled on.
        if (this.octaves <= 1) {
            return generator.noise2D(nx, ny);
        }

        // More than one octave means fbm: the same noise added to itself again and again,
        // each time twice as crowded and half as strong. Big shapes stay, small ones
        // appear.
        return generator.fbm2D(nx, ny, this.octaves);
    }

    // Turns a height `t` from 0 (lowest) to 1 (highest) into the palette slot that should
    // be drawn.
    rampSlot(t) {
        const steps = this.showTerrain ? TERRAIN_STEPS : GRAY_STEPS;
        const base = this.showTerrain ? C_TERRAIN_BASE : C_GRAY_BASE;

        // Multiplying by the number of steps turns a 0-to-1 height into a step number.
        // The guards keep a value that lands exactly on 1 (or slightly outside the
        // expected range) from reaching past the end of the ramp.
        let step = Math.floor(t * steps);

        if (step < 0) {
            step = 0;
        }

        if (step >= steps) {
            step = steps - 1;
        }

        return base + step;
    }

    // The toolbar along the top: the three flavors, bound to the keys 1, 2, and 3, and
    // the block-size button. The panel goes first with one empty row, then each button is
    // placed on top of it in its own tiny group (see PINNED_ROW_SHIFT).
    renderToolbar() {
        ui.begin('topLeft', { x: MARGIN, y: MARGIN, width: TOOLBAR_W });
        ui.panel('');
        ui.spacer(BUTTON_ROW_H - TOOLBAR_CONTENT_Y - 4);
        ui.end();

        for (let i = 0; i < KIND_NAMES.length; i++) {
            const x = MARGIN + TOOLBAR_CONTENT_X + i * (FLAVOR_BUTTON_W + TOOL_GAP);

            if (this.toolButton(`${i + 1} ${KIND_NAMES[i]}`, `Digit${i + 1}`, x, FLAVOR_BUTTON_W, i === this.kind)) {
                this.kind = i;
                this.needsRebuild = true;
            }
        }

        const blockX = MARGIN + TOOLBAR_CONTENT_X + 3 * (FLAVOR_BUTTON_W + TOOL_GAP);

        // The block button is always lit: it shows the size in use, not one choice of
        // several.
        if (this.toolButton(`B ${BLOCK_SIZES[this.blockIndex]}px`, 'KeyB', blockX, BLOCK_BUTTON_W, true)) {
            // Step through the sizes and wrap around at the end.
            this.blockIndex = (this.blockIndex + 1) % BLOCK_SIZES.length;
            this.needsRebuild = true;
        }
    }

    // One toolbar button in its own tiny group at column `x`, lit green when `isOn`. The
    // block button's label changes with every press, so each button is identified by its
    // key instead - the kit tells widgets apart by their id, which is the label unless
    // one is given. Returns true on the frame it is clicked, tapped, or its key is
    // pressed, like ui.button().
    toolButton(label, key, x, width, isOn) {
        ui.begin('topLeft', { x, y: MARGIN + TOOLBAR_CONTENT_Y + PINNED_ROW_SHIFT, pad: 0 });

        const pressed = ui.button(label, { key, width, id: key, lit: isOn ? LIT_BUTTON : undefined });

        ui.end();

        return pressed;
    }

    // What the current block size costs: how many noise samples one rebuild takes, and
    // how often a rebuild happens.
    renderCostPanel() {
        const block = BLOCK_SIZES[this.blockIndex];

        ui.begin('topLeft', { x: MARGIN, y: PANEL_Y, width: COST_PANEL_W, kvCols: COST_KV_COLS });
        ui.panel('Cost');
        ui.kv('Blocks', `${block}x${block}px`);

        // toLocaleString('en-US') writes 76800 as "76,800", which is easier to read.
        ui.kv('Samples', this.sampleCount.toLocaleString('en-US'));
        ui.kv('Rebuild', this.animate ? 'every tick' : 'on change');
        ui.spacer(COST_NOTE_GAP);
        ui.label('Half the block size,', { color: 'dim' });
        ui.label('four times the math.', { color: 'dim' });
        ui.end();
    }

    // The sliders and switches that shape the landscape.
    renderShapePanel() {
        const sliderW = SHAPE_PANEL_W - PANEL_CONTENT_SHRINK;

        ui.begin('topLeft', { x: DISPLAY_W - MARGIN - SHAPE_PANEL_W, y: PANEL_Y, width: SHAPE_PANEL_W });
        ui.panel(`${KIND_NAMES[this.kind]} noise`);

        // Every control compares its new value against the old one, and only asks for a
        // rebuild when something really moved. Otherwise the picture would be redrawn
        // from scratch on every single frame for no reason.
        const nextOctaves = Math.round(
            ui.slider('Octaves', this.octaves, { min: OCTAVES_MIN, max: OCTAVES_MAX, width: sliderW, decimals: 0 }),
        );

        if (nextOctaves !== this.octaves) {
            this.octaves = nextOctaves;
            this.needsRebuild = true;
        }

        const nextScale = ui.slider('Zoom', this.scale, {
            min: SCALE_MIN,
            max: SCALE_MAX,
            width: sliderW,
            decimals: 3,
        });

        if (nextScale !== this.scale) {
            this.scale = nextScale;
            this.needsRebuild = true;
        }

        const nextTerrain = ui.checkbox('T Terrain colors', this.showTerrain, { key: 'KeyT' });

        if (nextTerrain !== this.showTerrain) {
            this.showTerrain = nextTerrain;
            this.needsRebuild = true;
        }

        const nextAnimate = ui.checkbox('A Drift (3D)', this.animate, { key: 'KeyA' });

        // Switching drift off has to ask for a rebuild as well. Drifting samples the 3D
        // generators; standing still samples the 2D ones. Without this the picture would
        // keep showing the last 3D frame while the panel claimed it was back to plain 2D.
        if (nextAnimate !== this.animate) {
            this.animate = nextAnimate;
            this.needsRebuild = true;
        }

        ui.spacer(SHAPE_NOTE_GAP);

        if (this.octaves <= 1) {
            ui.label('1 octave: plain noise.', { color: 'dim' });
        } else {
            ui.label(`fbm stacks ${this.octaves} octaves.`, { color: 'dim' });
        }

        ui.end();
    }
}

bootstrap(Demo);
