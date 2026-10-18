/**
 * Core of the shared demo UI kit - the frame lifecycle, layout math, and input plumbing.
 *
 * The kit works like a tiny "immediate-mode" UI (the style made famous by Dear ImGui):
 * a demo does not build widget objects up front - it simply calls ui.panel(), ui.button(),
 * ui.kv(), and so on every frame inside render(), and the kit draws and hit-tests them on
 * the spot. That keeps demo code short, but it needs two tricks to stay fast and correct:
 *
 * 1. Deferred drawing. A panel's final width and position are not known until its last row
 *    is declared (auto width comes from the widest row; a bottom-anchored panel is placed
 *    once its total height is known). So widgets never draw directly - they append small
 *    "command" records with panel-relative coordinates to a preallocated pool, and ui.end()
 *    resolves the panel's origin and replays the commands through the real BT draw calls.
 *    All the pool objects are allocated once and reused, so steady-state rendering allocates
 *    nothing - the one performance rule that actually matters in render().
 *
 * 2. One-frame-old hit rectangles. A widget cannot know its absolute position while it is
 *    being declared (see above), so interaction tests use the rectangle the widget ended up
 *    at LAST frame, cached in a map. Panels sit still, so being one frame behind is
 *    invisible at 60 FPS. This is the same trade Dear ImGui makes.
 *
 * Input timing (why some things happen in update() and others in render()):
 * - Pointer press/release edges are snapshotted by the engine AFTER render() each display
 *   frame, so reading them from render() is safe - buttons hit-test right where they draw.
 * - Keyboard edges (BT.isKeyPressed) clear once per fixed-update tick, which runs BEFORE
 *   render(). Reading them from render() would randomly miss presses. The kit solves this
 *   with a small "mailbox": ui.tick() (called from update()) checks the keys widgets asked
 *   about and drops any press into a set; the widget picks it up next render. See tick().
 */

import { BT, Rect2i, Vector2i } from 'blit386';

import { buttonFillSlice, solidSlice, T } from './ui-theme.js';

// System font metric. The built-in font is a fixed 6x14 grid - every character advances
// exactly FONT_W pixels, so a string's pixel width is simply text.length * FONT_W.
const FONT_W = 6;
const FONT_H = 14;

// Standard row height: 10px. The 14px font cell (FONT_H) has empty space above and below
// the glyphs, so text rows sit closer than the cell height. Buttons are taller so they
// read as pressable and give fingers a bigger target: the label's cell plus
// BUTTON_TEXT_PAD_Y pixels above and below it.
const ROW_H = 10;
const BUTTON_TEXT_PAD_Y = 4;
const BUTTON_H = FONT_H + BUTTON_TEXT_PAD_Y * 2;

// Default inner padding between a panel's border and its content, and default margin
// between a panel and the screen edge.
const PAD = 5;
const MARGIN = 4;

// Extra breathing room ui.panel() adds on every side, inside its rim. It applies only to
// groups using the default PAD: a demo that passes its own `pad` (like a tight frame around
// a tilemap) keeps exactly the box it asked for, and the top bar keeps its fixed strip.
const PANEL_INSET = 4;
// The bottom gets this much more, so the last row does not look pressed against the rim.
const PANEL_INSET_BOTTOM_EXTRA = 1;

// Height of a title-only ui.begin('topBar') strip after ui.panel(title). panel() leaves
// cursorY at 18; end() pads out to this so the header line is not pressed to the rim.
const TOP_BAR_MIN_H = 22;

// Interactive rectangles grow by this many pixels on every side for hit-testing only.
// Fingers are far less precise than a mouse cursor; the visuals stay compact.
const HIT_INFLATE = 3;

// Command kinds for the deferred-drawing pool.
const CMD_RECT_FILL = 0;
const CMD_RECT_STROKE = 1;
const CMD_TEXT = 2;
const CMD_NINE_SLICE = 3;

// Width sentinel: a command with this width is stretched to the group's content width at
// flush time (used by ui.separator(), which cannot know the final width when declared).
const FULL_WIDTH = -1;

// The five group anchors a demo can pass to ui.begin(anchor). 'topBar' is the classic
// full-width title strip; the other four pin a group to a screen corner, with bottom
// anchors growing the group upward (see resolveOriginY()).
const UI_ANCHORS = {
    TOP_LEFT: 'topLeft',
    TOP_RIGHT: 'topRight',
    BOTTOM_LEFT: 'bottomLeft',
    BOTTOM_RIGHT: 'bottomRight',
    TOP_BAR: 'topBar',
};

