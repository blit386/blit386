/**
 * Input half of the shared demo UI kit: the pointer and keyboard state UiContext (ui-core.js)
 * extends, and the hit tests widgets ask through it. Widgets hit-test against the rectangle
 * they were drawn at last frame (see ui-core.js), cached in `hitRects` here.
 *
 * Input timing (why some things happen in update() and others in render()):
 * - Pointer press/release edges are snapshotted by the engine AFTER render() each display
 *   frame, so reading them from render() is safe - buttons hit-test right where they draw.
 * - Keyboard edges (BT.isKeyPressed) clear once per fixed-update tick, which runs BEFORE
 *   render(). Reading them from render() would randomly miss presses. The kit solves this
 *   with a small "mailbox": ui.tick() (called from update()) checks the keys widgets asked
 *   about and drops any press into a set; the widget picks it up next render. See tick().
 */

import { BT, Vector2i } from 'blit386';

// Interactive rectangles grow by this many pixels on every side for hit-testing only.
// Fingers are far less precise than a mouse cursor; the visuals stay compact.
const HIT_INFLATE = 3;

// The engine tracks up to four pointers: slot 0 is the mouse, slots 1-3 are touches.
const POINTER_SLOTS = 4;

/**
 * Is the point (px, py) inside the cached rectangle `rec`, grown by `inflate` pixels?
 *
 * @param {{ x: number, y: number, w: number, h: number }} rec - Cached absolute rectangle.
 * @param {number} px - Point x in display pixels.
 * @param {number} py - Point y in display pixels.
 * @param {number} inflate - Extra pixels of tolerance on every side.
 * @returns {boolean}
 */
function hitContains(rec, px, py, inflate) {
    const l = rec.x - inflate;
    const t = rec.y - inflate;
    const r = rec.x + rec.w + inflate;
    const b = rec.y + rec.h + inflate;

    return px >= l && px < r && py >= t && py < b;
}

/**
 * Pointer, keyboard, and hit-rectangle state for the UI kit. Never used on its own:
 * UiContext extends it with layout and drawing.
 */
class UiInput {
    /**
     * Absolute widget rectangles from the previous frame, keyed by widget id (the label,
     * unless opts.id overrides it). Records are allocated on first sighting and then
     * mutated in place forever - no per-frame allocation.
     *
     * @type {Map<string, { x: number, y: number, w: number, h: number }>}
     */
    hitRects = new Map();

    /**
     * Widget ids flushed so far during the frame currently being declared. Compared against
     * `hitRects` at the next frame's first begin() so widgets that stopped being declared
     * (conditional UI) get their stale rectangle removed instead of leaving a dead zone that
     * `isInsideAnyWidget()` keeps reporting as occupied forever.
     *
     * @type {Set<string>}
     */
    frameHitIds = new Set();

    // Created once so pruning allocates no iterator; deleting the visited entry is safe.
    pruneVisitor = (_rec, id, map) => {
        if (!this.frameHitIds.has(id)) {
            map.delete(id);
        }
    };

    // Scratch for BT.pointerPosTo(); BT.pointerPos() would clone a fresh vector per call.
    posScratch = new Vector2i(0, 0);

    /**
     * Render-side pointer snapshot, refreshed at every begin(). `pressed` uses the engine's
     * per-display-frame pointer edge, which is safe to read during render().
     *
     * @type {{ active: boolean, down: boolean, pressed: boolean, x: number, y: number }[]}
     */
    pointer = [];

    /**
     * Update-side pointer tracking, refreshed at every tick(). The kit derives its own
     * press/release edges from the held state here, because the engine's pointer edges are
     * per display frame - two fixed ticks in one frame would both see the same edge.
     *
     * @type {{
     *     wasDown: boolean, down: boolean, pressed: boolean, released: boolean,
     *     x: number, y: number, downX: number, downY: number, downTick: number, swipeOk: boolean,
     * }[]}
     */
    tickPointer = [];

    // The keyboard mailbox (see the file header). watchedKeys holds every key code any
    // widget has ever asked about; firedKeys holds presses waiting to be delivered.
    /** @type {Set<string>} */
    watchedKeys = new Set();

    /** @type {Set<string>} */
    firedKeys = new Set();

    // Created once so the per-tick key check allocates no iterator.
    watchVisitor = (code) => {
        if (BT.isKeyPressed(code)) {
            this.firedKeys.add(code);
        }
    };

    // True after any begin() ran; the first tick() afterwards empties the mailbox, so a
    // press is delivered to exactly one render frame and never lingers.
    renderedSinceTick = false;

    // Counts update ticks (used by the swipe recognizer to time gestures).
    tickCount = 0;

    // True once any touch contact (pointer slots 1-3) has ever been seen this session.
    // The virtual D-pad uses this to stay hidden on mouse-and-keyboard machines.
    touchSeen = false;

