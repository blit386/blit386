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

A 320x240 landscape drawn as a grid of square blocks, colored on a twelve-step ramp from
deep water through sand, grass, forest, and rock up to snow - or, with terrain colors
switched off, on a sixteen-step ramp from near-black to white. Two panels sit at the
bottom: "Flavor" on the left with the Value, Perlin, and Simplex buttons and the block
size, and a panel on the right named after the current flavor with the Octaves and Zoom
sliders and two checkboxes.

Switch between the three ways of making noise, stack extra layers of detail on top of
each other, zoom in and out, and set the whole thing drifting like clouds.

WHAT YOU WILL LEARN
-------------------

- new ValueNoise(seed), new PerlinNoise(seed), and new SimplexNoise(seed): three flavors
  with the same methods and a different character.
- noise2D(x, y) gives a smooth value from -1 to 1 for any spot you ask about.
- "Octaves" means stacking the same noise again, smaller and fainter each time, which is
  what adds crags to smooth hills. That stack is called fbm: fbm2D(x, y, octaves).
- noise3D(x, y, z) and fbm3D(x, y, z, octaves) use the third number as time, which makes
  clouds drift.
- Bigger blocks mean fewer squares to draw, so the picture is coarser but much cheaper.
- Working the whole picture out once into a buffer and redrawing it only when a control
  changes.
- Reusing one Rect2i for every block instead of making thousands of new ones per frame.

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
- Press T ("Terrain colors") to switch between the terrain ramp and plain gray.
- Press A ("Drift (uses 3D)") to set the landscape moving through the third dimension.
- Press B ("Blocks: 4px" / "Blocks: 8px") to switch block size and compare the cost.

*/

import { bootstrap, BT, Color32, PerlinNoise, Rect2i, SimplexNoise, ValueNoise } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

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

// Block sizes the demo will draw at. Smaller blocks mean a finer picture and more work.
//
// 4 pixels is as fine as this demo goes, and that limit is measured rather than guessed.
// Each block is one drawing instruction, so 4px blocks mean 4,800 of them per frame,
// which the engine handles comfortably at a full 60 frames a second. Halving to 2px
// quadruples that to 19,200 and the frame rate collapses to about one - the cost of a
// block is small, but it is not free, and enough small costs add up to a stall.
const BLOCK_SIZES = [8, 4];
const DEFAULT_BLOCK_INDEX = 1;

// The smallest block we ever draw decides how big the sample buffer has to be. Reading it
// back out of the list means adding a finer size above cannot leave the buffer too small.
const SMALLEST_BLOCK = Math.min(...BLOCK_SIZES);
const MAX_CELLS = (DISPLAY_W / SMALLEST_BLOCK) * (DISPLAY_H / SMALLEST_BLOCK);

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

