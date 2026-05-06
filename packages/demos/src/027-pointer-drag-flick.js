// Pointer Drag-and-Flick Demo -- grab balls, drag them, release to throw.
//
// Demo 027 in the Blit-Tech demo series.
// Prerequisites: 025-Pointer Basics, 026-Pointer Paint
//
// This is the action-oriented sibling of demos 025 and 026. Where 025 reads
// pointer state and 026 paints onto a canvas, this demo couples the pointer
// to a tiny physics simulation:
//
//   - Three balls bounce around inside a closed box under gravity.
//   - Click and HOLD on a ball to grab it (the ball follows the pointer).
//   - RELEASE to throw it -- the release-frame `BT.pointerDelta` becomes the
//     ball's launch velocity.
//
// On a touchscreen each finger can grab its own ball; up to three balls can
// be dragged at once (slots 1, 2, 3). The mouse uses slot 0.
//
// What this demonstrates that 025 and 026 do not:
//
//   - `BT.buttonPressed(...)` as a "grab" edge: only fires the frame the
//     button transitions to down, used to start the drag exactly once.
//   - `BT.buttonReleased(...)` as a "throw" edge: only fires the frame the
//     button transitions to up. We sample `BT.pointerDelta` *during* this
//     edge to capture the user's release-time hand velocity.
//   - `BT.pointerDelta` actively driving simulation, not just shown as text.
//
// Coordinate convention: balls store position with sub-pixel precision
// (floats) so physics integrates smoothly, but every render call rounds to
// integer display coordinates so pixels stay crisp.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Configuration

const DISPLAY_W = 320;
const DISPLAY_H = 240;

// Vertical strip at the top reserved for the title and per-slot indicators.
// Balls cannot enter it, and grabs are only registered below it.
const HUD_HEIGHT = 22;

// Palette slots. Index 0 is always transparent.
const C_BG = 1; // dark background
const C_TEXT = 2; // overlay text
const C_DIM = 3; // dim hint text
const C_PANEL = 4; // HUD strip background
const C_PANEL_BORDER = 5; // HUD strip border
const C_BALL_OUTLINE = 6; // outline drawn around any grabbed ball
const C_BALL_HIGHLIGHT = 7; // tint for the ball under the mouse cursor when no slot is grabbing it

// Three balls, each its own colour so it's easy to track which is which.
const BALL_COLORS = [10, 11, 12];

// Physics parameters, all expressed in "display pixels per fixed update tick"
// since the engine runs `update()` at a fixed rate (here 60 Hz).
const BALL_RADIUS = 10;
const GRAVITY = 0.35; // px/tick² downward
const WALL_DAMPING = 0.78; // velocity multiplier on wall bounce (energy loss)
const FLOOR_FRICTION = 0.985; // horizontal velocity multiplier per tick on the floor
const AIR_DRAG = 0.999; // gentle air drag so flicks decay over time
const MIN_SPEED = 0.05; // velocities below this are clamped to zero (avoid tiny jitter)

// Multiplier applied to BT.pointerDelta when a ball is released. The delta is
// already in "display pixels moved during the previous fixed update tick",
// which is roughly velocity in px/tick. Scale up slightly so easy flicks feel
// energetic.
const THROW_SCALE = 1.4;

// Maximum allowed launch speed (px/tick). Caps the velocity from a very fast
// flick so balls don't escape the box in a single tick.
const MAX_THROW_SPEED = 16;

// #endregion

// #region Main Logic

/**
 * Drag-and-flick physics demo.
 *
 * Each ball is a small object: { x, y, vx, vy, color, grabbedBy }. `grabbedBy`
 * is -1 when free or a pointer slot index 0..3 when held. While held, physics
 * integration is skipped and the ball is teleported to the pointer position
 * each frame. On release we read `BT.pointerDelta(slot)` and convert it to
 * the ball's launch velocity.
 *
 * @implements {IBlitTechDemo}
 */
class Demo {
    // #region Module State

    palette = null;

    /**
     * Active balls. Created in initialize().
     *
     * @type {Array<{x: number, y: number, vx: number, vy: number, color: number, grabbedBy: number}>}
     */
    balls = [];

    // #endregion

    // #region IBlitTechDemo Implementation

