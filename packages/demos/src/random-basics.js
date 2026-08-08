// Random Basics: the shuffling, weighting, and scattering tools built into the engine.
//
// Part of the BLIT386 demo series (written for readers about 12 years old).
//
// Prerequisites:
//   Basics     https://demos.blit386.dev/basics
//   Primitives https://demos.blit386.dev/primitives
//   Colors     https://demos.blit386.dev/colors
//
// WHAT YOU WILL SEE
// Five small scenes, one at a time. Press 1-5 (or tap the buttons) to switch between them.
// Each scene shows off one way of asking the engine for a random result:
//   1. Shuffle    - mixing a row of cards, and the difference between the two ways to do it
//   2. Weighted   - a treasure chest where rare prizes really are rare
//   3. Gaussian   - arrows landing near a target instead of anywhere at all
//   4. Sign       - a coin flip that answers "left" or "right"
//   5. Directions – two bugs walking a grid, one allowed 4 ways, the other allowed 8
//
// WHAT YOU WILL LEARN
//   - BT.random.shuffle() hands back a NEW mixed-up copy and leaves your list alone
//   - BT.random.shuffleInPlace() mixes up the list you gave it, so the old order is gone
//   - BT.random.weighted() lets you say "this prize should show up 70 times as often"
//   - BT.random.gaussian() clumps results near a middle value instead of spreading them evenly
//   - BT.random.sign() answers -1 or 1, which is perfect for "which way?" questions
//   - BT.random.direction4() and direction8() hand back a ready-made step as a Vector2i
//
// A NOTE ON WHAT IS NOT HERE
// The everyday tools – int(), float(), and pick() – already appear all over the other demos,
// so this one covers the ones you have not met yet. The Camera demo uses int() and
// pointInRange() to scatter buildings: https://demos.blit386.dev/camera
//
// The engine splits work the usual way: update() moves things; render() only draws.
// See the Basics demo for the full story: https://demos.blit386.dev/basics

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */

// This demo runs at the engine's default screen size of 320x240 "game pixels", which is what
// every position and size below is measured in.

// The five scenes, in the order the number keys select them.
const MODE_SHUFFLE = 0;
const MODE_WEIGHTED = 1;
const MODE_GAUSSIAN = 2;
const MODE_SIGN = 3;
const MODE_DIRECTIONS = 4;

// Names shown in the mode panel. The array position matches the MODE_* numbers above.
const MODE_NAMES = ['Shuffle', 'Weighted', 'Gaussian', 'Sign', 'Directions'];

// Color slots. The shared UI kit owns slots 240-251, so scene colors stay well below that.
const C_BG = 1; // Dark background behind every scene.
const C_INK = 2; // Bright text and outlines.
const C_DIM = 3; // Faded lines: guides, grids, and old trails.
const C_TARGET = 4; // The target rings in the Gaussian scene.
const C_SHOT = 5; // Arrows that used gaussian().
const C_SHOT_FLAT = 6; // Arrows that used float() instead, for comparison.
const C_BUG_A = 7; // The 4-direction bug.
const C_BUG_B = 8; // The 8-direction bug.

// The eight cards in the shuffle scene each get their own color, in slots 10-17.
const C_CARD_BASE = 10;
const CARD_COUNT = 8;

// Card size, and how far apart their left edges sit. Eight cards at 34 pixels apart, starting
// 22 pixels in, reach x = 294 – just inside the 320-pixel screen.
const CARD_W = 26;
const CARD_H = 34;
const CARD_STRIDE = 34;
const CARD_LEFT = 22;

// The four treasure tiers each get their own color, in slots 20-23.
const C_TIER_BASE = 20;

// Treasure tiers, rarest last. `TIER_INDEXES` is what we actually hand to weighted():
// asking for the index rather than the name means the answer can be used to look up both
// the label and the color without searching the array afterward.
const TIER_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary'];
const TIER_INDEXES = [0, 1, 2, 3];
const TIER_WEIGHTS = [70, 20, 9, 1];

// How many update ticks pass between automatic treasure drops.
const DROP_EVERY_TICKS = 8;

// The falling gems disappear once they reach this line.
const DROP_FLOOR_Y = 132;

// How many arrows stay on screen in the Gaussian scene before the oldest is reused.
const SHOT_COUNT = 120;

// How many update ticks pass between arrows.
const SHOT_EVERY_TICKS = 3;

