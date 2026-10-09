// Test state: a live readout of the running game, plus a clock you can rewind.
// @description Show the test-state snapshot fields, then reset ticks and watch the clock drop.
//
// Prerequisites:
//   Basics    https://demos.blit386.dev/basics
//   Animation https://demos.blit386.dev/animation
//
// Guides:
//   Test state  https://blit386.dev/docs/api/core#test-state-for-agent-play-testing
//   Game loop   https://blit386.dev/docs/api/game-loop
//
// WHAT YOU WILL SEE
// A square riding a circle. Its place on the circle comes from the engine clock
// (BT.ticks), so it is a picture of the tick counter. A panel prints the same
// clock two ways: the live counter, and the copy inside BT.testState().
//
// WHAT YOU WILL LEARN
//   - BT.testState() returns a TestStateSnapshot: ticks, backend, state, and
//     sometimes error. It is how a script or an agent reads the game as JSON.
//   - The optional testState() method on the demo class is the game's half of
//     that snapshot. The engine never calls it on its own.
//   - The snapshot is a copy. A Vector2i comes back as plain { x, y }, and
//     changing the copy cannot move the real square.
//   - BT.ticksReset() sets BT.ticks (and BT.timeSeconds) back to zero. Your own
//     fields, such as the score, stay where you left them. The square jumps
//     home because its position is computed from the clock, not stored.
//
// HOW TO TRY IT
//   - Press A (or tap "Add point") and watch score climb in the snapshot.
//   - Press R (or tap "Reset ticks"). The tick numbers drop to zero and the
//     square snaps back to the right side of the ring. The score does not.
//   - Press F (or tap "Fail hook") to make testState() throw. The snapshot
//     then shows state null and a short error, and the panel holds that one
//     failed copy so the console is not flooded.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').TestStateSnapshot} TestStateSnapshot */

// Scene colors live in low palette slots. The shared UI kit owns slots 240-251
// (see applyTheme in init()), so these never collide with panel colors.
const C_BG = 1; // Near-black blue: the page behind the ring.
const C_RING = 2; // Dim slate: the box the square orbits inside.
const C_HOME = 3; // Quiet green: the spot the square sits on at tick 0.
const C_MARKER = 4; // Bright amber: the square itself.

// The ring sits in the open middle, clear of the corner panels.
const ORBIT_CENTER_X = 118;
const ORBIT_CENTER_Y = 108;
const ORBIT_RADIUS = 28;

// Tick 0 puts the square on the right edge of the ring (cos 0 is 1, sin 0 is 0).
// That dot stays put so a reset has an obvious home to snap back to.
const HOME_X = ORBIT_CENTER_X + ORBIT_RADIUS;
const HOME_Y = ORBIT_CENTER_Y;

// How many pixels on a side the square and the home dot are.
const MARKER_SIZE = 7;
const HOME_SIZE = 3;

// Math.cos and Math.sin take an angle in radians, and a full circle is about 6.28
// of those. Dividing the tick count by this number makes one lap take about
// 6.28 * 16 = 100 ticks, a bit over a second and a half at 60 updates per second.
const ORBIT_TICKS_PER_RADIAN = 16;

/**
 * Shows BT.testState() and what BT.ticksReset() does to the clock.
 *
 * @implements {IBTDemo}
 */
class Demo {
    // Points the player has added. This is game state, not the engine clock, so a
    // tick reset must leave it alone.
    score = 0;

    // True while the readout is deliberately broken, so the error field has
    // something to show.
    failReadout = false;

    // The failed snapshot, kept on screen until the hook is healthy again.
    // Calling BT.testState() every frame while the hook throws would log a fresh
    // error sixty times a second.
    /** @type {TestStateSnapshot | null} */
    frozenSnapshot = null;

    // Where the square is this frame, in whole pixels. testState() hands this
    // object to the engine, which copies it into plain JSON.
    marker = new Vector2i(HOME_X, HOME_Y);

    // Reused rectangles so drawing the ring does not allocate a new one every frame.
    ringRect = new Rect2i(
        ORBIT_CENTER_X - ORBIT_RADIUS,
        ORBIT_CENTER_Y - ORBIT_RADIUS,
        ORBIT_RADIUS * 2,
        ORBIT_RADIUS * 2,
    );

    homeRect = new Rect2i(HOME_X - (HOME_SIZE >> 1), HOME_Y - (HOME_SIZE >> 1), HOME_SIZE, HOME_SIZE);

    markerRect = new Rect2i(0, 0, MARKER_SIZE, MARKER_SIZE);

    // Text for the clock panel: the tick count just before the latest reset.
    resetNote = 'No reset yet';

    async init() {
        // The palette is local because no later frame changes a slot. applyTheme()
        // still has to run before BT.paletteSet(): it paints the shared UI colors
        // into slots 240-251, which every panel draws with.
        const palette = BT.paletteCreate(256);

        applyTheme(palette);

        // Color32(red, green, blue) stores one paint color. Each channel is 0 (none)
        // through 255 (full). palette.set() drops that color into a numbered slot.
        palette.set(C_BG, new Color32(12, 16, 28));
        palette.set(C_RING, new Color32(70, 84, 110));
        palette.set(C_HOME, new Color32(90, 160, 110));
        palette.set(C_MARKER, new Color32(240, 176, 48));

        BT.paletteSet(palette);

        return true;
    }

    update() {
        // First line: lets the kit latch key presses and taps for the buttons below.
        // This demo does not move anything here. The square's position is a picture
        // of BT.ticks, worked out in render() after a reset has had a chance to run.
        ui.tick();
    }