// The engine tracks up to four pointers: slot 0 is the mouse, slots 1-3 are touches.
const POINTER_SLOTS = 4;

// How many draw commands the pool starts with. A busy panel uses a few dozen; the pool
// grows (once, permanently) if a demo ever needs more.
const INITIAL_COMMAND_POOL = 192;

/**
 * Creates one reusable draw-command record for the pool.
 *
 * @returns {{ kind: number, x: number, y: number, w: number, h: number, color: number, text: string,
 *   slice: import('blit386').NineSlice | null }}
 */
function createCommand() {
    return { kind: CMD_RECT_FILL, x: 0, y: 0, w: 0, h: 0, color: 0, text: '', slice: null };
}

/**
 * Creates one reusable pending-hit-rectangle record (panel-relative until end() resolves it).
 *
 * @returns {{ id: string, x: number, y: number, w: number, h: number }}
 */
function createPendingHit() {
    return { id: '', x: 0, y: 0, w: 0, h: 0 };
}

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
 * All mutable state for the immediate-mode UI. The facade in ui.js creates exactly one
 * instance - demos run one at a time, so a single shared context is all we need.
 */
class UiContext {
    // Deferred draw commands for the group currently between begin() and end().
    commands = [];

    commandCount = 0;

    // Hit rectangles declared this group, resolved to absolute coordinates in end().
    pendingHits = [];

    pendingHitCount = 0;

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

    // The two scratch objects reused for every BT draw call at flush time. The engine
    // copies their numbers into its vertex buffers synchronously, so mutating and reusing
    // one instance across many calls is safe.
    flushRect = new Rect2i(0, 0, 0, 0);

    // One edge of a stroked rectangle, while the caller's rect still holds the whole box.
    edgeRect = new Rect2i(0, 0, 0, 0);

    flushVec = new Vector2i(0, 0);

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

    // Reused result object for widget interaction queries (never reallocated).
    interaction = { hover: false, held: false, activated: false };

    // Per-group layout state (valid between begin() and end()).
    inGroup = false;

    anchor = UI_ANCHORS.TOP_LEFT;

    groupOptX = null;

    groupOptY = null;

    groupOptWidth = null;

    margin = MARGIN;

    pad = PAD;

    // How much ui.panel() will grow this group's padding by; 0 when the demo set its own pad.
    panelInset = 0;

    kvCols = 8;

    cursorY = 0;

    maxGroupW = 0;

    hasPanel = false;

    isTopBar = false;

    warnedPoolGrowth = false;

    // Capture-page hooks (see _shots/capture.js). Both default off, so the steady-state
    // "allocates nothing" rule holds for every demo: `debug` draws group, pad, and widget
    // boxes over the UI; `recording` collects them so snapshot() can hand the layout to the
    // lint rules as plain data.
    debug = false;

    recording = false;

    /** @type {Array<object>} Groups recorded this frame (absolute coordinates). */
    frameGroups = [];

    /** @type {Array<{ x: number, y: number, w: number, h: number }>} Rows of the open group. */
    groupRows = [];

    /** @type {Array<{ id: string, kind: string, x: number, y: number, w: number, h: number }>} */
    groupWidgets = [];