// Color ramps. The shared UI kit owns slots 240-251, so both ramps stay well below that.
// Terrain runs deep water to snow in slots 10-21; gray runs near-black to white in slots
// 30-45.
const C_TERRAIN_BASE = 10;
const TERRAIN_STEPS = 12;
const C_GRAY_BASE = 30;
const GRAY_STEPS = 16;

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

    // Which flavor is on screen - one of the KIND_* numbers.
    kind = KIND_VALUE;

    // How zoomed in the landscape is.
    scale = SCALE_DEFAULT;

    // How many stacked layers of noise are added together.
    octaves = 4;

    // Which entry of BLOCK_SIZES is in use.
    blockIndex = DEFAULT_BLOCK_INDEX;

    // Terrain colors, or plain gray.
    showTerrain = true;

    // Whether the clouds are drifting.
    animate = false;

    // How far through the drift we are - the third coordinate handed to the 3D noise.
    driftZ = 0;

    // One palette slot per block on screen, worked out ahead of drawing. Allocated once
    // at the largest size we could ever need, so no frame ever has to make a new array.
    /** @type {Uint8Array | null} */
    cells = null;

    // How many blocks across the buffer currently holds.
    cellCols = 0;

    // How many blocks down the buffer currently holds.
    cellRows = 0;

    // Set whenever a control changes, telling render() the picture is out of date.
    needsRebuild = true;

    // One rectangle, reused for every block we draw. Thousands of blocks go by each
    // frame, and making a throwaway Rect2i for each one would leave the browser a pile of
    // objects to clear up. Moving the same rectangle into place instead makes no garbage
    // at all, which is the habit the shared UI kit follows too.
    blockRect = new Rect2i(0, 0, 0, 0);

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

        // Install the shared UI colors, then hand the finished palette to the engine.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Same seed for all three, so any difference you see is the flavor, not the seed.
        // Each one is stored at the position its KIND_ number names, so the buttons can
        // look a generator up just by counting.
        this.generators[KIND_VALUE] = new ValueNoise(WORLD_SEED);
        this.generators[KIND_PERLIN] = new PerlinNoise(WORLD_SEED);
        this.generators[KIND_SIMPLEX] = new SimplexNoise(WORLD_SEED);

        // A Uint8Array holds whole numbers from 0 to 255 - exactly the range of a palette
        // slot - in a fraction of the memory a normal array would take.
        this.cells = new Uint8Array(MAX_CELLS);

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

    // Rebuilds the field when needed, draws it, then draws the panels.
    render() {
        if (this.needsRebuild) {
            this.rebuildField();
            this.needsRebuild = false;
        }

        this.drawField();

        this.renderKindPanel();
        this.renderShapePanel();
    }

    // Works out a palette slot for every block on screen.
    //
    // This is the expensive part, which is why it only runs when something actually
    // changed. Standing still with animation off costs nothing at all.
    rebuildField() {
        const block = BLOCK_SIZES[this.blockIndex];
        const generator = this.generators[this.kind];

        this.cellCols = Math.ceil(DISPLAY_W / block);
        this.cellRows = Math.ceil(DISPLAY_H / block);

        for (let row = 0; row < this.cellRows; row++) {
            for (let col = 0; col < this.cellCols; col++) {
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
                const t = (value + 1) / 2;

                this.cells[row * this.cellCols + col] = this.rampSlot(t);
            }
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

    // Draws every block from the buffer worked out above.
    drawField() {
        const block = BLOCK_SIZES[this.blockIndex];

        // The same rectangle is nudged into place for each block, rather than a new one
        // being made every time. See blockRect above for why that matters so much here.
        this.blockRect.width = block;
        this.blockRect.height = block;

        for (let row = 0; row < this.cellRows; row++) {
            for (let col = 0; col < this.cellCols; col++) {
                this.blockRect.x = col * block;
                this.blockRect.y = row * block;

                BT.drawRectFill(this.blockRect, this.cells[row * this.cellCols + col]);
            }
        }
    }

    // The three flavor buttons and the block size.
    renderKindPanel() {
        ui.begin(UI_ANCHORS.BOTTOM_LEFT);
        ui.panel('Flavor');

        // One button per flavor, bound to the keys 1, 2, and 3 in the same order.
        for (let i = 0; i < KIND_NAMES.length; i++) {
            if (ui.button(KIND_NAMES[i], { key: `Digit${i + 1}` })) {
                this.kind = i;
                this.needsRebuild = true;
            }
        }

        if (ui.button(`Blocks: ${BLOCK_SIZES[this.blockIndex]}px`, { key: 'KeyB' })) {
            // Step through the sizes and wrap around at the end.
            this.blockIndex = (this.blockIndex + 1) % BLOCK_SIZES.length;
            this.needsRebuild = true;
        }

        ui.end();
    }

    // The sliders and switches that shape the landscape.
    renderShapePanel() {
        ui.begin(UI_ANCHORS.BOTTOM_RIGHT);
        ui.panel(`${KIND_NAMES[this.kind]} noise`);

        // Every control compares its new value against the old one, and only asks for a
        // rebuild when something really moved. Otherwise the picture would be redrawn
        // from scratch on every single frame for no reason.
        const nextOctaves = Math.round(ui.slider('Octaves', this.octaves, { min: OCTAVES_MIN, max: OCTAVES_MAX }));

        if (nextOctaves !== this.octaves) {
            this.octaves = nextOctaves;
            this.needsRebuild = true;
        }

        const nextScale = ui.slider('Zoom', this.scale, { min: SCALE_MIN, max: SCALE_MAX });

        if (nextScale !== this.scale) {
            this.scale = nextScale;
            this.needsRebuild = true;
        }

        const nextTerrain = ui.checkbox('Terrain colors', this.showTerrain, { key: 'KeyT' });

        if (nextTerrain !== this.showTerrain) {
            this.showTerrain = nextTerrain;
            this.needsRebuild = true;
        }

        const nextAnimate = ui.checkbox('Drift (uses 3D)', this.animate, { key: 'KeyA' });

        // Switching drift off has to ask for a rebuild as well. Drifting samples the 3D
        // generators; standing still samples the 2D ones. Without this the picture would
        // keep showing the last 3D frame while the panel claimed it was back to plain 2D.
        if (nextAnimate !== this.animate) {
            this.animate = nextAnimate;
            this.needsRebuild = true;
        }

        ui.separator();

        if (this.octaves <= 1) {
            ui.label('One octave: plain noise.', { color: 'dim' });
        } else {
            ui.label(`${this.octaves} octaves: fbm adds detail.`, { color: 'dim' });
        }

        ui.end();
    }
}

bootstrap(Demo);