    render() {
        BT.clear(C_BG);

        // Buttons first, so a reset or a new point is already applied before the
        // panels and the square read the clock and the score.
        this.drawControls();
        this.placeMarker();
        this.drawClock();
        this.drawSnapshot();

        // The ring is drawn after the panels. It sits in the gap between them, so
        // painting it last cannot cover a button, and it still follows a reset
        // that happened earlier in this same frame.
        this.drawOrbit();
    }

    /**
     * The game's half of the snapshot. BT.testState() calls this, then wraps the
     * result with the tick count and the backend.
     *
     * Must return plain JSON: numbers, strings, booleans, null, arrays, and plain
     * objects. A Vector2i is a class instance; the engine copies it down to { x, y }.
     *
     * @returns {unknown} Score and marker, or a throw when the fail switch is on.
     */
    testState() {
        if (this.failReadout) {
            // The engine catches this. The snapshot comes back with state null and
            // the message in error, and the game keeps running.
            throw new Error('hook failed');
        }

        return {
            score: this.score,
            marker: this.marker,
        };
    }

    /** Bottom-left: the three actions, each with a key and a tap target. */
    drawControls() {
        ui.begin(UI_ANCHORS.BOTTOM_LEFT);
        ui.panel('Try it');

        if (ui.button('Add point (A)', { key: 'KeyA' })) {
            // One point per press. Held keys do not repeat, because the button
            // listens for the press edge the kit latched in update().
            this.score += 1;
        }

        if (ui.button('Reset ticks (R)', { key: 'KeyR' })) {
            // Remember the old count first. ticksReset() does not return it.
            this.resetNote = `Was ${BT.ticks}`;
            // Sends the engine clock back to zero. BT.ticks and BT.timeSeconds
            // both follow that counter. The score field above is not touched.
            BT.ticksReset();
        }

        // A checkbox, not a button: the broken hook stays broken until you turn
        // it off, which is what makes the error line readable.
        this.failReadout = ui.checkbox('Fail hook (F)', this.failReadout, { key: 'KeyF' });

        ui.end();
    }

    /** Top-left: the live clock, and the tick count from just before the last reset. */
    drawClock() {
        ui.begin(UI_ANCHORS.TOP_LEFT);
        ui.panel('Clock');

        // BT.ticks counts finished update() steps. BT.ticksReset() sets it to 0,
        // and the next update() climbs from there (the counter advances after
        // update returns, so the frame after a reset usually shows 1, not 0,
        // unless you read it in the same frame as the reset).
        ui.kv('ticks', BT.ticks);

        // timeSeconds is ticks times the length of one tick. At 60 updates per
        // second that length is 1/60, so resetting ticks also resets this to 0.
        // toFixed(2) prints two digits after the decimal point.
        ui.kv('seconds', BT.timeSeconds.toFixed(2));

        ui.label(this.resetNote, { color: 'dim' });
        ui.end();
    }

    /** Top-right: one TestStateSnapshot, field by field. */
    drawSnapshot() {
        const snap = this.readSnapshot();
        // null means the hook failed (or a game has no hook). Anything else is the
        // copied score and marker; we do not reshape other values into null.
        const copied = snap.state;

        ui.begin(UI_ANCHORS.TOP_RIGHT);
        ui.panel('Snapshot');

        // Same number as BT.ticks, copied at the moment BT.testState() ran.
        ui.kv('ticks', snap.ticks);
        ui.pip('Matches clock', snap.ticks === BT.ticks);

        // 'webgpu' or 'software' after init. ui.kv prints null as the word "null".
        ui.kv('backend', snap.backend);

        ui.kv('state', copied === null ? 'null' : 'copied');

        // error is missing on a healthy read. Present means the hook threw, or
        // its return value could not be turned into JSON (a loop of objects
        // pointing at each other, or a BigInt).
        ui.kv('error', snap.error ?? '(none)');

        if (copied !== null) {
            ui.separator();
            // These numbers are the copy, not our fields. score stays put across
            // a tick reset; x and y jump because placeMarker() follows the clock.
            ui.kv('score', copied.score);
            ui.kv('x', copied.marker.x);
            ui.kv('y', copied.marker.y);
        } else {
            ui.label('No copied state', { color: 'warm' });
        }

        ui.end();
    }

    /**
     * Read BT.testState() once per frame while the hook works. While it is set
     * to fail, keep the first failed snapshot so the error line stays readable.
     *
     * @returns {TestStateSnapshot} The envelope the panels print.
     */
    readSnapshot() {
        if (this.failReadout) {
            if (this.frozenSnapshot === null) {
                this.frozenSnapshot = BT.testState();
            }

            return this.frozenSnapshot;
        }

        // Healthy again: drop the held failure so the next read is live.
        this.frozenSnapshot = null;

        return BT.testState();
    }

    /**
     * Park the square on the circle for the current tick.
     * Math.cos and Math.sin both return a fraction from -1 to 1. Multiply by the
     * radius and round: the engine draws on whole pixels only.
     */
    placeMarker() {
        const angle = BT.ticks / ORBIT_TICKS_PER_RADIAN;

        this.marker.x = ORBIT_CENTER_X + Math.round(Math.cos(angle) * ORBIT_RADIUS);
        this.marker.y = ORBIT_CENTER_Y + Math.round(Math.sin(angle) * ORBIT_RADIUS);

        // >> 1 is integer divide by 2, so the square is centered on that pixel.
        this.markerRect.x = this.marker.x - (MARKER_SIZE >> 1);
        this.markerRect.y = this.marker.y - (MARKER_SIZE >> 1);
    }

    /** The ring, the home dot, and the square. */
    drawOrbit() {
        // Hollow box: the square's path touches the middle of each side.
        BT.drawRect(this.ringRect, C_RING);
        BT.drawRectFill(this.homeRect, C_HOME);
        BT.drawRectFill(this.markerRect, C_MARKER);
    }
}

bootstrap(Demo);
