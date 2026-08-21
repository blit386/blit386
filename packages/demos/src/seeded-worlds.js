// Seeded Worlds: the same number always builds the same world.
// @description Two worlds side by side, each labeled with its seed. Copy one seed over and the halves match exactly.
//
// Part of the BLIT386 demo series.
//
// Prerequisites:
//   Basics        https://demos.blit386.dev/basics
//   Random Basics https://demos.blit386.dev/random-basics
//
// WHAT YOU WILL SEE
// Two little worlds side by side. Each one was built out of random numbers – the hills, the
// buildings, the trees, the stars. Above each world is the number it grew from, called its
// "seed". Press the buttons to give either side a new seed and watch it rebuild.
//
// Then press "Copy left seed" and watch the right world turn into an exact twin of the left
// one. Same number in, same world out, every single time.
//
// WHAT YOU WILL LEARN
//   - BT.randomSeed(n) tells the engine which number to start its randomness from
//   - The same seed always produces the same sequence, so it produces the same world
//   - BT.random.seedValue reads that number back, even the one the engine picked by itself
//   - clone() copies a generator so both continue with the same numbers
//   - fork() splits off a new generator that goes its own way
//
// WHY THIS IS USEFUL
// A game can hand you a puzzle from seed 4821 and know every player gets the identical
// puzzle. A saved game can store one number instead of a whole map. And when a run goes
// really well, you can write the seed down and play it again.
//
// The engine splits work the usual way: update() moves things; render() only draws.
// See the Basics demo for the full story: https://demos.blit386.dev/basics

