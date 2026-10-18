/*

Seeded Worlds: the same number always builds the same world.
@description Two worlds side by side, each labeled with its seed. Copy one seed over and the halves match exactly.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - Random Basics: https://demos.blit386.dev/random-basics

Live version: https://demos.blit386.dev/seeded-worlds

Guides:
  - Random: https://blit386.dev/docs/guides/random#same-seed-same-world
  - Random: https://blit386.dev/docs/guides/random#independent-streams

Reference:
  - Random: https://blit386.dev/docs/api/random#state-and-streams

---

WHAT YOU WILL SEE
-----------------

Two little night-time worlds side by side, each inside a 152x100 frame: sixteen stars,
rolling hills, four buildings in four shades of blue-gray, and seven trees. Every one of
them was placed by a random number. Above each world is the number it grew from, called
its "seed". The engine overlay is turned off, so the worlds get the whole screen.

Press the buttons in the bottom-left "New seed" panel to give either side a new seed and
watch it rebuild. Then press "E Copy left -> right" and watch the right world turn into an
exact twin of the left one. Same number in, same world out, every single time. The line
under the worlds says "Same seed, same world" whenever the two seeds match.

The bottom-right panel runs a smaller experiment on a separate generator, titled with the
call that made it: three numbers from the original, three from a clone() of it, and three
from a fork() of it.

WHAT YOU WILL LEARN
-------------------

- BT.randomSeed(seed) tells the shared BT.random generator which number to start from.
- The same seed always produces the same sequence of numbers, so it builds the same world.
- BT.random.seedValue reads that number back - even the one the engine picked by itself
  from the clock when the page loaded.
- BT.random.int(min, max) and BT.random.insideRect(rect) place everything in a world;
  intInclusive(min, max) picks the seeds.
- new Random(seed) makes a generator of your own, separate from the shared one.
- clone() copies a generator so both continue with the same numbers; fork() splits off a
  new generator that goes its own way, and its seedValue is undefined on purpose.
- Nothing moves here, so update() only calls ui.tick() to keep the button key shortcuts
  working. All the drawing happens in render(), and isOverlayEnabled: false in
  configure() turns the engine overlay off.

WHY IS THIS USEFUL?
-------------------

A game can hand you a puzzle from seed 4821 and know every player gets the identical
puzzle. A saved game can store one number instead of a whole map. And when a run goes
really well, you can write the seed down and play it again.

TRY THIS
--------

- Press Q ("Q Left") or W ("W Right") to reroll one side. New seeds are four digits,
  from 1000 to 9999.
- Press E ("E Copy left -> right") and the right world becomes a twin of the left one.
- Read the bottom-right panel: the clone() row matches the original row exactly, and the
  fork() row does not. The fork's seedValue reads "none", because a fork was never given
  a seed of its own.
- The engine also takes a seed from the URL. Open the demo page on its own with
  ?embed&seed=4821 added and the left world always starts from 4821, because BT.init()
  applies ?seed= to BT.random right before init() runs. The shell page around the demo
  does not pass the parameter down to its frame.

*/

import { bootstrap, BT, Color32, Random, Rect2i, Vector2i } from 'blit386';