    /**
     * Tells the engine the screen size and target frame rate.
     *
     * @returns {{displaySize: Vector2i, canvasDisplaySize: Vector2i, targetFPS: number}}
     */
    queryHardware() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            canvasDisplaySize: new Vector2i(DISPLAY_W * 2, DISPLAY_H * 2),
            targetFPS: 60,
        };
    }

    /**
     * Sets up the palette and seeds three balls at varied starting positions.
     *
     * @returns {Promise<boolean>}
     */
    async initialize() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(18, 22, 32));
        this.palette.set(C_TEXT, new Color32(255, 255, 255));
        this.palette.set(C_DIM, new Color32(150, 160, 180));
        this.palette.set(C_PANEL, new Color32(40, 50, 70));
        this.palette.set(C_PANEL_BORDER, new Color32(100, 110, 130));
        this.palette.set(C_BALL_OUTLINE, new Color32(255, 255, 255));
        this.palette.set(C_BALL_HIGHLIGHT, new Color32(255, 220, 120));

        this.palette.set(BALL_COLORS[0], new Color32(255, 100, 110));
        this.palette.set(BALL_COLORS[1], new Color32(120, 220, 130));
        this.palette.set(BALL_COLORS[2], new Color32(120, 170, 255));

        BT.paletteSet(this.palette);

        // Hide the native OS cursor so the drawn crosshair markers are the only
        // cursors visible while the pointer is over the canvas.
        BT.hideCursor();

        // Stagger the balls horizontally and give each a small initial velocity
        // so the simulation looks alive on first frame.
        this.balls = [
            { x: 80, y: 60, vx: 1.2, vy: 0, color: BALL_COLORS[0], grabbedBy: -1 },
            { x: 160, y: 50, vx: -0.6, vy: 0.4, color: BALL_COLORS[1], grabbedBy: -1 },
            { x: 240, y: 70, vx: 0.8, vy: -0.2, color: BALL_COLORS[2], grabbedBy: -1 },
        ];

        return true;
    }

    /**
     * Per-tick: route press / release edges to grab / throw, follow held
     * balls to their owning pointer, integrate physics for free balls.
     */
    update() {
        // Walk every pointer slot. Mouse (slot 0) and touches (1-3) all use
        // BTN_POINTER_A as the "primary" button; for touches that's automatic
        // ("contact made = A held"), for the mouse it's the left button.
        for (let slot = 0; slot < 4; slot++) {
            // Edge: pointer just went down on this slot. Try to grab a ball.
            if (BT.buttonPressed(BT.BTN_POINTER_A, slot)) {
                this.tryGrab(slot);
            }

            // Edge: pointer just released on this slot. Throw whatever it held.
            if (BT.buttonReleased(BT.BTN_POINTER_A, slot)) {
                this.tryThrow(slot);
            }
        }

        // Move every ball: held ones follow their pointer, free ones obey
        // gravity / drag / wall bounce.
        for (const ball of this.balls) {
            if (ball.grabbedBy >= 0) {
                this.updateHeldBall(ball);
            } else {
                this.updateFreeBall(ball);
            }
        }
    }

    /**
     * Per-frame render: clear, draw HUD, draw balls, draw cursor markers.
     */
    render() {
        BT.clear(C_BG);

        this.renderHUD();
        this.renderBalls();
        this.renderCursors();
    }

    // #endregion

    // #region Grab and Throw

    /**
     * Attempts to grab a ball whose centre is under this slot's pointer.
     * Skips if no live pointer, or pointer is inside the HUD strip, or if
     * this slot is already holding a ball.
     */
    tryGrab(slot) {
        if (!BT.pointerPosValid(slot)) {
            return;
        }

        const pos = BT.pointerPos(slot);

        // Don't try to grab through the HUD - the press at HUD level is a
        // miss-click rather than a deliberate grab.
        if (pos.y < HUD_HEIGHT) {
            return;
        }

        // If this slot is already holding something, leave it alone.
        for (const ball of this.balls) {
            if (ball.grabbedBy === slot) {
                return;
            }
        }

        // Find the topmost ball whose disc covers the pointer. Iterating in
        // reverse so the visually-topmost ball wins when balls overlap.
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];

            if (ball.grabbedBy !== -1) {
                continue;
            }

            const dx = ball.x - pos.x;
            const dy = ball.y - pos.y;

            if (dx * dx + dy * dy <= BALL_RADIUS * BALL_RADIUS) {
                ball.grabbedBy = slot;
                ball.vx = 0;
                ball.vy = 0;
                return;
            }
        }
    }

    /**
     * Releases whatever ball this slot is holding, launching it with the
     * pointer's release-frame velocity (scaled and clamped to MAX_THROW_SPEED).
     */
    tryThrow(slot) {
        for (const ball of this.balls) {
            if (ball.grabbedBy !== slot) {
                continue;
            }

            // BT.pointerDelta is the movement during the most recent tick,
            // which is approximately velocity in px/tick. We can use it
            // directly as launch velocity (with a small scale factor).
            const delta = BT.pointerDelta(slot);
            let vx = delta.x * THROW_SCALE;
            let vy = delta.y * THROW_SCALE;

            // Clamp the launch speed so a frantic flick can't escape the box.
            const speed = Math.hypot(vx, vy);
            if (speed > MAX_THROW_SPEED) {
                const k = MAX_THROW_SPEED / speed;
                vx *= k;
                vy *= k;
            }

            ball.vx = vx;
            ball.vy = vy;
            ball.grabbedBy = -1;
            return;
        }
    }

    // #endregion

    // #region Physics

    /**
     * Snaps a held ball to its owning pointer's position. If the pointer
     * went invalid mid-grab (pointer left the canvas, touch cancelled) we
     * release the ball gently with zero velocity.
     */
    updateHeldBall(ball) {
        const slot = ball.grabbedBy;

        if (!BT.pointerPosValid(slot)) {
            // Pointer disappeared - drop the ball where it is.
            ball.grabbedBy = -1;
            ball.vx = 0;
            ball.vy = 0;
            return;
        }

        const pos = BT.pointerPos(slot);
        ball.x = pos.x;
        ball.y = pos.y;
    }

    /**
     * Integrates one tick of physics for a free ball: gravity, air drag,
     * floor friction, and wall bounces with damping.
     */
    updateFreeBall(ball) {
        // Gravity pulls the ball down each tick.
        ball.vy += GRAVITY;

        // Gentle air drag on both axes.
        ball.vx *= AIR_DRAG;
        ball.vy *= AIR_DRAG;

        // Integrate position.
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Bounce off walls. The HUD strip at the top acts as the ceiling.
        if (ball.x - BALL_RADIUS < 0) {
            ball.x = BALL_RADIUS;
            ball.vx = -ball.vx * WALL_DAMPING;
        } else if (ball.x + BALL_RADIUS > DISPLAY_W) {
            ball.x = DISPLAY_W - BALL_RADIUS;
            ball.vx = -ball.vx * WALL_DAMPING;
        }

        if (ball.y - BALL_RADIUS < HUD_HEIGHT) {
            ball.y = HUD_HEIGHT + BALL_RADIUS;
            ball.vy = -ball.vy * WALL_DAMPING;
        } else if (ball.y + BALL_RADIUS > DISPLAY_H) {
            ball.y = DISPLAY_H - BALL_RADIUS;
            ball.vy = -ball.vy * WALL_DAMPING;

            // Touching the floor: scrub a little horizontal speed so balls
            // come to rest after a few rolls.
            ball.vx *= FLOOR_FRICTION;
        }

        // Snap negligible velocities to zero so balls truly stop instead of
        // creeping forever.
        if (Math.abs(ball.vx) < MIN_SPEED) {
            ball.vx = 0;
        }
        if (Math.abs(ball.vy) < MIN_SPEED) {
            ball.vy = 0;
        }
    }

    // #endregion

    // #region Rendering

    /**
     * Top status strip with the title and per-slot indicators.
     */
    renderHUD() {
        BT.drawRectFill(new Rect2i(0, 0, DISPLAY_W, HUD_HEIGHT), C_PANEL);
        BT.drawRect(new Rect2i(0, 0, DISPLAY_W, HUD_HEIGHT), C_PANEL_BORDER);
        BT.systemPrint(new Vector2i(4, 3), C_TEXT, 'Drag a ball, release to flick.');

        // Per-slot indicator: a tiny circle in the top-right that lights up
        // while that slot is grabbing a ball.
        const labels = ['M', 'T1', 'T2', 'T3'];

        for (let slot = 0; slot < 4; slot++) {
            const grabbing = this.balls.some((b) => b.grabbedBy === slot);
            const x = DISPLAY_W - 64 + slot * 16;
            const y = 12;

            const indicator = new Rect2i(x - 3, y - 3, 7, 7);
            if (grabbing) {
                BT.drawRectFill(indicator, C_BALL_OUTLINE);
            } else {
                BT.drawRect(indicator, C_PANEL_BORDER);
            }

            BT.systemPrint(new Vector2i(x - 4, y + 5), grabbing ? C_TEXT : C_DIM, labels[slot]);
        }
    }

    /**
     * Draws each ball as a filled disc. Highlights the ball under the mouse
     * (for hover feedback) and outlines any ball currently grabbed.
     */
    renderBalls() {
        // Determine which ball, if any, the mouse is currently hovering over.
        // We only do this for the mouse (slot 0) since touch slots only have
        // a position while in contact (which means they're already grabbing).
        const mousePos = BT.pointerPosValid(0) ? BT.pointerPos(0) : null;
        let hoverIndex = -1;

        if (mousePos !== null && mousePos.y >= HUD_HEIGHT) {
            for (let i = this.balls.length - 1; i >= 0; i--) {
                const ball = this.balls[i];
                const dx = ball.x - mousePos.x;
                const dy = ball.y - mousePos.y;
                if (dx * dx + dy * dy <= BALL_RADIUS * BALL_RADIUS) {
                    hoverIndex = i;
                    break;
                }
            }
        }

        for (let i = 0; i < this.balls.length; i++) {
            const ball = this.balls[i];
            this.drawDisc(Math.round(ball.x), Math.round(ball.y), BALL_RADIUS, ball.color);

            if (ball.grabbedBy !== -1) {
                // Outline grabbed balls so you can tell which slot owns each.
                this.drawCircle(Math.round(ball.x), Math.round(ball.y), BALL_RADIUS + 1, C_BALL_OUTLINE);
            } else if (i === hoverIndex) {
                // Hover highlight: a thin amber ring on the topmost free ball
                // under the mouse cursor.
                this.drawCircle(Math.round(ball.x), Math.round(ball.y), BALL_RADIUS + 1, C_BALL_HIGHLIGHT);
            }
        }
    }

    /**
     * Small crosshair at every active pointer position so users can see where
     * each finger / mouse currently is.
     */
    renderCursors() {
        for (let slot = 0; slot < 4; slot++) {
            if (!BT.pointerPosValid(slot)) {
                continue;
            }

            const pos = BT.pointerPos(slot);
            BT.drawLine(new Vector2i(pos.x - 4, pos.y), new Vector2i(pos.x + 4, pos.y), C_TEXT);
            BT.drawLine(new Vector2i(pos.x, pos.y - 4), new Vector2i(pos.x, pos.y + 4), C_TEXT);
        }
    }

    // #endregion

    // #region Drawing Primitives Helpers

    /**
     * Filled disc using a midpoint-style scan: for each row in the bounding
     * box, draw a horizontal line of pixels covered by the circle equation.
     * Cheaper than per-pixel testing and produces clean edges at this scale.
     */
    drawDisc(cx, cy, r, color) {
        const r2 = r * r;
        for (let dy = -r; dy <= r; dy++) {
            // Width of the row at this y, derived from x² + y² <= r².
            const dx = Math.floor(Math.sqrt(r2 - dy * dy));
            BT.drawLine(new Vector2i(cx - dx, cy + dy), new Vector2i(cx + dx, cy + dy), color);
        }
    }

    /**
     * Hollow circle outline (Bresenham midpoint algorithm). Used to ring the
     * grabbed and hovered balls without splatting a full disc on top.
     */
    drawCircle(cx, cy, r, color) {
        let x = r;
        let y = 0;
        let err = 0;

        while (x >= y) {
            BT.drawPixel(new Vector2i(cx + x, cy + y), color);
            BT.drawPixel(new Vector2i(cx + y, cy + x), color);
            BT.drawPixel(new Vector2i(cx - y, cy + x), color);
            BT.drawPixel(new Vector2i(cx - x, cy + y), color);
            BT.drawPixel(new Vector2i(cx - x, cy - y), color);
            BT.drawPixel(new Vector2i(cx - y, cy - x), color);
            BT.drawPixel(new Vector2i(cx + y, cy - x), color);
            BT.drawPixel(new Vector2i(cx + x, cy - y), color);

            y += 1;
            err += 1 + 2 * y;
            if (2 * (err - x) + 1 > 0) {
                x -= 1;
                err += 1 - 2 * x;
            }
        }
    }

    // #endregion
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