    constructor() {
        // Fill every pool up front so steady-state frames allocate nothing.
        for (let i = 0; i < INITIAL_COMMAND_POOL; i++) {
            this.commands.push(createCommand());
        }

        for (let i = 0; i < 64; i++) {
            this.pendingHits.push(createPendingHit());
        }

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
        for (const code of this.watchedKeys) {
            if (BT.isKeyPressed(code)) {
                this.firedKeys.add(code);
            }
        }

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
                const pos = BT.pointerPos(slot);

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
        const b1 = BT.isPointerActive(1);
        const b2 = BT.isPointerActive(2);
        const b3 = BT.isPointerActive(3);

        if (!this.touchSeen && (b1 || b2 || b3)) {
            this.touchSeen = true;
        }

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
                const pos = BT.pointerPos(slot);

                p.x = pos.x;
                p.y = pos.y;
            }
        }

        // A drag capture ends the moment its pointer is no longer held down.
        if (this.capturedId !== null && !this.pointer[this.capturedSlot].down) {
            this.capturedId = null;
            this.capturedSlot = -1;
        }
    }

    /**
     * Starts a widget group. Every begin() must be paired with one end().
     *
     * @param {'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'topBar'} anchor -
     *   Where the finished group attaches on screen. Bottom anchors place the group so its
     *   bottom edge sits at the margin - rows are still declared top to bottom, the whole
     *   block just "grows upward". 'topBar' is the classic full-width title strip.
     * @param {{ x?: number, y?: number, width?: number, margin?: number, pad?: number, kvCols?: number }} opts -
     *   x/y pin the group to a fixed position (overriding the anchor on that axis); width
     *   fixes the group width (otherwise it is sized to the widest row); margin is the gap
     *   to the screen edge; pad is the inner padding; kvCols is the key column width of
     *   ui.kv() rows, in characters.
     */
    begin(anchor = UI_ANCHORS.TOP_LEFT, opts = {}) {
        if (!T.ready) {
            throw new Error('ui.begin: call applyTheme(palette) in init() before drawing any UI.');
        }

        if (this.inGroup) {
            throw new Error('ui.begin: the previous group is still open. Did you forget ui.end()?');
        }

        // The first begin() since the last tick() starts a new frame's worth of widget
        // declarations. Prune now, using the ids the previous frame flushed, so a widget
        // that stopped being declared drops out of hitRects instead of leaving a dead zone.
        if (!this.renderedSinceTick) {
            this.pruneHitRects();
            this.frameGroups.length = 0;
        }

        this.refreshPointerSnapshot();

        this.renderedSinceTick = true;

        this.inGroup = true;
        this.anchor = anchor;
        this.isTopBar = anchor === UI_ANCHORS.TOP_BAR;
        this.groupOptX = typeof opts.x === 'number' ? opts.x : null;
        this.groupOptY = typeof opts.y === 'number' ? opts.y : null;
        this.groupOptWidth = typeof opts.width === 'number' ? opts.width : null;
        this.margin = typeof opts.margin === 'number' ? opts.margin : MARGIN;
        this.pad = typeof opts.pad === 'number' ? opts.pad : PAD;
        this.panelInset = typeof opts.pad === 'number' || this.isTopBar ? 0 : PANEL_INSET;
        this.kvCols = typeof opts.kvCols === 'number' ? opts.kvCols : 8;
        this.cursorY = this.isTopBar ? 0 : this.pad - 5;
        this.maxGroupW = 0;
        this.hasPanel = false;
        this.commandCount = 0;
        this.pendingHitCount = 0;
        this.groupRows.length = 0;
        this.groupWidgets.length = 0;
    }

    /**
     * Closes the current group: works out its final size and position, draws the optional
     * panel background, replays every queued draw command, and caches the absolute widget
     * rectangles for next frame's hit tests.
     */
    end() {
        if (!this.inGroup) {
            throw new Error('ui.end: no group is open. Call ui.begin() first.');
        }

        const display = BT.displaySize;

        // Final width: fixed if the demo asked for one, the full screen for a top bar,
        // otherwise the widest declared row - never wider than the screen allows.
        let groupW;

        if (this.isTopBar) {
            groupW = display.x;
        } else if (this.groupOptWidth !== null) {
            groupW = this.groupOptWidth;
        } else {
            groupW = Math.min(this.maxGroupW, display.x - 2 * this.margin);
        }

        // Final height: where the cursor ended up, plus a little bottom padding inside
        // panels. A title-only top bar keeps the classic TOP_BAR_MIN_H strip height.
        let bottomPad = 0;

        if (this.isTopBar) {
            bottomPad = this.cursorY > TOP_BAR_MIN_H ? 4 : TOP_BAR_MIN_H - this.cursorY;
        } else if (this.hasPanel) {
            // The bottom edge gets one pixel more inset than the others (see PANEL_INSET_BOTTOM_EXTRA).
            bottomPad = 6 + (this.panelInset === 0 ? 0 : this.panelInset + PANEL_INSET_BOTTOM_EXTRA);
        }

        const groupH = this.cursorY + bottomPad;
        const originX = this.resolveOriginX(display, groupW);
        const originY = this.resolveOriginY(display, groupH);

        this.flushGroup(originX, originY, groupW, groupH);

        this.inGroup = false;
    }

    /**
     * Where does the group's left edge land? From the anchor, unless opts.x pinned it.
     *
     * @param {import('blit386').Vector2i} display - The logical display size.
     * @param {number} groupW - The group's final width.
     * @returns {number}
     */
    resolveOriginX(display, groupW) {
        if (this.groupOptX !== null) {
            return this.groupOptX;
        }

        if (this.isTopBar) {
            return 0;
        }

        const isRight = this.anchor === UI_ANCHORS.TOP_RIGHT || this.anchor === UI_ANCHORS.BOTTOM_RIGHT;

        return isRight ? display.x - this.margin - groupW : this.margin;
    }

    /**
     * Where does the group's top edge land? From the anchor, unless opts.y pinned it.
     * Bottom anchors place the group so its BOTTOM edge sits at the margin - this is the
     * "grows upward" behavior: more rows push the top edge up, not the bottom edge down.
     *
     * @param {import('blit386').Vector2i} display - The logical display size.
     * @param {number} groupH - The group's final height.
     * @returns {number}
     */
    resolveOriginY(display, groupH) {
        if (this.groupOptY !== null) {
            return this.groupOptY;
        }

        if (this.isTopBar) {
            return 0;
        }

        const isBottom = this.anchor === UI_ANCHORS.BOTTOM_LEFT || this.anchor === UI_ANCHORS.BOTTOM_RIGHT;

        return isBottom ? display.y - this.margin - groupH : this.margin;
    }

    /**
     * Draws the closed group for real: panel background first, then every queued command
     * shifted by the group origin, and finally caches the absolute widget rectangles.
     *
     * @param {number} originX - Group left edge in display pixels.
     * @param {number} originY - Group top edge in display pixels.
     * @param {number} groupW - Final group width.
     * @param {number} groupH - Final group height.
     */
    flushGroup(originX, originY, groupW, groupH) {
        // The panel's nine-slice (fill plus rim) draws first so every queued command lands on top.
        if (this.hasPanel) {
            this.flushRect.set(originX, originY, groupW, groupH);

            BT.drawNineSlice(T.panelSlice, this.flushRect);
        }

        // Replay the queued commands, now that the group origin is known.
        for (let i = 0; i < this.commandCount; i++) {
            const cmd = this.commands[i];

            if (cmd.kind === CMD_TEXT) {
                this.flushVec.set(originX + cmd.x, originY + cmd.y);

                BT.systemPrint(this.flushVec, cmd.color, cmd.text);
            } else {
                const w = cmd.w === FULL_WIDTH ? groupW - 2 * this.pad : cmd.w;

                this.flushRect.set(originX + cmd.x, originY + cmd.y, w, cmd.h);

                // Rectangles draw as stretched one-color sprites, not BT.drawRectFill: the
                // engine draws primitives before all sprites, which would hide them under
                // the nine-slice panel.
                if (cmd.kind === CMD_NINE_SLICE) {
                    BT.drawNineSlice(cmd.slice, this.flushRect);
                } else if (cmd.kind === CMD_RECT_FILL) {
                    this.drawRectFill(this.flushRect, cmd.color);
                } else {
                    this.drawRect(this.flushRect, cmd.color);
                }
            }
        }

        // Store this frame's absolute widget rectangles for next frame's interaction, and
        // remember the id so a future prune knows this widget is still alive.
        for (let i = 0; i < this.pendingHitCount; i++) {
            const pending = this.pendingHits[i];
            let rec = this.hitRects.get(pending.id);

            if (!rec) {
                rec = { x: 0, y: 0, w: 0, h: 0 };
                this.hitRects.set(pending.id, rec);
            }

            rec.x = originX + pending.x;
            rec.y = originY + pending.y;
            rec.w = pending.w;
            rec.h = pending.h;

            this.frameHitIds.add(pending.id);
        }

        if (this.recording) {
            this.frameGroups.push({
                anchor: this.anchor,
                pinnedX: this.groupOptX !== null,
                pinnedY: this.groupOptY !== null,
                margin: this.margin,
                pad: this.pad,
                panel: this.hasPanel,
                rect: { x: originX, y: originY, w: groupW, h: groupH },
                rows: this.groupRows.map((row) => ({ x: originX + row.x, y: originY + row.y, w: row.w, h: row.h })),
                widgets: this.groupWidgets.map((hit) => ({
                    id: hit.id,
                    kind: hit.kind,
                    rect: { x: originX + hit.x, y: originY + hit.y, w: hit.w, h: hit.h },
                })),
            });
        }

        if (this.debug) {
            this.drawDebugOverlay(originX, originY, groupW, groupH);
        }
    }

    /**
     * Draws the layout boxes the capture page's debug variant shows: the group in the
     * accent color, the pad inset in the dim color, and every widget hit rectangle in the warm
     * color. Drawn after the queued commands so they sit on top of the panel.
     *
     * @param {number} originX - Group left edge.
     * @param {number} originY - Group top edge.
     * @param {number} groupW - Group width.
     * @param {number} groupH - Group height.
     */
    drawDebugOverlay(originX, originY, groupW, groupH) {
        this.flushRect.set(originX, originY, groupW, groupH);
        this.drawRect(this.flushRect, T.accent);

        // Clamp so a group narrower than two pads never gets a negative-size box.
        this.flushRect.set(
            originX + this.pad,
            originY + this.pad,
            Math.max(0, groupW - 2 * this.pad),
            Math.max(0, groupH - 2 * this.pad),
        );
        this.drawRect(this.flushRect, T.dim);

        for (let i = 0; i < this.pendingHitCount; i++) {
            const pending = this.pendingHits[i];

            this.flushRect.set(originX + pending.x, originY + pending.y, pending.w, pending.h);
            this.drawRect(this.flushRect, T.warm);
        }
    }

    /**
     * The layout of the last rendered frame as plain data, for the capture page's lint rules.
     * Empty until `recording` is switched on. Returns a fresh copy every call.
     *
     * @returns {{ display: { w: number, h: number }, groups: Array<object> }}
     */
    snapshot() {
        const display = BT.displaySize;

        return { display: { w: display.x, h: display.y }, groups: structuredClone(this.frameGroups) };
    }

    /**
     * Drops any cached hit rectangle whose id was not flushed during the frame that just
     * finished (see the call site in begin()). Widgets that disappeared - a panel that
     * closed, a conditional row that stopped rendering - stop blocking taps and swipes at
     * their old location instead of leaving a permanent dead zone.
     */
    pruneHitRects() {
        for (const id of this.hitRects.keys()) {
            if (!this.frameHitIds.has(id)) {
                this.hitRects.delete(id);
            }
        }

        this.frameHitIds.clear();
    }

    /**
     * Reserves a horizontal band inside the current group, advances the layout cursor, and
     * feeds the auto-width calculation.
     *
     * @param {number} contentW - Width of the row's content, excluding the inner padding.
     * @param {number} advance - How far the cursor moves down for the next row.
     * @returns {number} The row's top y, relative to the group origin.
     */
    addRow(contentW, advance) {
        if (!this.inGroup) {
            throw new Error('ui: widgets must be declared between ui.begin() and ui.end().');
        }

        const rowY = this.cursorY;

        this.cursorY += advance;
        this.maxGroupW = Math.max(this.maxGroupW, contentW + 2 * this.pad);

        if (this.recording) {
            this.groupRows.push({ x: this.pad, y: rowY, w: contentW, h: advance });
        }

        return rowY;
    }

    /**
     * Fills `rect` with palette slot `slot`, drawn as a stretched one-color sprite so it lands
     * on top of any nine-slice drawn before it (see solidSlice() in ui-theme.js).
     *
     * @param {import('blit386').Rect2i} rect - Box in display pixels.
     * @param {number} slot - Palette slot, 1-255.
     */
    drawRectFill(rect, slot) {
        BT.drawNineSlice(solidSlice(slot), rect);
    }

    /**
     * Draws a button face - the same nine-slice ui.button() uses - over `rect`, for demos
     * that lay out their own button-shaped cells. Drawn right away, as a sprite.
     *
     * @param {import('blit386').Rect2i} rect - Box in display pixels.
     * @param {string} look - One of BUTTON_LOOK's values.
     */
    drawButtonFace(rect, look) {
        if (!T.ready) {
            throw new Error('ui.drawButtonFace: call applyTheme(palette) in init() before drawing any UI.');
        }

        const slice = T.buttonSlices[look];

        if (slice === undefined) {
            throw new Error(`ui.drawButtonFace: unknown look "${look}". Use one of BUTTON_LOOK's values.`);
        }

        BT.drawNineSlice(slice, rect);
    }

    /**
     * Draws a button face with its fill in any palette slot - the same rounded shape as
     * drawButtonFace(), for cells that light up in a scene color. Drawn right away, as a
     * sprite.
     *
     * @param {import('blit386').Rect2i} rect - Box in display pixels.
     * @param {number} slot - Palette slot for the fill, 1-255.
     * @param {number} [rimSlot] - Palette slot for the rim, 1-255. Defaults to the theme
     *   border.
     */
    drawButtonFill(rect, slot, rimSlot) {
        BT.drawNineSlice(buttonFillSlice(slot, rimSlot), rect);
    }

    /**
     * Outlines `rect` with a one-pixel line in palette slot `slot`, as sprites: top and
     * bottom edges full width, left and right edges between them, so no corner is drawn twice.
     *
     * @param {import('blit386').Rect2i} rect - Box in display pixels.
     * @param {number} slot - Palette slot, 1-255.
     */
    drawRect(rect, slot) {
        const solid = solidSlice(slot);
        const { x, y, width, height } = rect;

        this.edgeRect.set(x, y, width, 1);
        BT.drawNineSlice(solid, this.edgeRect);
        this.edgeRect.set(x, y + height - 1, width, 1);
        BT.drawNineSlice(solid, this.edgeRect);
        this.edgeRect.set(x, y + 1, 1, height - 2);
        BT.drawNineSlice(solid, this.edgeRect);
        this.edgeRect.set(x + width - 1, y + 1, 1, height - 2);
        BT.drawNineSlice(solid, this.edgeRect);
    }

    /**
     * Appends one draw command to the pool (growing it permanently on overflow).
     *
     * @param {number} kind - CMD_RECT_FILL, CMD_RECT_STROKE, CMD_TEXT, or CMD_NINE_SLICE.
     * @param {number} x - X relative to the group origin.
     * @param {number} y - Y relative to the group origin.
     * @param {number} w - Width in pixels (rects), or 0 for text.
     * @param {number} h - Height in pixels (rects), or 0 for text.
     * @param {number} color - Palette index to draw with.
     * @param {string} text - Text content (CMD_TEXT only).
     * @param {import('blit386').NineSlice | null} slice - The nine-slice to stretch over the box
     *   (CMD_NINE_SLICE only).
     */
    addCommand(kind, x, y, w, h, color, text = '', slice = null) {
        if (this.commandCount === this.commands.length) {
            this.commands.push(createCommand());

            if (!this.warnedPoolGrowth) {
                console.warn('ui: draw-command pool grew beyond its initial size (harmless, logged once).');
                this.warnedPoolGrowth = true;
            }
        }

        const cmd = this.commands[this.commandCount++];

        cmd.kind = kind;
        cmd.x = x;
        cmd.y = y;
        cmd.w = w;
        cmd.h = h;
        cmd.color = color;
        cmd.text = text;
        cmd.slice = slice;
    }

    /**
     * Registers the rectangle a widget occupies this frame (group-relative; end() converts
     * it to absolute screen coordinates and caches it for next frame's hit tests).
     *
     * @param {string} id - Widget identity (its label unless opts.id overrides it).
     * @param {number} x - X relative to the group origin.
     * @param {number} y - Y relative to the group origin.
     * @param {number} w - Width in pixels.
     * @param {number} h - Height in pixels.
     * @param {string} [kind] - Widget kind for the layout snapshot ('button', 'checkbox', 'slider').
     */
    addHit(id, x, y, w, h, kind = 'widget') {
        if (this.pendingHitCount === this.pendingHits.length) {
            this.pendingHits.push(createPendingHit());
        }

        const pending = this.pendingHits[this.pendingHitCount++];

        pending.id = id;
        pending.x = x;
        pending.y = y;
        pending.w = w;
        pending.h = h;

        if (this.recording) {
            this.groupWidgets.push({ id, kind, x, y, w, h });
        }
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

            if (p.pressed && hitContains(rec, p.x, p.y, HIT_INFLATE)) {
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
        for (const rec of this.hitRects.values()) {
            if (hitContains(rec, px, py, HIT_INFLATE)) {
                return true;
            }
        }

        return false;
    }
}

export {
    BUTTON_H,
    BUTTON_TEXT_PAD_Y,
    CMD_NINE_SLICE,
    CMD_RECT_FILL,
    CMD_RECT_STROKE,
    CMD_TEXT,
    FONT_H,
    FONT_W,
    FULL_WIDTH,
    hitContains,
    ROW_H,
    UI_ANCHORS,
    UiContext,
};