import { applyTheme, FONT_W, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// This demo runs at the engine's default screen size of 320x240 "game pixels".

// Each world gets its own framed box. Two boxes, side by side, with a gap between them.
// The frame is drawn one pixel outside the box, so with these numbers the frames sit 4
// pixels in from both screen edges and 4 pixels apart.
const WORLD_W = 152;
const WORLD_H = 100;
const WORLD_Y = 19;
const WORLD_LEFT_X = 5;
const WORLD_RIGHT_X = 163;

// The caption above each world, and the status line centered under both.
const SEED_CAPTION_Y = 10;
const STATUS_Y = 132;

// The two panels along the bottom, the same height. Widgets inside a panel start 9
// pixels in from its left edge and are 20 pixels narrower than it.
const PANEL_H = 87;
const PANEL_Y = 240 - 4 - PANEL_H;
const SEED_PANEL_X = 4;
const SEED_PANEL_W = 150;
const STREAM_PANEL_X = 160;
const STREAM_PANEL_W = 156;
const PANEL_CONTENT_X = 9;
const PANEL_CONTENT_SHRINK = 20;

// The Seeds panel holds two short buttons side by side, then one full-width button.
// The kit stacks a group's rows, so the panel reserves the space with empty rows and
// each button is placed with its own tiny group on top of it. A group pinned with pad 0
// starts its first row 5 pixels above the y it is given, hence PINNED_ROW_SHIFT.
const SEED_CONTENT_W = SEED_PANEL_W - PANEL_CONTENT_SHRINK;
const SEED_BUTTON_GAP = 6;
const SEED_HALF_W = (SEED_CONTENT_W - SEED_BUTTON_GAP) / 2;
const BUTTON_ROW_H = 27;
const PANEL_CONTENT_TOP = 22;
const PINNED_ROW_SHIFT = 5;
const SEED_GRID_X = SEED_PANEL_X + PANEL_CONTENT_X;
const SEED_GRID_Y = PANEL_Y + PANEL_CONTENT_TOP;

// The stream panel's value column starts after this many characters, so the longest key,
// "original", keeps a space after it.
const STREAM_KV_COLS = 9;

// The system font's right arrow, for the copy button.
const ARROW_RIGHT = '\u2192';

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

// Color slots. The shared UI kit owns slots 240-251, so scene colors stay well below
// that.
const C_SKY = 1; // night sky inside each world box
const C_STAR = 2; // stars
const C_GROUND = 3; // solid earth under the hills
const C_HILL = 4; // the hill surface line
const C_TREE = 5; // tree leaves
const C_TRUNK = 6; // tree trunks
const C_INK = 7; // frames and bright text
const C_DIM = 8; // faded lines

// Four building tints, in slots 10-13.
const C_BUILDING_BASE = 10;
const BUILDING_TINTS = 4;

// Builds one complete world from a single seed.
//
// This is the heart of the demo. Every random number it needs comes from BT.random, and
// BT.random was just told where to start, so running this twice with the same seed walks
// through the exact same numbers in the exact same order - and therefore builds the exact
// same world. Returns the seed plus the hills, buildings, trees, and stars it rolled.
function generateWorld(seed) {
    // This is the line that makes everything below repeatable. From here on the engine's
    // random numbers are no longer a surprise - they are decided by `seed`.
    BT.randomSeed(seed);

    // Stars first, scattered across the top 60 percent of the box.
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
        // Work out which pair of control points this column sits between, and how far
        // along it is between them (0 means "right on the left point", 1 means "right on
        // the right").
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
            // The building stands on the ground under its middle, so its top is that
            // ground height minus its own height.
            groundY: hills[x + Math.floor(w / 2)],
            // int(4) is shorthand for int(0, 4): 0, 1, 2, or 3. That picks one of the
            // four building shades.
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

// Two worlds side by side, proving that the same seed rebuilds the same world.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Slot map for the shared UI kit theme, filled in by applyTheme() during init().
    theme = null;

    // The left world. Each world remembers everything it was built from - that is the
    // difference between this demo and the Coordinate Patterns one, which remembers
    // nothing at all: https://demos.blit386.dev/coordinate-patterns
    left = null;

    // The right world.
    right = null;

    // Whether the engine picked the very first seeds by itself. Once the user presses a
    // button this turns false, because from then on the seeds were chosen on purpose.
    seedsWereAutomatic = true;

    // A snapshot of what clone() and fork() do, worked out once in init().
    streams = { seed: 0, base: [], cloned: [], forked: [], forkSeed: undefined };

    // A private generator used only for choosing new seeds.
    //
    // It cannot be the shared BT.random, because generateWorld() reseeds that one.
    // Drawing the next seed from a stream we just reseeded makes the answer a fixed
    // consequence of the seed we reseeded it with - so "Copy left seed" followed by "New
    // right" would hand back the very same number every time, and the button would look
    // broken.
    /** @type {Random | null} */
    seedPicker = null;

    // Turns the engine overlay off: nothing moves here, so there is no timing to watch,
    // and the worlds and panels need the whole screen.
    configure() {
        return {
            isOverlayEnabled: false,
        };
    }

    // Builds the palette, then grows both worlds from seeds nobody chose.
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_SKY, new Color32(16, 20, 38)); // night sky
        this.palette.set(C_STAR, new Color32(220, 228, 245)); // stars
        this.palette.set(C_GROUND, new Color32(28, 40, 32)); // solid earth
        this.palette.set(C_HILL, new Color32(74, 116, 80)); // grassy hill surface
        this.palette.set(C_TREE, new Color32(96, 168, 104)); // leaves
        this.palette.set(C_TRUNK, new Color32(90, 68, 48)); // trunks
        this.palette.set(C_INK, new Color32(226, 232, 244)); // frames and bright text
        this.palette.set(C_DIM, new Color32(72, 80, 102)); // faded lines

        // Four window-lit building shades, from dull to bright.
        this.palette.set(C_BUILDING_BASE + 0, new Color32(64, 72, 96));
        this.palette.set(C_BUILDING_BASE + 1, new Color32(84, 92, 118));
        this.palette.set(C_BUILDING_BASE + 2, new Color32(104, 112, 140));
        this.palette.set(C_BUILDING_BASE + 3, new Color32(126, 134, 162));

        // Install the shared UI colors, then hand the finished palette to the engine.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Set up the seed picker before anything asks it for a number. Left to itself, a
        // new Random seeds from the clock, so this stream is unrelated to the shared one.
        this.seedPicker = new Random();

        // Nobody has chosen a seed yet. The engine seeded itself from the clock when it
        // started up (or from ?seed= in the URL, if there was one), and seedValue hands
        // that number back - so we can build a world from it and still show which number
        // it was.
        //
        // That is the part worth noticing: even the run you did not plan has a seed you
        // can write down and return to.
        this.left = generateWorld(BT.random.seedValue ?? SEED_MIN);
        this.right = generateWorld(this.rollSeed());

        this.sampleStreams();

        return true;
    }

    // Nothing moves in this demo, so update() only keeps the UI kit's key shortcuts
    // alive.
    update() {
        // Always first: this is what makes the { key } shortcuts on buttons work.
        ui.tick();
    }

    // Draws both worlds, their seeds, the status line, and the control panels.
    //
    // The panels come first: their buttons can rebuild a world this very frame, and the
    // worlds drawn after them should already show the new one. Shapes are drawn under
    // every panel anyway, so the order costs nothing on screen.
    render() {
        BT.clear(C_SKY);

        this.renderSeedPanel();
        this.renderStreamPanel();

        this.renderWorld(this.left, WORLD_LEFT_X);
        this.renderWorld(this.right, WORLD_RIGHT_X);

        // Each world's seed sits directly above it, so there is no doubt which is which.
        ui.caption(WORLD_LEFT_X, SEED_CAPTION_Y, `seed ${this.left.seed}`);
        ui.caption(WORLD_RIGHT_X, SEED_CAPTION_Y, `seed ${this.right.seed}`);

        this.renderStatusLine();
    }

    // One centered line under the worlds. When both seeds match, say so plainly - this is
    // the moment the demo exists for.
    renderStatusLine() {
        let text = 'Different seeds, different worlds';
        let color = 'dim';

        if (this.left.seed === this.right.seed) {
            text = 'Same seed, same world';
            color = 'accent';
        } else if (this.seedsWereAutomatic) {
            // Nobody typed the left seed: the engine made it from the clock when the demo
            // started (or took it from ?seed= in the URL). seedValue is how we can still
            // read it.
            text = 'The left seed came from the clock';
        }

        // FONT_W is the width of one character; the last one's empty spacing column is
        // left out, so the visible letters are what gets centered.
        const x = Math.floor(BT.displaySize.x / 2) - Math.floor((text.length * FONT_W - 1) / 2);

        ui.caption(x, STATUS_Y, text, { color });
    }

    // Draws one world inside its frame. `originX` is the left edge of this world's box on
    // screen.
    renderWorld(world, originX) {
        // Everything inside a world is stored in "world coordinates" starting at 0, so
        // each thing is drawn by adding the box's own corner to it. That is what lets the
        // exact same world data be drawn on either side of the screen.
        for (const star of world.stars) {
            BT.drawPixel(new Vector2i(originX + star.x, WORLD_Y + star.y), C_STAR);
        }

        // The ground: one vertical line per column, from the hill surface down to the
        // bottom, with a single brighter pixel marking the surface itself.
        for (let x = 0; x < WORLD_W; x++) {
            const top = world.hills[x];

            BT.drawLine(
                new Vector2i(originX + x, WORLD_Y + top),
                new Vector2i(originX + x, WORLD_Y + WORLD_H - 1),
                C_GROUND,
            );
            BT.drawPixel(new Vector2i(originX + x, WORLD_Y + top), C_HILL);
        }

        // Buildings: a filled box in one of the four tints, standing on its ground
        // height.
        for (const b of world.buildings) {
            BT.drawRectFill(new Rect2i(originX + b.x, WORLD_Y + b.groundY - b.h, b.w, b.h), C_BUILDING_BASE + b.tint);
        }

        for (const t of world.trees) {
            // A trunk, then a 5x5 blob of leaves on top of it.
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

    // The three buttons that reseed the worlds: the panel itself with empty rows where
    // the buttons go, then each button pinned on top of it (see SEED_GRID_X).
    renderSeedPanel() {
        ui.begin('topLeft', { x: SEED_PANEL_X, y: PANEL_Y, width: SEED_PANEL_W });
        ui.panel('New seed');
        ui.spacer(2 * BUTTON_ROW_H);
        ui.end();

        if (this.pinnedButton('Q Left', 'KeyQ', SEED_GRID_X, SEED_GRID_Y, SEED_HALF_W)) {
            this.left = generateWorld(this.rollSeed());
            this.seedsWereAutomatic = false;
        }

        const rightX = SEED_GRID_X + SEED_HALF_W + SEED_BUTTON_GAP;

        if (this.pinnedButton('W Right', 'KeyW', rightX, SEED_GRID_Y, SEED_HALF_W)) {
            this.right = generateWorld(this.rollSeed());
            this.seedsWereAutomatic = false;
        }

        const copyLabel = `E Copy left ${ARROW_RIGHT} right`;

        if (this.pinnedButton(copyLabel, 'KeyE', SEED_GRID_X, SEED_GRID_Y + BUTTON_ROW_H, SEED_CONTENT_W)) {
            // Nothing about the right world is copied here - only the number. The world
            // is rebuilt from scratch, and it comes back identical because the number is
            // the same.
            this.right = generateWorld(this.left.seed);
            this.seedsWereAutomatic = false;
        }
    }

    // One button in its own tiny group, with its row starting at (x, y). Returns true on
    // the frame it is clicked, tapped, or its key is pressed, like ui.button().
    pinnedButton(label, key, x, y, width) {
        ui.begin('topLeft', { x, y: y + PINNED_ROW_SHIFT, pad: 0 });

        const pressed = ui.button(label, { key, width });

        ui.end();

        return pressed;
    }

    // The clone-versus-fork comparison, on a generator of its own.
    renderStreamPanel() {
        ui.begin('topLeft', { x: STREAM_PANEL_X, y: PANEL_Y, width: STREAM_PANEL_W, kvCols: STREAM_KV_COLS });
        ui.panel(`new Random(${this.streams.seed})`);
        ui.kv('original', this.streams.base.join(' '));
        ui.kv('clone()', this.streams.cloned.join(' '));
        ui.kv('fork()', this.streams.forked.join(' '));
        ui.spacer(4);
        ui.label('clone: same numbers', { color: 'dim' });

        // A fork's seedValue is undefined on purpose - see sampleStreams().
        ui.label(`fork: seedValue ${this.streams.forkSeed ?? 'none'}`, { color: 'dim' });
        ui.end();
    }

    // Picks a fresh, easy-to-read seed.
    rollSeed() {
        // intInclusive(a, b) can return b itself, unlike int(a, b) which stops just short
        // of it. For a seed range meant to read as "1000 to 9999", inclusive is what we
        // want.
        //
        // This comes from seedPicker rather than BT.random - see the field for why.
        return this.seedPicker.intInclusive(SEED_MIN, SEED_MAX);
    }

    // Works out, once, what clone() and fork() do to a generator.
    sampleStreams() {
        // A generator of our own, separate from the shared BT.random, so sampling it
        // cannot disturb the worlds we just built. `new Random(seed)` is how you make
        // one.
        const seed = this.rollSeed();
        const original = new Random(seed);

        // Order matters here. fork() has to draw one number from the parent to seed the
        // child, which nudges the parent forward. So we fork FIRST, and only then take
        // the clone - that way the original and its clone are standing in the same place,
        // and any difference you see between them would be a real one.
        const forked = original.fork();
        const cloned = original.clone();

        for (let i = 0; i < STREAM_SAMPLE; i++) {
            // int(100) is shorthand for int(0, 100): a whole number from 0 to 99.
            this.streams.base.push(original.int(100));
            this.streams.cloned.push(cloned.int(100));
            this.streams.forked.push(forked.int(100));
        }

        this.streams.seed = seed;

        // A fork is a brand new stream, so the engine refuses to claim it was seeded by
        // us - its seedValue is deliberately left undefined, which the panel shows as
        // "unknown".
        this.streams.forkSeed = forked.seedValue;
    }
}

bootstrap(Demo);