// Where the target sits, and how wide its rings are.
const TARGET_CENTER = new Vector2i(160, 76);
const TARGET_RINGS = [44, 33, 22, 11];

// The Sign scene walks a dot along this line.
const WALK_Y = 88;
const WALK_LEFT = 40;
const WALK_RIGHT = 280;

// How many update ticks pass between walker steps and bug steps.
const STEP_EVERY_TICKS = 6;

// The Directions scene gives each bug its own square to wander, and remembers this many
// of its recent positions as a trail.
const BUG_AREA_A = new Rect2i(24, 28, 120, 94);
const BUG_AREA_B = new Rect2i(176, 28, 120, 94);
const TRAIL_LENGTH = 90;

// Each bug is drawn as a small square centered on its position, reaching BUG_REACH pixels
// out in every direction. The bug therefore has to stop BUG_REACH short of its square's
// edge, or half the marker would hang outside the frame.
const BUG_REACH = 2;
const BUG_SIZE = BUG_REACH * 2 + 1;

/**
 * Clamps a whole number so it never leaves the range min..max.
 *
 * "Clamp" means "keep it inside the fence": if the value wandered past either end, this
 * pushes it back to the nearest edge.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampInt(value, min, max) {
    if (value < min) {
        return min;
    }

    if (value > max) {
        return max;
    }

    return value;
}

/**
 * Five small scenes covering the parts of BT.random the other demos do not use.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Slot map for the shared UI kit theme, filled in by applyTheme() during init().
    theme = null;

    // Which scene is on screen right now. Starts on the shuffle cards.
    mode = MODE_SHUFFLE;

    // Counts update ticks so the scenes can act every few ticks instead of every single one.
    ticks = 0;

    // SHUFFLE SCENE
    // `deck` is the real list of cards. `shuffled` is the copy that shuffle() handed back.
    // Keeping them apart is the whole point of this scene: one button changes only the copy,
    // the other button changes the list itself.
    deck = [];
    shuffled = [];

    // WEIGHTED SCENE
    // How many of each tier have dropped so far, and the gems currently falling.
    tierCounts = [0, 0, 0, 0];
    gems = [];

    // GAUSSIAN SCENE
    // A fixed-size ring of arrow positions. `shotNext` says which slot the next arrow
    // overwrites, so the oldest arrow quietly disappears without any array shuffling.
    shots = [];
    shotNext = 0;
    shotSpread = 18;
    useGaussian = true;

    // SIGN SCENE
    // Where the walker stands, and how many times each answer has come up.
    walkX = (WALK_LEFT + WALK_RIGHT) / 2;
    leftCount = 0;
    rightCount = 0;

    // DIRECTIONS SCENE
    // Each bug remembers where it is and where it has been.
    bugA = { pos: new Vector2i(0, 0), trail: [] };
    bugB = { pos: new Vector2i(0, 0), trail: [] };

    /**
     * Builds the palette and fills in the starting state of every scene.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(14, 16, 26)); // Near-black blue background.
        this.palette.set(C_INK, new Color32(226, 232, 244)); // Bright text and outlines.
        this.palette.set(C_DIM, new Color32(72, 80, 102)); // Faded guides and grids.
        this.palette.set(C_TARGET, new Color32(196, 148, 64)); // Amber target rings.
        this.palette.set(C_SHOT, new Color32(120, 226, 168)); // Green arrows: gaussian().
        this.palette.set(C_SHOT_FLAT, new Color32(226, 120, 140)); // Red arrows: float().
        this.palette.set(C_BUG_A, new Color32(126, 190, 255)); // Blue 4-direction bug.
        this.palette.set(C_BUG_B, new Color32(255, 186, 110)); // Orange 8-direction bug.

        // Eight card colors spread around the rainbow, so a reordering is obvious at a glance.
        // A "hue" is a position on the color wheel: 0 is red, 120 is green, 240 is blue, and
        // 360 comes back around to red. Stepping evenly around the wheel is the quickest way
        // to get eight colors nobody could confuse with each other.
        for (let i = 0; i < CARD_COUNT; i++) {
            const hue = (i / CARD_COUNT) * 360;

            // fromHSL takes the hue, then how colorful it is (0-100), then how light (0-100).
            this.palette.set(C_CARD_BASE + i, Color32.fromHSL(hue, 70, 62));
        }

        // Four treasure colors, getting brighter as the prize gets rarer.
        this.palette.set(C_TIER_BASE + 0, new Color32(140, 150, 165)); // Common: dull gray.
        this.palette.set(C_TIER_BASE + 1, new Color32(120, 210, 140)); // Uncommon: green.
        this.palette.set(C_TIER_BASE + 2, new Color32(120, 170, 255)); // Rare: blue.
        this.palette.set(C_TIER_BASE + 3, new Color32(255, 210, 110)); // Legendary: gold.

        // Install the shared UI colors, then hand the finished palette to the engine.
        // applyTheme() must come before paletteSet() so the kit's colors are included.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // The deck starts in order: card 0, card 1, card 2, and so on. Starting tidy means
        // the first shuffle is easy to see.
        for (let i = 0; i < CARD_COUNT; i++) {
            this.deck.push(i);
        }

        // Before anyone presses a button, the "shuffled copy" is just a copy of the deck.
        this.shuffled = this.deck.slice();

        // Fill the arrow ring with off-screen positions so nothing is drawn until the first
        // arrow is actually fired.
        for (let i = 0; i < SHOT_COUNT; i++) {
            this.shots.push({ x: -100, y: -100, wasGaussian: true });
        }

        // Start each bug in the middle of its own square.
        this.bugA.pos = new Vector2i(
            BUG_AREA_A.x + Math.floor(BUG_AREA_A.width / 2),
            BUG_AREA_A.y + Math.floor(BUG_AREA_A.height / 2),
        );
        this.bugB.pos = new Vector2i(
            BUG_AREA_B.x + Math.floor(BUG_AREA_B.width / 2),
            BUG_AREA_B.y + Math.floor(BUG_AREA_B.height / 2),
        );

        return true;
    }

    /**
     * Advances whichever scene is currently on screen.
     */
    update() {
        // Always first: this is what makes the { key } shortcuts on buttons work.
        ui.tick();

        this.ticks++;

        // Number keys jump straight to a scene. Reading key presses here in update() – never
        // in render() – is what keeps a quick tap from being missed.
        if (BT.isKeyPressed('Digit1')) {
            this.mode = MODE_SHUFFLE;
        }

        if (BT.isKeyPressed('Digit2')) {
            this.mode = MODE_WEIGHTED;
        }

        if (BT.isKeyPressed('Digit3')) {
            this.mode = MODE_GAUSSIAN;
        }

        if (BT.isKeyPressed('Digit4')) {
            this.mode = MODE_SIGN;
        }

        if (BT.isKeyPressed('Digit5')) {
            this.mode = MODE_DIRECTIONS;
        }

        // Only the scene being looked at needs to do any work.
        if (this.mode === MODE_WEIGHTED) {
            this.updateWeighted();
        } else if (this.mode === MODE_GAUSSIAN) {
            this.updateGaussian();
        } else if (this.mode === MODE_SIGN) {
            this.updateSign();
        } else if (this.mode === MODE_DIRECTIONS) {
            this.updateDirections();
        }
    }

    /**
     * Draws the current scene, then the panels on top of it.
     */
    render() {
        BT.clear(C_BG);

        if (this.mode === MODE_SHUFFLE) {
            this.renderShuffle();
        } else if (this.mode === MODE_WEIGHTED) {
            this.renderWeighted();
        } else if (this.mode === MODE_GAUSSIAN) {
            this.renderGaussian();
        } else if (this.mode === MODE_SIGN) {
            this.renderSign();
        } else {
            this.renderDirections();
        }

        // The mode picker sits in the same corner in every scene, so it never moves around.
        // Two arrow buttons rather than five named ones: at 320x240 a five-row panel would
        // swallow half the screen, and the number keys still jump straight to a scene.
        ui.begin('bottomLeft');
        ui.panel(`Scene ${this.mode + 1}/5 (keys 1-5)`);
        ui.label(MODE_NAMES[this.mode], { color: 'accent' });

        // The two buttons are tappable, so someone on a phone can reach every scene without
        // a keyboard. Adding MODE_NAMES.length before taking the remainder keeps the answer
        // positive when stepping back from scene 1.
        if (ui.button('< Prev')) {
            this.mode = (this.mode + MODE_NAMES.length - 1) % MODE_NAMES.length;
        }

        if (ui.button('Next >')) {
            this.mode = (this.mode + 1) % MODE_NAMES.length;
        }

        ui.end();

        // Each scene adds its own controls and readouts in the opposite corner.
        if (this.mode === MODE_SHUFFLE) {
            this.renderShufflePanel();
        } else if (this.mode === MODE_WEIGHTED) {
            this.renderWeightedPanel();
        } else if (this.mode === MODE_GAUSSIAN) {
            this.renderGaussianPanel();
        } else if (this.mode === MODE_SIGN) {
            this.renderSignPanel();
        } else {
            this.renderDirectionsPanel();
        }
    }

    /**
     * Drops a new gem every few ticks and moves the falling ones down the screen.
     */
    updateWeighted() {
        if (this.ticks % DROP_EVERY_TICKS === 0) {
            this.dropGem();
        }

        // Walk the list backward so removing an item cannot make the loop skip the next one.
        for (let i = this.gems.length - 1; i >= 0; i--) {
            const gem = this.gems[i];

            gem.y += 2;

            if (gem.y >= DROP_FLOOR_Y) {
                this.gems.splice(i, 1);
            }
        }
    }

    /**
     * Asks weighted() for one treasure tier and starts a gem falling.
     */
    dropGem() {
        // weighted() picks one entry from the first list, using the second list as the
        // "how often should this win?" numbers. The weights here are 70, 20, 9, and 1, so
        // Common turns up roughly 70 times for every 1 Legendary.
        //
        // We hand it TIER_INDEXES (0, 1, 2, 3) rather than the names, because the number it
        // returns is then ready to use as a position in TIER_NAMES and as a color slot.
        const tier = BT.random.weighted(TIER_INDEXES, TIER_WEIGHTS);

        this.tierCounts[tier]++;

        this.gems.push({
            // int(a, b) gives a whole number from a up to (but not including) b, so this lands
            // somewhere across the middle of the screen.
            x: BT.random.int(110, 210),
            y: 40,
            tier,
        });
    }

    /**
     * Fires an arrow at the target every few ticks.
     */
    updateGaussian() {
        if (this.ticks % SHOT_EVERY_TICKS !== 0) {
            return;
        }

        const shot = this.shots[this.shotNext];

        if (this.useGaussian) {
            // gaussian(middle, spread) clumps its answers around the middle value. Most land
            // close to it, a few land further out, and the really wild ones are rare – the
            // same way most people are close to average height and giants are unusual.
            shot.x = TARGET_CENTER.x + Math.round(BT.random.gaussian(0, this.shotSpread));
            shot.y = TARGET_CENTER.y + Math.round(BT.random.gaussian(0, this.shotSpread));
        } else {
            // float(a, b) is the flat version: every distance from the middle is equally
            // likely, so the arrows spread out into an even square with no clump at all.
            const reach = this.shotSpread * 2;

            shot.x = TARGET_CENTER.x + Math.round(BT.random.float(-reach, reach));
            shot.y = TARGET_CENTER.y + Math.round(BT.random.float(-reach, reach));
        }

        shot.wasGaussian = this.useGaussian;

        // Move to the next slot, wrapping back to 0 at the end. This is why the oldest arrow
        // vanishes without any list being rebuilt.
        this.shotNext = (this.shotNext + 1) % SHOT_COUNT;
    }

    /**
     * Steps the walker left or right.
     */
    updateSign() {
        if (this.ticks % STEP_EVERY_TICKS !== 0) {
            return;
        }

        // sign() answers -1 or 1, nothing else. Multiplying a distance by it turns "how far"
        // into "how far, and which way" in a single step.
        const direction = BT.random.sign();

        if (direction < 0) {
            this.leftCount++;
        } else {
            this.rightCount++;
        }

        this.walkX = clampInt(this.walkX + direction * 6, WALK_LEFT, WALK_RIGHT);
    }

    /**
     * Steps both bugs and records where they have been.
     */
    updateDirections() {
        if (this.ticks % STEP_EVERY_TICKS !== 0) {
            return;
        }

        // direction4() hands back a Vector2i that is one step up, down, left, or right – the
        // four ways a rook moves in chess. No diagonals.
        this.stepBug(this.bugA, BT.random.direction4(), BUG_AREA_A);

        // direction8() adds the four diagonals, so this bug has eight choices – the way a king
        // moves in chess. Its trail ends up looking rounder and less blocky.
        this.stepBug(this.bugB, BT.random.direction8(), BUG_AREA_B);
    }

    /**
     * Moves one bug by one step and remembers the position it left behind.
     *
     * @param {{ pos: Vector2i, trail: Array<Vector2i> }} bug
     * @param {Vector2i} step – One step, from direction4() or direction8().
     * @param {Rect2i} area – The square this bug is allowed to wander inside.
     */
    stepBug(bug, step, area) {
        // Remember where the bug was standing before it moved, so the trail grows behind it.
        bug.trail.push(new Vector2i(bug.pos.x, bug.pos.y));

        // Once the trail is long enough, drop the oldest position off the front. shift()
        // removes the first item in a list.
        if (bug.trail.length > TRAIL_LENGTH) {
            bug.trail.shift();
        }

        // Steps are 3 pixels so the trail is easy to see. clampInt keeps the bug from walking
        // out of its own square.
        //
        // The limits are pulled in twice over. The last pixel inside a square is one short of
        // its width, so a square 120 wide starting at x = 24 ends at x = 143. Then BUG_REACH
        // comes off each end as well, because the position is the middle of the marker rather
        // than its corner – without that the square would straddle the frame.
        bug.pos = new Vector2i(
            clampInt(bug.pos.x + step.x * 3, area.x + BUG_REACH, area.x + area.width - 1 - BUG_REACH),
            clampInt(bug.pos.y + step.y * 3, area.y + BUG_REACH, area.y + area.height - 1 - BUG_REACH),
        );
    }

    /**
     * Draws the two rows of cards.
     */
    renderShuffle() {
        ui.caption(CARD_LEFT, 10, 'The list itself');
        ui.caption(CARD_LEFT, 74, 'What shuffle() handed back', { color: 'dim' });

        this.renderCardRow(this.deck, 24);
        this.renderCardRow(this.shuffled, 88);
    }

    /**
     * Draws one row of colored cards.
     *
     * @param {Array<number>} cards – Card numbers, in the order they should appear.
     * @param {number} y – Top edge of the row.
     */
    renderCardRow(cards, y) {
        for (let i = 0; i < cards.length; i++) {
            const x = CARD_LEFT + i * CARD_STRIDE;

            // The card's number decides its color, so a card keeps its color wherever it moves.
            // That is what makes a reordering visible.
            BT.drawRectFill(new Rect2i(x, y, CARD_W, CARD_H), C_CARD_BASE + cards[i]);
            BT.drawRect(new Rect2i(x, y, CARD_W, CARD_H), C_INK);
        }
    }

    /**
     * Draws the chest, the falling gems, and the tier tally.
     */
    renderWeighted() {
        ui.caption(112, 8, 'Treasure chest');

        // The chest itself is just a box – the interesting part is what comes out of it.
        BT.drawRectFill(new Rect2i(140, 22, 40, 16), C_DIM);
        BT.drawRect(new Rect2i(140, 22, 40, 16), C_INK);

        for (const gem of this.gems) {
            BT.drawRectFill(new Rect2i(gem.x, gem.y, 6, 6), C_TIER_BASE + gem.tier);
        }
    }

    /**
     * Draws the target and every arrow currently stuck in it.
     */
    renderGaussian() {
        ui.caption(96, 8, 'Aim for the middle');

        // Concentric squares stand in for a round target – the engine draws rectangles, lines,
        // and pixels, so a "ring" here is a square outline.
        for (const radius of TARGET_RINGS) {
            BT.drawRect(
                new Rect2i(TARGET_CENTER.x - radius, TARGET_CENTER.y - radius, radius * 2, radius * 2),
                C_TARGET,
            );
        }

        for (const shot of this.shots) {
            BT.drawRectFill(new Rect2i(shot.x, shot.y, 2, 2), shot.wasGaussian ? C_SHOT : C_SHOT_FLAT);
        }
    }

    /**
     * Draws the walking line and the dot standing on it.
     */
    renderSign() {
        ui.caption(88, 50, 'Left or right, nothing else');

        BT.drawLine(new Vector2i(WALK_LEFT, WALK_Y), new Vector2i(WALK_RIGHT, WALK_Y), C_DIM);

        // A tick mark at the starting point, so it is obvious how far the walker has drifted.
        const start = (WALK_LEFT + WALK_RIGHT) / 2;

        BT.drawLine(new Vector2i(start, WALK_Y - 6), new Vector2i(start, WALK_Y + 6), C_DIM);

        BT.drawRectFill(new Rect2i(this.walkX - 3, WALK_Y - 3, 7, 7), C_INK);
    }

    /**
     * Draws both bugs and their trails.
     */
    renderDirections() {
        ui.caption(BUG_AREA_A.x, 12, '4 ways', { color: 'info' });
        ui.caption(BUG_AREA_B.x, 12, '8 ways', { color: 'warm' });

        BT.drawRect(BUG_AREA_A, C_DIM);
        BT.drawRect(BUG_AREA_B, C_DIM);

        this.renderBug(this.bugA, C_BUG_A);
        this.renderBug(this.bugB, C_BUG_B);
    }

    /**
     * Draws one bug's trail as single pixels, then the bug itself as a small square.
     *
     * @param {{ pos: Vector2i, trail: Array<Vector2i> }} bug
     * @param {number} colorSlot
     */
    renderBug(bug, colorSlot) {
        for (const point of bug.trail) {
            BT.drawPixel(point, C_DIM);
        }

        BT.drawRectFill(new Rect2i(bug.pos.x - BUG_REACH, bug.pos.y - BUG_REACH, BUG_SIZE, BUG_SIZE), colorSlot);
    }

    /**
     * The two shuffle buttons, which are the whole lesson of this scene.
     */
    renderShufflePanel() {
        ui.begin('bottomRight');
        ui.panel('Shuffle');

        if (ui.button('shuffle() a copy', { key: 'KeyC' })) {
            // shuffle() builds a NEW mixed-up list and hands that back. The original list is
            // untouched, which is why the top row does not move when you press this.
            this.shuffled = BT.random.shuffle(this.deck);
        }

        if (ui.button('shuffleInPlace()', { key: 'KeyP' })) {
            // shuffleInPlace() mixes up the list you handed it. The top row jumps, and the old
            // order is gone for good – there is no copy to go back to.
            BT.random.shuffleInPlace(this.deck);
        }

        ui.separator();
        ui.label('Copy leaves the top row alone.', { color: 'dim' });
        ui.label('In place changes it for real.', { color: 'dim' });
        ui.end();
    }

    /**
     * The running tally of how often each tier has dropped.
     */
    renderWeightedPanel() {
        // Adding the counts up gives us something to measure each tier against.
        let total = 0;

        for (const count of this.tierCounts) {
            total += count;
        }

        ui.begin('bottomRight');
        ui.panel('Drops so far');

        for (let i = 0; i < TIER_NAMES.length; i++) {
            // A meter wants a fraction from 0 to 1, so each count is divided by the total.
            // Guarding against a total of 0 avoids dividing by zero on the very first frame.
            const share = total > 0 ? this.tierCounts[i] / total : 0;

            ui.meter(`${TIER_NAMES[i]} ${this.tierCounts[i]}`, share);
        }

        ui.separator();
        ui.label(`Asked for 70 / 20 / 9 / 1`, { color: 'dim' });
        ui.label(`Total drops: ${total}`, { color: 'dim' });
        ui.end();
    }

    /**
     * The spread slider and the flat-versus-clumped switch.
     */
    renderGaussianPanel() {
        ui.begin('bottomRight');
        ui.panel('Scatter');

        this.useGaussian = ui.checkbox('Use gaussian()', this.useGaussian, { key: 'KeyG' });
        this.shotSpread = Math.round(ui.slider('Spread', this.shotSpread, { min: 4, max: 40 }));

        ui.separator();

        if (this.useGaussian) {
            ui.label('Clumped near the middle.', { color: 'dim' });
        } else {
            ui.label('Even, edge to edge.', { color: 'dim' });
        }

        ui.label('Toggle it and watch.', { color: 'dim' });
        ui.end();
    }

    /**
     * How many times sign() answered each way.
     */
    renderSignPanel() {
        const total = this.leftCount + this.rightCount;

        ui.begin('bottomRight');
        ui.panel('Coin flips');
        ui.kv('Left (-1)', this.leftCount);
        ui.kv('Right (+1)', this.rightCount);
        ui.kv('Total', total);
        ui.separator();
        ui.label('Close to even over time,', { color: 'dim' });
        ui.label('but never exactly even.', { color: 'dim' });
        ui.end();
    }

    /**
     * A reminder of what separates the two bugs.
     */
    renderDirectionsPanel() {
        ui.begin('bottomRight');
        ui.panel('Two bugs');
        ui.label('Blue: direction4()', { color: 'info' });
        ui.label('up, down, left, right', { color: 'dim' });
        ui.spacer(4);
        ui.label('Orange: direction8()', { color: 'warm' });
        ui.label('those four, plus diagonals', { color: 'dim' });
        ui.separator();
        ui.label('Both hand back a Vector2i.', { color: 'dim' });
        ui.end();
    }
}

bootstrap(Demo);