import { bootstrap, BT, Color32, Random, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */

// This demo runs at the engine's default screen size of 320x240 "game pixels".

// Each world gets its own framed box. Two boxes, side by side, with a gap between them.
const WORLD_W = 152;
const WORLD_H = 100;
const WORLD_Y = 18;
const WORLD_LEFT_X = 4;
const WORLD_RIGHT_X = 164;

// How many of each thing lives in a world. Fixed counts keep the two sides comparable:
// only the positions and sizes change from seed to seed.
const STAR_COUNT = 16;
const BUILDING_COUNT = 4;
const TREE_COUNT = 7;

// The ground is drawn as a run of columns whose height is worked out from four control
// points. Fewer points means smoother, rounder hills.
const HILL_POINTS = 4;

// Seeds are kept small so they are easy to read and easy to type back in.
const SEED_MIN = 1000;
const SEED_MAX = 9999;

// How many numbers the stream comparison shows for each generator.
const STREAM_SAMPLE = 3;

// Color slots. The shared UI kit owns slots 240-251, so scene colors stay well below that.
const C_SKY = 1; // Night sky inside each world box.
const C_STAR = 2; // Stars.
const C_GROUND = 3; // Solid earth under the hills.
const C_HILL = 4; // The hill surface line.
const C_TREE = 5; // Tree leaves.
const C_TRUNK = 6; // Tree trunks.
const C_INK = 7; // Frames and bright text.
const C_DIM = 8; // Faded lines.

// Four building tints, in slots 10-13.
const C_BUILDING_BASE = 10;
const BUILDING_TINTS = 4;

/**
 * Builds one complete world from a single seed.
 *
 * This is the heart of the demo. Every random number it needs comes from BT.random, and
 * BT.random was just told where to start, so running this twice with the same seed walks
 * through the exact same numbers in the exact same order – and therefore builds the exact
 * same world.
 *
 * @param {number} seed – The number this world grows from.
 * @returns {{ seed: number, hills: Array<number>, buildings: Array<object>, trees: Array<object>, stars: Array<Vector2i> }}
 */
function generateWorld(seed) {
    // This is the line that makes everything below repeatable. From here on the engine's
    // random numbers are no longer a surprise – they are decided by `seed`.
    BT.randomSeed(seed);

    // Stars first, scattered across the top two thirds of the box.
    const stars = [];

    for (let i = 0; i < STAR_COUNT; i++) {
        // insideRect() hands back a Vector2i somewhere inside the rectangle we describe -
        // like closing your eyes and pointing at a spot on a map.
        stars.push(BT.random.insideRect(new Rect2i(0, 0, WORLD_W, Math.floor(WORLD_H * 0.6))));
    }

    // The hills. We pick a few heights spread across the width, then fill in the columns
    // between them by sliding smoothly from one height to the next.
    const controls = [];

    for (let i = 0; i < HILL_POINTS; i++) {
        // int(a, b) gives a whole number from a up to (but not including) b, so these
        // heights land somewhere in the lower half of the box.
        controls.push(BT.random.int(Math.floor(WORLD_H * 0.55), Math.floor(WORLD_H * 0.8)));
    }

    const hills = [];

    for (let x = 0; x < WORLD_W; x++) {
        // Work out which pair of control points this column sits between, and how far along
        // it is between them (0 means "right on the left point", 1 means "right on the right").
        const spanW = WORLD_W / (HILL_POINTS - 1);
        const span = Math.min(HILL_POINTS - 2, Math.floor(x / spanW));
        const t = (x - span * spanW) / spanW;

        // Sliding straight from one height to the next gives sharp corners. Feeding the
        // position through this curve first eases in and out, so the hills look rounded.
        const eased = t * t * (3 - 2 * t);

        hills.push(Math.round(controls[span] + (controls[span + 1] - controls[span]) * eased));
    }

    // Buildings, sitting on whatever ground height is under them.
    const buildings = [];

    for (let i = 0; i < BUILDING_COUNT; i++) {
        const w = BT.random.int(12, 24);
        const x = BT.random.int(4, WORLD_W - w - 4);
        const h = BT.random.int(14, 34);

        buildings.push({
            x,
            w,
            h,
            // The building stands on the ground, so its top is the ground height minus its
            // own height.
            groundY: hills[x + Math.floor(w / 2)],
            // int(4) is shorthand for int(0, 4): 0, 1, 2, or 3. That picks one of the four
            // building shades.
            tint: BT.random.int(BUILDING_TINTS),
        });
    }

    // Trees, scattered along the ground.
    const trees = [];

    for (let i = 0; i < TREE_COUNT; i++) {
        const x = BT.random.int(3, WORLD_W - 4);

        trees.push({
            x,
            groundY: hills[x],
            h: BT.random.int(6, 13),
        });
    }

    return { seed, hills, buildings, trees, stars };
}

/**
 * Two worlds side by side, proving that the same seed rebuilds the same world.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Slot map for the shared UI kit theme, filled in by applyTheme() during init().
    theme = null;

    // The two worlds. Each remembers everything it was built from – that is the difference
    // between this demo and the Coordinate Patterns one, which remembers nothing at all:
    // https://demos.blit386.dev/coordinate-patterns
    left = null;
    right = null;

    // Whether the engine picked the very first seeds by itself. Once the user presses a
    // button this turns false, because from then on the seeds were chosen on purpose.
    seedsWereAutomatic = true;

    // A snapshot of what clone() and fork() do, worked out once in init().
    streams = { seed: 0, base: [], cloned: [], forked: [], forkSeed: undefined };

    // A private generator used only for choosing new seeds.
    //
    // It cannot be the shared BT.random, because generateWorld() reseeds that one. Drawing the
    // next seed from a stream we just reseeded makes the answer a fixed consequence of the
    // seed we reseeded it with – so "Copy left seed" followed by "New right" would hand back
    // the very same number every time, and the button would look broken.
    /** @type {Random | null} */
    seedPicker = null;

    /**
     * Builds the palette, then grows both worlds from seeds nobody chose.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_SKY, new Color32(16, 20, 38)); // Night sky.
        this.palette.set(C_STAR, new Color32(220, 228, 245)); // Stars.
        this.palette.set(C_GROUND, new Color32(28, 40, 32)); // Solid earth.
        this.palette.set(C_HILL, new Color32(74, 116, 80)); // Grassy hill surface.
        this.palette.set(C_TREE, new Color32(96, 168, 104)); // Leaves.
        this.palette.set(C_TRUNK, new Color32(90, 68, 48)); // Trunks.
        this.palette.set(C_INK, new Color32(226, 232, 244)); // Frames and bright text.
        this.palette.set(C_DIM, new Color32(72, 80, 102)); // Faded lines.

        // Four window-lit building shades, from dull to bright.
        this.palette.set(C_BUILDING_BASE + 0, new Color32(64, 72, 96));
        this.palette.set(C_BUILDING_BASE + 1, new Color32(84, 92, 118));
        this.palette.set(C_BUILDING_BASE + 2, new Color32(104, 112, 140));
        this.palette.set(C_BUILDING_BASE + 3, new Color32(126, 134, 162));

        // Install the shared UI colors, then hand the finished palette to the engine.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Set up the seed picker before anything asks it for a number. Left to itself, a new
        // Random seeds from the clock, so this stream is unrelated to the shared one.
        this.seedPicker = new Random();

        // Nobody has chosen a seed yet. The engine seeded itself from the clock when it
        // started up, and seedValue hands that number back – so we can build a world from
        // it and still show which number it was.
        //
        // That is the part worth noticing: even the run you did not plan has a seed you can
        // write down and return to.
        this.left = generateWorld(BT.random.seedValue ?? SEED_MIN);
        this.right = generateWorld(this.rollSeed());

        this.sampleStreams();

        return true;
    }

    /**
     * Nothing moves in this demo, so update() only keeps the UI kit's key shortcuts alive.
     */
    update() {
        // Always first: this is what makes the { key } shortcuts on buttons work.
        ui.tick();
    }

    /**
     * Draws both worlds, their seeds, and the control panels.
     */
    render() {
        BT.clear(C_SKY);

        this.renderWorld(this.left, WORLD_LEFT_X);
        this.renderWorld(this.right, WORLD_RIGHT_X);

        // Each world's seed sits directly above it, so there is no doubt which is which.
        ui.caption(WORLD_LEFT_X, 8, `seed ${this.left.seed}`);
        ui.caption(WORLD_RIGHT_X, 8, `seed ${this.right.seed}`);

        // When both seeds match, say so plainly – this is the moment the demo exists for.
        if (this.left.seed === this.right.seed) {
            ui.caption(96, WORLD_Y + WORLD_H + 4, 'Same seed, same world', { color: 'accent' });
        } else if (this.seedsWereAutomatic) {
            // The left seed is long because nobody typed it: the engine made it from the
            // clock when the demo started. seedValue is how we can still read it.
            ui.caption(48, WORLD_Y + WORLD_H + 4, 'Left seed came from the clock', { color: 'dim' });
        }

        this.renderSeedPanel();
        this.renderStreamPanel();
    }

    /**
     * Draws one world inside its frame.
     *
     * @param {{ hills: Array<number>, buildings: Array<object>, trees: Array<object>, stars: Array<Vector2i> }} world
     * @param {number} originX – Left edge of this world's box on screen.
     */
    renderWorld(world, originX) {
        // Everything inside a world is stored in "world coordinates" starting at 0, so each
        // thing is drawn by adding the box's own corner to it. That is what lets the exact
        // same world data be drawn on either side of the screen.
        for (const star of world.stars) {
            BT.drawPixel(new Vector2i(originX + star.x, WORLD_Y + star.y), C_STAR);
        }

        // The ground: one vertical line per column, from the hill surface down to the bottom.
        for (let x = 0; x < WORLD_W; x++) {
            const top = world.hills[x];

            BT.drawLine(
                new Vector2i(originX + x, WORLD_Y + top),
                new Vector2i(originX + x, WORLD_Y + WORLD_H - 1),
                C_GROUND,
            );
            BT.drawPixel(new Vector2i(originX + x, WORLD_Y + top), C_HILL);
        }

        for (const b of world.buildings) {
            BT.drawRectFill(new Rect2i(originX + b.x, WORLD_Y + b.groundY - b.h, b.w, b.h), C_BUILDING_BASE + b.tint);
        }

        for (const t of world.trees) {
            // A trunk, then a blob of leaves on top of it.
            BT.drawLine(
                new Vector2i(originX + t.x, WORLD_Y + t.groundY),
                new Vector2i(originX + t.x, WORLD_Y + t.groundY - t.h),
                C_TRUNK,
            );
            BT.drawRectFill(new Rect2i(originX + t.x - 2, WORLD_Y + t.groundY - t.h - 3, 5, 5), C_TREE);
        }

        // The frame goes on last so it sits cleanly on top of everything.
        BT.drawRect(new Rect2i(originX - 1, WORLD_Y - 1, WORLD_W + 2, WORLD_H + 2), C_DIM);
    }

    /**
     * The three buttons that reseed the worlds.
     */
    renderSeedPanel() {
        ui.begin(UI_ANCHORS.BOTTOM_LEFT);
        ui.panel('Seeds');

        if (ui.button('New left', { key: 'KeyQ' })) {
            this.left = generateWorld(this.rollSeed());
            this.seedsWereAutomatic = false;
        }

        if (ui.button('New right', { key: 'KeyW' })) {
            this.right = generateWorld(this.rollSeed());
            this.seedsWereAutomatic = false;
        }

        if (ui.button('Copy left seed', { key: 'KeyE' })) {
            // Nothing about the right world is copied here – only the number. The world is
            // rebuilt from scratch, and it comes back identical because the number is the same.
            this.right = generateWorld(this.left.seed);
            this.seedsWereAutomatic = false;
        }

        ui.end();
    }

    /**
     * The clone-versus-fork comparison.
     */
    renderStreamPanel() {
        ui.begin(UI_ANCHORS.BOTTOM_RIGHT);
        ui.panel(`One more generator (seed ${this.streams.seed})`);
        ui.kv('original', this.streams.base.join(' '));
        ui.kv('clone()', this.streams.cloned.join(' '));
        ui.kv('fork()', this.streams.forked.join(' '));
        ui.separator();
        ui.label('A clone carries on identically.', { color: 'dim' });
        ui.label('A fork goes its own way, and its', { color: 'dim' });
        ui.label(`seedValue reads ${this.streams.forkSeed ?? 'unknown'}.`, { color: 'dim' });
        ui.end();
    }

    /**
     * Picks a fresh, easy-to-read seed.
     *
     * @returns {number}
     */
    rollSeed() {
        // intInclusive(a, b) can return b itself, unlike int(a, b) which stops just short of
        // it. For a seed range meant to read as "1000 to 9999", inclusive is what we want.
        //
        // This comes from seedPicker rather than BT.random – see the field for why.
        return this.seedPicker.intInclusive(SEED_MIN, SEED_MAX);
    }

    /**
     * Works out, once, what clone() and fork() do to a generator.
     */
    sampleStreams() {
        // A generator of our own, separate from the shared BT.random, so sampling it cannot
        // disturb the worlds we just built. `new Random(seed)` is how you make one.
        const seed = this.rollSeed();
        const original = new Random(seed);

        // Order matters here. fork() has to draw one number from the parent to seed the child,
        // which nudges the parent forward. So we fork FIRST, and only then take the clone -
        // that way the original and its clone are standing in the same place, and any
        // difference you see between them would be a real one.
        const forked = original.fork();
        const cloned = original.clone();

        for (let i = 0; i < STREAM_SAMPLE; i++) {
            // int(100) is shorthand for int(0, 100): a whole number from 0 to 99.
            this.streams.base.push(original.int(100));
            this.streams.cloned.push(cloned.int(100));
            this.streams.forked.push(forked.int(100));
        }

        this.streams.seed = seed;

        // A fork is a brand new stream, so the engine refuses to claim it was seeded by us -
        // its seedValue is deliberately left unknown.
        this.streams.forkSeed = forked.seedValue;
    }
}

bootstrap(Demo);