    // Drag capture: while a slider is being dragged, it "owns" that pointer slot until
    // release, so sliding a finger across other widgets does not trigger them.
    /** @type {string | null} */
    capturedId = null;

    capturedSlot = -1;

    // Which widget id each pointer slot's current press belongs to (null: none). Inflated hit
    // rects of stacked rows overlap, so a press claims exactly one widget - the one whose own rect
    // (before the growth) is nearest - at its press edge, and only that widget sees it until release.
    /** @type {(string | null)[]} */
    pressOwner = [null, null, null, null];

    // Scratch state for nearestWidgetAt(); the visitor is created once so the scan allocates nothing.
    claimX = 0;

    claimY = 0;

    claimDist = 0;

    /** @type {string | null} */
    claimId = null;

    claimVisitor = (rec, id) => {
        if (!hitContains(rec, this.claimX, this.claimY, HIT_INFLATE)) {
            return;
        }

        // Pixels from the point to the rect on each axis, 0 when the point is inside it. Rows
        // stack vertically, so a wider label must not push its row's claim away.
        const dx = Math.max(rec.x - this.claimX, 0, this.claimX - (rec.x + rec.w - 1));
        const dy = Math.max(rec.y - this.claimY, 0, this.claimY - (rec.y + rec.h - 1));
        const dist = dx * dx + dy * dy;

        if (dist < this.claimDist) {
            this.claimDist = dist;
            this.claimId = id;
        }
    };

    // Reused result object for widget interaction queries (never reallocated).
    interaction = { hover: false, held: false, activated: false };

    constructor() {
        for (let slot = 0; slot < POINTER_SLOTS; slot++) {
            this.pointer.push({ active: false, down: false, pressed: false, x: 0, y: 0 });
            this.tickPointer.push({
                wasDown: false,
                down: false,
                pressed: false,
                released: false,
                x: 0,
                y: 0,
                downX: 0,
                downY: 0,
                downTick: 0,
                swipeOk: false,
            });
        }
    }

    /**
     * Update-side housekeeping. Demos that use { key } bindings, gestures, or the D-pad
     * call ui.tick() as the first line of update(). Pure display demos can skip it.
     */
    tick() {
        // Empty the keyboard mailbox on the first tick after a render: whatever that render
        // did not consume is stale now, and whatever it did consume is already gone.
        if (this.renderedSinceTick) {
            this.firedKeys.clear();
            this.renderedSinceTick = false;
        }

        // Check every key a widget has asked about. BT.isKeyPressed() is trustworthy here
        // (and only here - it clears once per tick, before render() runs). A press lands in
        // the mailbox and waits for the widget to pick it up during the next render.
        this.watchedKeys.forEach(this.watchVisitor);

        // Track per-slot pointer state and derive our own per-tick press/release edges from
        // the held level, which is safe to read on every tick.
        for (let slot = 0; slot < POINTER_SLOTS; slot++) {
            const rec = this.tickPointer[slot];
            const down = BT.isPointerActive(slot) && BT.isDown(BT.BTN_POINTER_A, slot);

            rec.pressed = down && !rec.wasDown;
            rec.released = !down && rec.wasDown;
            rec.down = down;

            // While the pointer is down we keep its latest position. On release the engine
            // may already report the slot as inactive, so the last stored position doubles
            // as the release position (used by the swipe recognizer).
            if (down) {
                const pos = BT.pointerPosTo(this.posScratch, slot);

                rec.x = pos.x;
                rec.y = pos.y;
            }

            if (rec.pressed) {
                rec.downX = rec.x;
                rec.downY = rec.y;
                rec.downTick = this.tickCount;
            }

            rec.wasDown = down;
        }

        // Slots 1-3 are touch contacts; seeing one means we are on a touch device.
        this.touchSeen ||= BT.isPointerActive(1) || BT.isPointerActive(2) || BT.isPointerActive(3);

        this.tickCount++;
    }

    /**
     * Refreshes the render-side pointer snapshot and drops finished drag captures.
     *
     * This runs on every begin() (not once per frame) on purpose: it needs no frame
     * counter, and re-reading the same engine state within one frame returns the same
     * values, so nothing double-fires.
     */
    refreshPointerSnapshot() {
        for (let slot = 0; slot < POINTER_SLOTS; slot++) {
            const p = this.pointer[slot];

            p.active = BT.isPointerActive(slot);
            p.pressed = BT.isPressed(BT.BTN_POINTER_A, slot);
            p.down = p.active && BT.isDown(BT.BTN_POINTER_A, slot);

            if (p.active || p.pressed) {
                const pos = BT.pointerPosTo(this.posScratch, slot);

                p.x = pos.x;
                p.y = pos.y;
            }

            if (p.pressed) {
                this.pressOwner[slot] = this.nearestWidgetAt(p.x, p.y);
            } else if (!p.down) {
                this.pressOwner[slot] = null;
            }
        }

        // A drag capture ends the moment its pointer is no longer held down.
        if (this.capturedId !== null && !this.pointer[this.capturedSlot].down) {
            this.capturedId = null;
            this.capturedSlot = -1;
        }
    }

    /**
     * The id of the cached widget rectangle nearest to (px, py) among those whose inflated
     * rectangle contains it, or null. A rect containing the point is at distance 0; ties keep
     * the first one found, which is the first declared.
     *
     * @param {number} px - Point x in display pixels.
     * @param {number} py - Point y in display pixels.
     * @returns {string | null}
     */
    nearestWidgetAt(px, py) {
        this.claimX = px;
        this.claimY = py;
        this.claimDist = Infinity;
        this.claimId = null;
        this.hitRects.forEach(this.claimVisitor);

        return this.claimId;
    }

    /**
     * Drops any cached hit rectangle whose id was not flushed during the frame that just
     * finished (see the call site in begin()). Widgets that disappeared - a panel that
     * closed, a conditional row that stopped rendering - stop blocking taps and swipes at
     * their old location instead of leaving a permanent dead zone.
     */
    pruneHitRects() {
        this.hitRects.forEach(this.pruneVisitor);
        this.frameHitIds.clear();
    }

    /**
     * Answers "is the pointer over / holding / just-pressing this widget?" using the cached
     * one-frame-old rectangle. Safe to call from render() - see the file header.
     *
     * The same reused result object is returned every time; read it before the next call.
     *
     * @param {string} id - Widget identity.
     * @returns {{ hover: boolean, held: boolean, activated: boolean }}
     */
    resolveInteraction(id) {
        const res = this.interaction;

        res.hover = false;
        res.held = false;
        res.activated = false;

        const rec = this.hitRects.get(id);

        // No cached rectangle yet - the widget appeared this very frame. It becomes
        // interactive next frame, one 60th of a second later.
        if (!rec) {
            return res;
        }

        for (let slot = 0; slot < POINTER_SLOTS; slot++) {
            // A slot captured by a slider drag belongs to that slider alone.
            if (this.capturedId !== null && slot === this.capturedSlot && this.capturedId !== id) {
                continue;
            }

            // A press belongs to the one widget it claimed (see nearestWidgetAt()).
            if (this.pressOwner[slot] !== id) {
                continue;
            }

            const p = this.pointer[slot];
            const inside = (p.active || p.pressed) && hitContains(rec, p.x, p.y, HIT_INFLATE);

            if (!inside) {
                continue;
            }

            if (p.pressed) {
                res.activated = true;
            }

            if (p.down) {
                res.held = true;
            }
        }

        // Hover is a mouse-only idea (slot 0 hovers; touches only exist while pressing).
        const mouse = this.pointer[0];

        res.hover =
            this.capturedId === null && !res.held && mouse.active && hitContains(rec, mouse.x, mouse.y, HIT_INFLATE);

        return res;
    }

    /**
     * Drag handling for sliders: on a press inside the widget the slot is captured; while
     * captured, returns the pointer's x so the slider can map it to a value.
     *
     * @param {string} id - Widget identity.
     * @returns {number | null} Pointer x in display pixels while dragging, otherwise null.
     */
    resolveDrag(id) {
        // Already dragging this widget: follow the captured pointer.
        if (this.capturedId === id) {
            return this.pointer[this.capturedSlot].x;
        }

        if (this.capturedId !== null) {
            return null;
        }

        const rec = this.hitRects.get(id);

        if (!rec) {
            return null;
        }

        // A fresh press inside the widget starts the drag and claims the slot.
        for (let slot = 0; slot < POINTER_SLOTS; slot++) {
            const p = this.pointer[slot];

            if (p.pressed && this.pressOwner[slot] === id) {
                this.capturedId = id;
                this.capturedSlot = slot;

                return p.x;
            }
        }

        return null;
    }

    /**
     * Registers interest in a key code and reports whether it was pressed since the last
     * render. Reading a press removes it from the mailbox, so it fires exactly once even
     * on displays that render more often than the fixed update runs.
     *
     * @param {string | undefined} code - A KeyboardEvent.code value like 'Space' or 'KeyR'.
     * @returns {boolean} True when that key was pressed since the previous render.
     */
    consumeKey(code) {
        if (!code) {
            return false;
        }

        this.watchedKeys.add(code);

        return this.firedKeys.delete(code);
    }

    /**
     * Is the point inside any cached widget rectangle? Gestures use this so a swipe or a
     * tap that starts on a button is left for the button to handle.
     *
     * @param {number} px - Point x in display pixels.
     * @param {number} py - Point y in display pixels.
     * @returns {boolean}
     */
    isInsideAnyWidget(px, py) {
        return this.nearestWidgetAt(px, py) !== null;
    }
}

export { HIT_INFLATE, hitContains, POINTER_SLOTS, UiInput };
